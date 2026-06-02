// ============================================================
// PlaybackEngine — 统一音频播放引擎（在 React 之外运行）
//
// 设计原则（来自 web.dev / MDN 最佳实践）：
// - 引擎是 class 实例，存储在 useRef 中
// - 所有播放状态是引擎实例属性，不通过 React state 管理
// - 引擎通过 onUpdate 回调单向推送显示数据到 React
// - setInterval + audioContext.currentTime 预调度（行业金标准）
// ============================================================
import type { TimelineItem, SoundType, Phase, ExcitementPoint } from '../types';
import {
  synthesizeTick, synthesizeWoodblock, synthesizeHeartbeat,
  synthesizeWaterdrop, synthesizeFingertap, synthesizeBassdrum,
  synthesizeExcitementDing,
} from '../audio/sounds';
import { BPM_BOOST_DURATION, BPM_BOOST_AMOUNT } from '../compiler/rules';

// ---- 显示状态（引擎推送给 React） ----
export interface EngineDisplayState {
  actionName: string;
  actionRemainingMs: number;
  totalElapsedMs: number;
  phase: Phase;
  isPaused: boolean;
}

export type EngineUpdateCallback = (state: EngineDisplayState) => void;

// 动作 → 语音文件名（精简版 7 个）
const VOICE_MAP: Record<string, string> = {
  '捏住并旋转': '捏住并旋转.wav',
  '提拉然后松手': '提拉然后松手.wav',
  '上下刮擦': '上下刮擦.wav',
  '左右捏住然后松开': '左右捏住然后松开.wav',
  '指腹摩擦': '指腹摩擦.wav',
  '周围区域摩擦': '周围区域摩擦.wav',
  '反复点按': '反复点按.wav',
};

const BASE = import.meta.env.BASE_URL || '/';

const LOOK_AHEAD_MS = 200;
const SCHEDULE_INTERVAL_MS = 50;

export class PlaybackEngine {
  // ---- 公开状态（React 只读） ----
  isRunning = false;
  isPaused = false;
  totalElapsedMs = 0;

  // ---- 内部 ----
  private ctx: AudioContext | null = null;
  private beatBuffers = new Map<SoundType, AudioBuffer>();
  private signalBuffers = new Map<string, AudioBuffer>();
  private voiceBuffers = new Map<string, AudioBuffer>();
  private snapBuffer: AudioBuffer | null = null;
  private excitementBuffer: AudioBuffer | null = null;
  private snapVolume = 1.0; // 0.0–1.0，可由外部设置
  private initialized = false;

  private timeline: TimelineItem[] = [];
  private startTime = 0;
  private pausedAt: number | null = null;
  private elapsedBeforePause = 0;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private scheduledBeats = new Set<number>();
  private lastVoiceKey = '';
  private voiceEndTime = 0;

  // ---- 响指独立音轨（预渲染一条 AudioBuffer，整条播放，不依赖 JS 轮询）----
  private snapTrackSource: AudioBufferSourceNode | null = null;
  private snapTrackBuffer: AudioBuffer | null = null;
  private snapTrackGain: GainNode | null = null;
  private snapTrackStartCtxTime = 0; // 音轨 source.start() 时的 ctx.currentTime
  private snapTrackOffsetSec = 0;    // 音轨在 buffer 内的起始偏移（秒）

  private currentActionName = '';
  private currentPhase: Phase = 'warmup';
  private currentBpm = 0;
  private excitementPoints: ExcitementPoint[] = [];
  private onUpdate: EngineUpdateCallback | null = null;
  private onFinished: (() => void) | null = null;
  private onBeatCallback?: () => void;

  // ---- 初始化 ----

  /** 必须在用户手势中调用（移动端 AudioContext 限制） */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.ctx = new AudioContext({ sampleRate: 44100 });

    // 合成节拍音
    this.beatBuffers.set('tick', synthesizeTick());
    this.beatBuffers.set('woodblock', synthesizeWoodblock());
    this.beatBuffers.set('heartbeat', synthesizeHeartbeat());
    this.beatBuffers.set('waterdrop', synthesizeWaterdrop());
    this.beatBuffers.set('fingertap', synthesizeFingertap());
    this.beatBuffers.set('bassdrum', synthesizeBassdrum());

    // 合成信号音
    this.signalBuffers.set('single_ding', this.makeDing(1));
    this.signalBuffers.set('double_ding', this.makeDing(2));
    this.signalBuffers.set('heavy_beats', this.makeHeavyBeat());

    // 合成打响指音效 → 改为异步加载真实音频
    // (在 init 末尾 loadSnap() 中加载)

    // 合成主观狂热微振风铃音
    this.excitementBuffer = synthesizeExcitementDing();

    // 预加载语音 + 响指音频（全部 await 确保 ready 后再播放）
    // 注意：initialized 必须放在 await 之后，避免 start() 在 snapBuffer/voices 还未就绪时跑
    await Promise.all([this.loadVoices(), this.loadSnap()]);
    this.initialized = true;
  }

  /** 异步加载响指 MP3 */
  private async loadSnap(): Promise<void> {
    if (!this.ctx) { console.log('[Engine] loadSnap: ctx 为空'); return; }
    try {
      const base = import.meta.env.BASE_URL || '/';
      const url = `${base}snap.mp3`;
      console.log(`[Engine] loadSnap: 加载 ${url}`);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const arrayBuf = await resp.arrayBuffer();
      console.log(`[Engine] loadSnap: 下载 ${arrayBuf.byteLength} 字节`);
      this.snapBuffer = await this.ctx.decodeAudioData(arrayBuf);
      console.log(`[Engine] loadSnap: 解码成功, ${this.snapBuffer.duration.toFixed(2)}s`);
    } catch (e) {
      console.warn('[Engine] loadSnap: 加载失败，回退合成', e);
      this.snapBuffer = this.makeSnap();
      console.log(`[Engine] loadSnap: 合成回退 ${this.snapBuffer.duration.toFixed(2)}s`);
    }
  }

  // ---- 响指独立音轨：预渲染 + 单条 BufferSource 播放 ----

  /**
   * 把整条 timeline 长度渲染成一条 AudioBuffer：
   * 在每个 snap 触发时刻将 snap.mp3 的 PCM 样本叠加写入。
   * 播放时只需一条 BufferSource 即可，时序由 AudioContext 高精度时钟驱动。
   */
  private buildSnapTrack(timeline: TimelineItem[]): AudioBuffer | null {
    if (!this.ctx) { console.warn('[SnapTrack] build: ctx 为空'); return null; }
    if (!this.snapBuffer) { console.warn('[SnapTrack] build: snapBuffer 为空（可能 loadSnap 失败/未完成）'); return null; }
    const sr = this.ctx.sampleRate;
    let totalMs = 0;
    let snapCount = 0;
    for (const item of timeline) {
      if (item.type === 'action' || item.type === 'rest') totalMs += item.duration;
      if (item.type === 'snap') snapCount++;
    }
    // 加 2s 尾巴防止 snap 末尾被裁
    const totalSamples = Math.ceil((totalMs + 2000) * sr / 1000);
    console.log(`[SnapTrack] build: snapBuffer=${this.snapBuffer.duration.toFixed(2)}s@${this.snapBuffer.sampleRate}Hz, snapCount=${snapCount}, totalMs=${totalMs}, totalSamples=${totalSamples} (${(totalSamples * 4 / 1024 / 1024).toFixed(1)}MB), ctxSR=${sr}`);
    const buffer = this.ctx.createBuffer(1, totalSamples, sr);
    const data = buffer.getChannelData(0);

    let accMs = 0;
    const snapData = this.snapBuffer.getChannelData(0);
    const snapLen = snapData.length;
    for (const item of timeline) {
      if (item.type === 'snap') {
        const startSample = Math.floor((accMs * sr) / 1000);
        const endSample = Math.min(startSample + snapLen, data.length);
        for (let i = 0; i < endSample - startSample; i++) {
          data[startSample + i] = snapData[i];
        }
      }
      if (item.type === 'action' || item.type === 'rest') {
        accMs += item.duration;
      }
    }
    // 校验：抽样检测前 3 个 snap 位置是否真的写入了非零数据
    let accMs2 = 0;
    let samplesChecked = 0;
    let nonZeroFound = 0;
    for (const item of timeline) {
      if (item.type === 'snap' && samplesChecked < 3) {
        const startSample = Math.floor((accMs2 * sr) / 1000);
        const probe = data[startSample] ?? 0;
        console.log(`[SnapTrack] build: snap#${samplesChecked + 1} at accMs=${accMs2} sample=${startSample} firstSample=${probe.toFixed(4)}`);
        nonZeroFound += Math.abs(probe) > 0.001 ? 1 : 0;
        samplesChecked++;
      }
      if (item.type === 'action' || item.type === 'rest') accMs2 += item.duration;
    }
    console.log(`[SnapTrack] build: ${nonZeroFound}/${samplesChecked} 抽样位置数据非零`);
    return buffer;
  }

  /** 启动响指音轨（从 snapTrackOffsetSec 处开始） */
  private startSnapTrack(): void {
    if (!this.ctx) { console.warn('[SnapTrack] start: ctx 为空'); return; }
    if (!this.snapTrackBuffer) { console.warn('[SnapTrack] start: snapTrackBuffer 为空（build 可能未跑或失败）'); return; }
    // 若已存在先停掉
    this.stopSnapTrack();
    const src = this.ctx.createBufferSource();
    src.buffer = this.snapTrackBuffer;
    const gain = this.ctx.createGain();
    gain.gain.value = this.snapVolume;
    src.connect(gain).connect(this.ctx.destination);
    this.snapTrackSource = src;
    this.snapTrackGain = gain;
    this.snapTrackStartCtxTime = this.ctx.currentTime;
    // clamp 偏移到 buffer 范围内
    const offset = Math.max(0, Math.min(this.snapTrackBuffer.duration, this.snapTrackOffsetSec));
    src.start(this.ctx.currentTime, offset);
    console.log(`[SnapTrack] start: bufferDur=${this.snapTrackBuffer.duration.toFixed(2)}s, offset=${offset.toFixed(3)}s, ctxState=${this.ctx.state}, gain=${this.snapVolume}`);
  }

  /** 停止响指音轨，并把当前播放位置记到 snapTrackOffsetSec 供下次启动使用 */
  private stopSnapTrack(): void {
    if (!this.ctx) {
      this.snapTrackSource = null;
      this.snapTrackGain = null;
      return;
    }
    if (this.snapTrackSource) {
      // 记录当前播放位置（秒）作为下次启动的偏移
      const elapsed = this.ctx.currentTime - this.snapTrackStartCtxTime;
      this.snapTrackOffsetSec = Math.max(0, this.snapTrackOffsetSec + elapsed);
      try { this.snapTrackSource.stop(); } catch {}
      try { this.snapTrackSource.disconnect(); } catch {}
      this.snapTrackSource = null;
    }
    if (this.snapTrackGain) {
      try { this.snapTrackGain.disconnect(); } catch {}
      this.snapTrackGain = null;
    }
  }

  /** 当 timeline 整体替换时（主观高潮 / 余韵），重建响指音轨并保持当前播放位置 */
  private rebuildSnapTrack(): void {
    if (!this.ctx) return;
    // 先记录当前播放偏移
    if (this.snapTrackSource) {
      const elapsed = this.ctx.currentTime - this.snapTrackStartCtxTime;
      this.snapTrackOffsetSec = Math.max(0, this.snapTrackOffsetSec + elapsed);
    }
    this.stopSnapTrack();
    this.snapTrackBuffer = this.buildSnapTrack(this.timeline);
    if (this.snapTrackBuffer) this.startSnapTrack();
  }

  /** 注册 UI 更新回调 */
  setOnUpdate(cb: EngineUpdateCallback): void {
    this.onUpdate = cb;
  }

  /** 注册播放结束回调 */
  setOnFinished(cb: () => void): void {
    this.onFinished = cb;
  }

  /** 注册节拍回调（每次 beat 时触发） */
  setOnBeat(cb: () => void): void {
    this.onBeatCallback = cb;
  }

  // ---- 播放控制 ----

  start(timeline: TimelineItem[]): void {
    if (!this.ctx || !this.initialized) return;
    this.ctx.resume().catch(() => {});

    this.timeline = timeline;
    this.isRunning = true;
    this.isPaused = false;
    this.totalElapsedMs = 0;
    this.pausedAt = null;
    this.elapsedBeforePause = 0;
    this.scheduledBeats.clear();
    this.excitementPoints = [];
    this.lastVoiceKey = '';
    this.voiceEndTime = 0;
    this.startTime = this.ctx.currentTime;

    // 启动响指独立音轨（从 0 偏移开始）
    this.snapTrackBuffer = this.buildSnapTrack(timeline);
    this.snapTrackOffsetSec = 0;
    console.log(`[SnapTrack] start入口: snapBuffer=${this.snapBuffer ? 'OK' : 'NULL'}, snapTrackBuffer=${this.snapTrackBuffer ? 'OK' : 'NULL'}, ctxState=${this.ctx.state}`);
    this.startSnapTrack();

    this.scheduleLoop();
    this.timerId = setInterval(() => this.scheduleLoop(), SCHEDULE_INTERVAL_MS);
    this.setupMediaSession();
  }

  pause(): void {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    if (!this.ctx) return;
    this.pausedAt = this.ctx.currentTime;
    this.elapsedBeforePause = this.pausedAt - this.startTime;
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
    // 暂停响指音轨（记录当前位置）
    this.stopSnapTrack();
    this.emitUpdate();
  }

  resume(): void {
    if (!this.isPaused || this.pausedAt === null || !this.ctx) return;
    this.isPaused = false;
    this.startTime = this.ctx.currentTime - this.elapsedBeforePause;
    this.pausedAt = null;
    // 恢复响指音轨（从记录的偏移继续）
    this.startSnapTrack();
    this.scheduleLoop();
    this.timerId = setInterval(() => this.scheduleLoop(), SCHEDULE_INTERVAL_MS);
    this.emitUpdate();
  }

  seek(targetMs: number): void {
    if (!this.ctx) return;
    const wasPaused = this.isPaused;
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
    this.scheduledBeats.clear();
    this.lastVoiceKey = '';
    this.voiceEndTime = 0;
    this.startTime = this.ctx.currentTime - targetMs / 1000;
    this.elapsedBeforePause = 0;
    this.pausedAt = null;
    this.isPaused = false;
    this.isRunning = true;
    // 重置响指音轨到目标位置
    this.stopSnapTrack();
    this.snapTrackOffsetSec = Math.max(0, targetMs / 1000);
    this.startSnapTrack();
    this.scheduleLoop();
    this.timerId = setInterval(() => this.scheduleLoop(), SCHEDULE_INTERVAL_MS);
    if (wasPaused) {
      this.pause();
    }
  }

  stop(): void {
    this.isRunning = false;
    this.isPaused = false;
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
    this.scheduledBeats.clear();
    this.stopSnapTrack();
  }

  destroy(): void {
    this.stop();
    this.teardownMediaSession();
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
    this.beatBuffers.clear();
    this.signalBuffers.clear();
    this.voiceBuffers.clear();
    this.snapTrackBuffer = null;
    this.initialized = false;
  }

  get elapsed(): number {
    if (!this.ctx) return 0;
    if (this.isPaused) return this.elapsedBeforePause * 1000;
    if (!this.isRunning) return 0;
    return (this.ctx.currentTime - this.startTime) * 1000;
  }

  // ---- 调度循环 ----

  private scheduleLoop(): void {
    if (!this.isRunning || this.isPaused || !this.ctx) return;
    const now = this.ctx.currentTime;
    const elapsedMs = (now - this.startTime) * 1000;
    this.totalElapsedMs = elapsedMs;

    let accumulatedMs = 0;
    let foundCurrent = false;

    for (let ti = 0; ti < this.timeline.length; ti++) {
      const item = this.timeline[ti];
      if (item.type === 'end') {
        if (elapsedMs >= accumulatedMs) {
          this.isRunning = false;
          if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
          this.emitUpdate();
          if (this.onFinished) {
            this.onFinished();
          }
        }
        return;
      }

      const dur = item.type === 'action' || item.type === 'rest' ? item.duration : 0;
      const itemEnd = accumulatedMs + dur;

      if (elapsedMs >= accumulatedMs && elapsedMs < itemEnd && !foundCurrent) {
        foundCurrent = true;
        const remainingMs = itemEnd - elapsedMs;

        if (item.type === 'action') {
          this.currentActionName = item.name;
          this.currentPhase = item.phase;
          this.currentBpm = item.bpm;

          // 语音
          const voiceKey = `a_${accumulatedMs}`;
          if (voiceKey !== this.lastVoiceKey) {
            this.lastVoiceKey = voiceKey;
            const vdur = this.playVoice(item.name);
            this.voiceEndTime = now + vdur;
          }
        } else if (item.type === 'rest') {
          this.currentActionName = '休息中';

          const voiceKey = `r_${accumulatedMs}`;
          if (voiceKey !== this.lastVoiceKey) {
            this.lastVoiceKey = voiceKey;
            const vdur = this.playVoice('休息中');
            this.voiceEndTime = now + vdur;
          }
        }

        // 推送给 React
        this.emitUpdateWith(remainingMs);
      }

      // 安排节拍
      if (item.type === 'action' && itemEnd > elapsedMs) {
        this.scheduleBeats(item, accumulatedMs, itemEnd);
      }

      // 安排信号
      if (item.type === 'transition') {
        const signalTime = this.startTime + accumulatedMs / 1000;
        if (signalTime > now && signalTime < now + LOOK_AHEAD_MS / 1000) {
          this.playSignal(item.signal, signalTime);
        }
      }

      if (item.type === 'action' || item.type === 'rest') {
        accumulatedMs += item.duration;
      }
    }
  }

  private scheduleBeats(
    item: Extract<TimelineItem, { type: 'action' }>,
    offsetMs: number,
    endMs: number,
  ): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bpm = item.bpm;
    const intervalMs = 60000 / bpm;
    const boostStart = endMs - BPM_BOOST_DURATION;

    for (let t = offsetMs; t < endMs; t += intervalMs) {
      let actualInterval = intervalMs;
      if (t >= boostStart) {
        actualInterval = 60000 / (bpm + BPM_BOOST_AMOUNT);
      }

      const absTime = this.startTime + t / 1000;

      // 语音期间不排节拍
      if (absTime < this.voiceEndTime) {
        if (t >= boostStart) t += actualInterval - intervalMs;
        continue;
      }

      const key = Math.round(absTime * 1000);
      if (absTime > now && absTime < now + LOOK_AHEAD_MS / 1000) {
        if (!this.scheduledBeats.has(key)) {
          this.scheduledBeats.add(key);
          this.playBeat(item.sound, absTime, item.volume);
        }
      }

      if (t >= boostStart) t += actualInterval - intervalMs;
    }
  }

  // ---- 音频播放 ----

  private playBeat(sound: SoundType, when: number, volume: number): void {
    if (!this.ctx) return;
    const buf = this.beatBuffers.get(sound);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.ctx.destination);
    src.start(when);
    // 触发节拍回调（用于视觉同步）
    this.onBeatCallback?.();
  }

  private playSignal(signal: string, when: number): void {
    if (!this.ctx) return;
    const buf = this.signalBuffers.get(signal);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    src.start(when);
  }

  private playVoice(actionName: string): number {
    if (!this.ctx) return 0;
    const buf = this.voiceBuffers.get(actionName);
    if (!buf) return 0;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    const t = this.ctx.currentTime + 0.01;
    src.start(t);
    return buf.duration;
  }

  // ---- 语音加载 ----

  private async loadVoices(): Promise<void> {
    if (!this.ctx) return;
    const names = Object.keys(VOICE_MAP);
    await Promise.allSettled(
      names.map(async (name) => {
        try {
          const url = `${BASE}voices/${encodeURIComponent(VOICE_MAP[name])}`;
          const resp = await fetch(url);
          if (!resp.ok) return;
          const buf = await resp.arrayBuffer();
          const audioBuf = await this.ctx!.decodeAudioData(buf);
          this.voiceBuffers.set(name, audioBuf);
        } catch { /* skip */ }
      })
    );
  }

  // ---- 通知 React ----

  private emitUpdateWith(actionRemainingMs: number): void {
    if (!this.onUpdate) return;
    this.onUpdate({
      actionName: this.currentActionName,
      actionRemainingMs,
      totalElapsedMs: this.totalElapsedMs,
      phase: this.currentPhase,
      isPaused: this.isPaused,
    });
  }

  private emitUpdate(): void {
    if (!this.onUpdate) return;
    this.onUpdate({
      actionName: this.currentActionName || '准备中',
      actionRemainingMs: 0,
      totalElapsedMs: this.totalElapsedMs,
      phase: this.currentPhase,
      isPaused: this.isPaused,
    });
  }

  // ---- 信号音合成 ----

  private makeDing(count: 1 | 2): AudioBuffer {
    const sr = 44100;
    const dingLen = Math.ceil(0.3 * sr);
    const gapLen = Math.ceil(0.2 * sr);
    const total = count === 1 ? dingLen : dingLen + gapLen + dingLen;
    const buf = new AudioBuffer({ length: total, sampleRate: sr });
    const ch = buf.getChannelData(0);
    for (let i = 0; i < dingLen; i++) {
      const t = i / sr;
      const env = Math.exp(-t / 0.08);
      ch[i] = 0.4 * Math.sin(2 * Math.PI * 1200 * t) * env
        + 0.15 * Math.sin(2 * Math.PI * 2400 * t) * env;
    }
    if (count === 2) {
      const off = dingLen + gapLen;
      for (let i = 0; i < dingLen; i++) {
        const t = i / sr;
        ch[off + i] = 0.5 * Math.sin(2 * Math.PI * 1400 * t) * Math.exp(-t / 0.05);
      }
    }
    return buf;
  }

  private makeHeavyBeat(): AudioBuffer {
    const sr = 44100;
    const len = Math.ceil(0.8 * sr);
    const buf = new AudioBuffer({ length: len, sampleRate: sr });
    const ch = buf.getChannelData(0);
    for (let beat = 0; beat < 2; beat++) {
      const off = beat * Math.ceil(0.3 * sr);
      for (let i = 0; i < Math.ceil(0.3 * sr); i++) {
        const t = i / sr;
        const val = 0.6 * Math.sin(2 * Math.PI * (100 * Math.exp(-t * 8) + 30) * t) * Math.exp(-t / 0.1);
        if (off + i < len) ch[off + i] = val;
      }
    }
    return buf;
  }

  /** 合成响指回退（仅当 snap.mp3 加载失败时使用） */
  private makeSnap(): AudioBuffer {
    const sr = 44100;
    const len = Math.ceil(0.06 * sr);
    const buf = new AudioBuffer({ length: len, sampleRate: sr });
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      ch[i] = (Math.random() * 2 - 1) * 0.9 * Math.min(1, t / 0.001) * Math.exp(-t / 0.01);
    }
    return buf;
  }

  /** 设置响指音量 (0.0–1.0) */
  setSnapVolume(v: number): void {
    this.snapVolume = Math.max(0, Math.min(1, v));
    if (this.snapTrackGain) {
      this.snapTrackGain.gain.value = this.snapVolume;
    }
  }

  /** 播放打响指 */
  playSnap(): void {
    console.log(`[playSnap] ctx=${!!this.ctx} snapBuffer=${!!this.snapBuffer} snapVolume=${this.snapVolume} ctxState=${this.ctx?.state}`);
    if (!this.ctx || !this.snapBuffer) return;
    // 强制恢复 AudioContext（iOS 可能在不交互时挂起）
    this.ctx.resume().catch(() => {});
    const src = this.ctx.createBufferSource();
    src.buffer = this.snapBuffer;
    const gain = this.ctx.createGain();
    gain.gain.value = this.snapVolume;
    src.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(0);
    console.log(`[playSnap] src.start(0) called, bufferDuration=${this.snapBuffer.duration.toFixed(2)}s`);
  }

  /** 播放主观打点风铃音 */
  playExcitementDing(): void {
    if (!this.ctx || !this.excitementBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.excitementBuffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.8;
    src.connect(gain).connect(this.ctx.destination);
    src.start(this.ctx.currentTime);
  }

  /** 盲操打点收集器：播放微振风铃音并返回当前耗时，同时录入完整打点上下文 */
  recordExcitement(actionName: string): number {
    this.playExcitementDing();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([20, 40, 20]);
    }
    this.excitementPoints.push({
      elapsedMs: this.totalElapsedMs,
      actionName,
      phase: this.currentPhase,
      bpm: this.currentBpm || 60,
    });
    return this.totalElapsedMs;
  }

  /** 获取本次播放所有实录打点数据 */
  getExcitementPoints(): ExcitementPoint[] {
    return [...this.excitementPoints];
  }

  /** 获取最近一次打点的完整信息（供 UI 即时推送到 Zustand） */
  getLastExcitementPoint(): ExcitementPoint | null {
    if (this.excitementPoints.length === 0) return null;
    return { ...this.excitementPoints[this.excitementPoints.length - 1] };
  }

  /** 跃迁动态 timeline 重构：保留当前动作的已进行时长，截断后续，并追加冲刺高潮 */
  triggerSubjectiveClimax(actionName: string): void {
    if (!this.ctx || !this.isRunning) return;
    const elapsedMs = this.totalElapsedMs;
    this.scheduledBeats.clear(); // 清空旧的节拍
    this.lastVoiceKey = ''; // 允许重新播放动作提示

    // 1. 保留当前时间点前的所有timeline内容，并精确截断当前正在进行的动作
    let accumulatedMs = 0;
    const newTimeline: TimelineItem[] = [];

    for (const item of this.timeline) {
      if (item.type === 'end') break;
      const dur = item.type === 'action' || item.type === 'rest' ? item.duration : 0;
      if (accumulatedMs + dur <= elapsedMs) {
        newTimeline.push(item);
        accumulatedMs += dur;
      } else {
        // 方案 A（精确截断保留）：落入当前区间的动作项目，计算已进行的时长
        if ((item.type === 'action' || item.type === 'rest') && elapsedMs > accumulatedMs) {
          const elapsedInItem = elapsedMs - accumulatedMs;
          if (elapsedInItem > 0) {
            newTimeline.push({
              ...item,
              duration: elapsedInItem
            } as TimelineItem);
            accumulatedMs += elapsedInItem;
          }
        }
        break; // 掐断后续
      }
    }

    // 2. 插入重鼓过渡音
    newTimeline.push({
      type: 'transition',
      signal: 'heavy_beats',
      phase: 'climax'
    });

    // 3. 动态追加无限高潮刺激（12小时 43,200,000 ms）
    newTimeline.push({
      type: 'action',
      name: actionName,
      duration: 43200000,
      bpm: 135,
      sound: 'bassdrum',
      volume: 1.0,
      phase: 'climax'
    });

    newTimeline.push({ type: 'end' });
    this.timeline = newTimeline;

    // 重建响指音轨以匹配新 timeline，并保持当前播放位置
    this.rebuildSnapTrack();

    // 震动保护
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
  }

  /** 动态释放进入终局：保留当前动作已进行时长，截弯取直流畅拼装冷静冷静冷静冷静终局三部曲 */
  triggerReleaseAfterglow(afterglowActionName: string): void {
    if (!this.ctx || !this.isRunning) return;
    const elapsedMs = this.totalElapsedMs;
    this.scheduledBeats.clear();
    this.lastVoiceKey = '';

    // 1. 保留当前时间点前的timeline内容并精确截断当前正在进行的无限高潮动作
    let accumulatedMs = 0;
    const newTimeline: TimelineItem[] = [];

    for (const item of this.timeline) {
      if (item.type === 'end') break;
      const dur = item.type === 'action' || item.type === 'rest' ? item.duration : 0;
      if (accumulatedMs + dur <= elapsedMs) {
        newTimeline.push(item);
        accumulatedMs += dur;
      } else {
        // 对于当前正在经历的高潮动作进行强行截断，保留之前跑过的时间
        if ((item.type === 'action' || item.type === 'rest') && elapsedMs > accumulatedMs) {
          const elapsedInItem = elapsedMs - accumulatedMs;
          if (elapsedInItem > 0) {
            newTimeline.push({
              ...item,
              duration: elapsedInItem
            } as TimelineItem);
            accumulatedMs += elapsedInItem;
          }
        }
        break;
      }
    }

    // 2. 无缝追加终局三部曲：余韵 1分钟 + 收尾 15秒 + 着陆 30秒
    // 2.1 余韵
    newTimeline.push({
      type: 'action',
      name: afterglowActionName,
      duration: 60 * 1000,
      bpm: 120,
      sound: 'heartbeat',
      volume: 0.9,
      phase: 'afterglow'
    });

    // 2.2 收尾
    newTimeline.push({
      type: 'action',
      name: '收尾缓冲',
      duration: 15 * 1000,
      bpm: 20, // 3秒一个单拍
      sound: 'tick',
      volume: 0.7,
      phase: 'cooldown'
    });

    // 2.3 静静着陆标记 (静音着陆30秒)
    newTimeline.push({
      type: 'action',
      name: '静默着陆中',
      duration: 30 * 1000,
      bpm: 1, // 不打节拍
      sound: 'fingertap',
      volume: 0,
      phase: 'landing'
    });

    newTimeline.push({ type: 'end' });
    this.timeline = newTimeline;

    // 重建响指音轨以匹配新 timeline，并保持当前播放位置
    this.rebuildSnapTrack();

    // 震动保护
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([40, 200]);
    }
  }

  // ---- Media Session API 后台保活 ----

  /** 注册 Media Session，声明正在播放音频以保活后台线程 */
  private setupMediaSession(): void {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: '节奏按摩引导器',
      artist: 'Rhythm Guide',
      album: 'Session',
    });

    navigator.mediaSession.setActionHandler('play', () => this.resume());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.playbackState = 'playing';
  }

  private teardownMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = 'none';
    navigator.mediaSession.metadata = null;
  }
}
