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

/**
 * Mulberry32 — 轻量确定性 PRNG。同一 seed → 同一序列。
 * 用于响指随机时刻的可重现性：pause/resume 复用首次 seed，避免听感漂移。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
  private snapBuffer: AudioBuffer | null = null;       // snap 音源样本（~0.06s，来源：snap.mp3 或用户上传）
  private excitementBuffer: AudioBuffer | null = null;
  private snapVolume = 1.0;
  private initialized = false;

  private timeline: TimelineItem[] = [];
  private startTime = 0;
  private pausedAt: number | null = null;
  private elapsedBeforePause = 0;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private scheduledBeats = new Set<number>();
  private lastVoiceKey = '';
  private voiceEndTime = 0;

  // ---- 响指：一整条拼接音轨 — 静音打底 + snap 样本嵌入 → 单个 BufferSource 播到底 ----
  // 设计：一整条 AudioBuffer = timeline 全长。snap 样本直接复制到随机偏移。
  // 播放：单个 AudioBufferSourceNode，start(0, offsetSec) 从任意位置起播。
  // 暂停/恢复/seek：stop 旧源 → 从新偏移 start 新源。同一条 buffer 复用。
  // 内存：20min × 44100Hz × 4B × 1ch ≈ 212MB（用户接受“内存换稳定性”）。
  private snapTrackBuffer: AudioBuffer | null = null;          // 拼接后的整条响指轨
  private snapTrackSource: AudioBufferSourceNode | null = null; // 唯一播放源
  private snapGain: GainNode | null = null;                    // 响指音量节点

  // 响指配置：运行期由外部注入；启动时锁定 seed 保持 pause/resume 听感稳定
  private snapCounts: Record<Phase, number> = {
    warmup: 0, core: 0, sprint_start: 0, sprint_accel: 0, sprint_peak: 0,
    climax: 0, afterglow: 0, cooldown: 0, landing: 0,
  };
  private snapSeed: number | null = null;

  private currentActionName = '';
  private currentPhase: Phase = 'warmup';
  private currentBpm = 0;
  private excitementPoints: ExcitementPoint[] = [];
  private onUpdate: EngineUpdateCallback | null = null;
  private onFinished: (() => void) | null = null;
  private onBeatCallback?: () => void;

  // ---- 初始化 ----

  async init(): Promise<void> {
    if (this.initialized) return;
    this.ctx = new AudioContext({ sampleRate: 44100 });

    this.beatBuffers.set('tick', synthesizeTick());
    this.beatBuffers.set('woodblock', synthesizeWoodblock());
    this.beatBuffers.set('heartbeat', synthesizeHeartbeat());
    this.beatBuffers.set('waterdrop', synthesizeWaterdrop());
    this.beatBuffers.set('fingertap', synthesizeFingertap());
    this.beatBuffers.set('bassdrum', synthesizeBassdrum());

    this.signalBuffers.set('single_ding', this.makeDing(1));
    this.signalBuffers.set('double_ding', this.makeDing(2));
    this.signalBuffers.set('heavy_beats', this.makeHeavyBeat());

    this.excitementBuffer = synthesizeExcitementDing();

    await Promise.all([this.loadVoices(), this.loadDefaultSnap()]);
    this.initialized = true;
  }

  private async loadDefaultSnap(): Promise<void> {
    if (!this.ctx) return;
    try {
      const url = `${BASE}snap.mp3`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this.snapBuffer = await this.ctx.decodeAudioData(await resp.arrayBuffer());
    } catch (e) {
      console.warn('[Engine] snap.mp3 加载失败，使用合成回退', e);
      this.snapBuffer = this.makeSnap();
    }
  }

  // ================================================================
  // 响指子系统：一整条拼接音轨 + 单个 BufferSource
  // ================================================================

  /** 外部注入每阶段响指次数（Home 页配置） */
  setSnapConfig(counts: Record<Phase, number>): void {
    this.snapCounts = { ...counts };
    this.snapTrackBuffer = null; // 强制下次重建
  }

  /** 替换 snap 音源；null → 回退默认 snap.mp3 */
  async setSnapSource(buffer: AudioBuffer | null): Promise<void> {
    if (buffer) {
      this.snapBuffer = buffer;
    } else {
      if (!this.ctx) return;
      try {
        const resp = await fetch(`${BASE}snap.mp3`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        this.snapBuffer = await this.ctx.decodeAudioData(await resp.arrayBuffer());
      } catch (e) {
        console.warn('[Engine] setSnapSource(null) 失败，保持当前', e);
        return;
      }
    }
    // 换源 → 重建拼接轨 → 如果正在播放则从当前位置重启
    this.snapTrackBuffer = null;
    if (this.snapTrackSource) {
      this.startSnapSource(this.elapsed);
    }
  }

  /** 从 ArrayBuffer 解码用户上传文件并设为 snap 音源 */
  async setSnapSourceFromArrayBuffer(arrayBuf: ArrayBuffer): Promise<void> {
    if (!this.ctx) return;
    this.snapBuffer = await this.ctx.decodeAudioData(arrayBuf);
    this.snapTrackBuffer = null;
    if (this.snapTrackSource) {
      this.startSnapSource(this.elapsed);
    }
  }

  /** 设置响指音量 (0.0–1.0) */
  setSnapVolume(v: number): void {
    this.snapVolume = Math.max(0, Math.min(1, v));
    if (this.snapGain) {
      this.snapGain.gain.value = this.snapVolume;
    }
  }

  // ---- 内部：时刻生成 ----

  /** 扫描 timeline，按 snapCounts 在每阶段内随机分桶生成绝对毫秒时刻列表 */
  private generateSnapTimes(): number[] {
    if (this.snapSeed === null) {
      this.snapSeed = (Date.now() & 0xffffffff) >>> 0;
    }
    const rng = mulberry32(this.snapSeed);

    // 扫描 timeline 得到每 phase 的 (startMs, endMs)
    const segs = new Map<Phase, { startMs: number; endMs: number }>();
    let accMs = 0;
    let cur: Phase | null = null;
    let segStart = 0;
    for (const item of this.timeline) {
      if (item.type === 'end') break;
      const dur = (item.type === 'action' || item.type === 'rest') ? item.duration : 0;
      const ph: Phase | undefined =
        (item.type === 'action' || item.type === 'rest') ? item.phase : undefined;
      if (ph && ph !== cur) {
        if (cur !== null) segs.set(cur, { startMs: segStart, endMs: accMs });
        cur = ph;
        segStart = accMs;
      }
      accMs += dur;
    }
    if (cur !== null) segs.set(cur, { startMs: segStart, endMs: accMs });

    const times: number[] = [];
    for (const [phase, count] of Object.entries(this.snapCounts) as [Phase, number][]) {
      if (phase === 'warmup' || count <= 0) continue;
      const seg = segs.get(phase);
      if (!seg) continue;
      const totalMs = seg.endMs - seg.startMs;
      if (totalMs <= 0) continue;
      const bucket = totalMs / (count + 1);
      for (let k = 1; k <= count; k++) {
        const center = bucket * k;
        const jitter = (rng() - 0.5) * bucket * 0.5; // ±25% 桶宽
        times.push(seg.startMs + center + jitter);
      }
    }
    times.sort((a, b) => a - b);
    return times;
  }

  /** 计算 timeline 总毫秒（仅 action + rest） */
  private timelineTotalMs(): number {
    let t = 0;
    for (const item of this.timeline) {
      if (item.type === 'end') break;
      if (item.type === 'action' || item.type === 'rest') t += item.duration;
    }
    return t;
  }

  // ---- 内部：拼接轨构建 ----

  /**
   * 构建一整条响指拼接轨：全静音 AudioBuffer，在 snap 时刻嵌入 snap 样本。
   * - 长度 = timeline 总长（sample-accurate）
   * - 采样率 = ctx.sampleRate（与 snapBuffer 一致，保证音高不变）
   * - 1 通道 mono
   * - 所有样本直接相加（支持多个 snap 重叠）
   */
  private buildSnapTrack(): AudioBuffer | null {
    if (!this.ctx || !this.snapBuffer) return null;
    const sr = this.ctx.sampleRate;
    const totalMs = this.timelineTotalMs();
    const totalSamples = Math.max(1, Math.ceil(totalMs / 1000 * sr));
    const track = this.ctx.createBuffer(1, totalSamples, sr);
    const data = track.getChannelData(0);

    const times = this.generateSnapTimes();
    const snapData = this.snapBuffer.getChannelData(0);
    let placed = 0;
    for (const tMs of times) {
      if (tMs >= totalMs) continue;
      const off = Math.floor(tMs / 1000 * sr);
      if (off >= totalSamples) continue;
      const end = Math.min(totalSamples, off + snapData.length);
      for (let i = off; i < end; i++) {
        data[i] += snapData[i - off];
      }
      placed++;
    }
    console.log(`[Snap] 拼接轨: ${(totalMs / 1000).toFixed(1)}s, ${placed} snap, ${sr}Hz, ${(totalSamples * 4 / 1024 / 1024).toFixed(1)}MB`);
    return track;
  }

  // ---- 内部：播放控制 ----

  /**
   * 从 offsetMs 启动响指轨：
   * - 停掉旧源
   * - 必要时（重新）构建拼接轨
   * - 创建新的 BufferSource，start(0, offsetSec)
   */
  private startSnapSource(offsetMs: number): void {
    if (!this.ctx || !this.snapBuffer) return;
    if (!this.snapTrackBuffer) {
      this.snapTrackBuffer = this.buildSnapTrack();
    }
    if (!this.snapTrackBuffer) return;

    this.stopSnapSource();

    // 确保 GainNode 存在并连接到 destination
    if (!this.snapGain) {
      this.snapGain = this.ctx.createGain();
      this.snapGain.gain.value = this.snapVolume;
      this.snapGain.connect(this.ctx.destination);
    }

    const bufDur = this.snapTrackBuffer.duration;
    const offsetSec = Math.max(0, Math.min(offsetMs / 1000, bufDur - 0.001));

    const src = this.ctx.createBufferSource();
    src.buffer = this.snapTrackBuffer;
    src.connect(this.snapGain);
    try { src.start(0, offsetSec); } catch {}
    this.snapTrackSource = src;
  }

  /** 停掉当前响指源（保留拼接轨 buffer，恢复/seek 时复用） */
  private stopSnapSource(): void {
    if (this.snapTrackSource) {
      try { this.snapTrackSource.stop(); } catch {}
      try { this.snapTrackSource.disconnect(); } catch {}
      this.snapTrackSource = null;
    }
  }

  /** 销毁全部响指资源 */
  private disposeSnap(): void {
    this.stopSnapSource();
    this.snapTrackBuffer = null;
    if (this.snapGain) {
      try { this.snapGain.disconnect(); } catch {}
      this.snapGain = null;
    }
  }

  // ================================================================
  // 播放控制
  // ================================================================

  setOnUpdate(cb: EngineUpdateCallback): void { this.onUpdate = cb; }
  setOnFinished(cb: () => void): void { this.onFinished = cb; }
  setOnBeat(cb: () => void): void { this.onBeatCallback = cb; }

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
    this.snapSeed = (Date.now() & 0xffffffff) >>> 0;

    // 启动一整条响指轨：从 0 开始，播到底
    this.snapTrackBuffer = null; // 强制重建
    this.startSnapSource(0);

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
    this.stopSnapSource(); // 停响指轨（buffer 保留）
    this.emitUpdate();
  }

  resume(): void {
    if (!this.isPaused || this.pausedAt === null || !this.ctx) return;
    this.isPaused = false;
    this.startTime = this.ctx.currentTime - this.elapsedBeforePause;
    this.pausedAt = null;
    // 从暂停位置重启响指轨（同一 buffer，新 offset）
    this.startSnapSource(this.elapsedBeforePause * 1000);
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
    // 从目标位置重启响指轨
    this.startSnapSource(targetMs);
    this.scheduleLoop();
    this.timerId = setInterval(() => this.scheduleLoop(), SCHEDULE_INTERVAL_MS);
    if (wasPaused) this.pause();
  }

  stop(): void {
    this.isRunning = false;
    this.isPaused = false;
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
    this.scheduledBeats.clear();
    this.stopSnapSource();
  }

  destroy(): void {
    this.stop();
    this.disposeSnap();
    this.teardownMediaSession();
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
    this.beatBuffers.clear();
    this.signalBuffers.clear();
    this.voiceBuffers.clear();
    this.snapBuffer = null;
    this.initialized = false;
  }

  get elapsed(): number {
    if (!this.ctx) return 0;
    if (this.isPaused) return this.elapsedBeforePause * 1000;
    if (!this.isRunning) return 0;
    return (this.ctx.currentTime - this.startTime) * 1000;
  }

  // ================================================================
  // 调度循环（节拍 / 语音 / 信号 — 不碰响指轨）
  // ================================================================

  private scheduleLoop(): void {
    if (!this.isRunning || this.isPaused || !this.ctx) return;
    const now = this.ctx.currentTime;
    const elapsedMs = (now - this.startTime) * 1000;
    this.totalElapsedMs = elapsedMs;

    // 响指轨：单条 source 自动连续播放，无需 scheduleLoop 干预
    // （source 已通过 start(0, offsetSec) 起播，ctx 内部 sample-accurate）

    let accumulatedMs = 0;
    let foundCurrent = false;

    for (let ti = 0; ti < this.timeline.length; ti++) {
      const item = this.timeline[ti];
      if (item.type === 'end') {
        if (elapsedMs >= accumulatedMs) {
          this.isRunning = false;
          if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
          this.emitUpdate();
          this.onFinished?.();
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
          const vk = `a_${accumulatedMs}`;
          if (vk !== this.lastVoiceKey) {
            this.lastVoiceKey = vk;
            this.voiceEndTime = now + this.playVoice(item.name);
          }
        } else if (item.type === 'rest') {
          this.currentActionName = '休息中';
          const vk = `r_${accumulatedMs}`;
          if (vk !== this.lastVoiceKey) {
            this.lastVoiceKey = vk;
            this.voiceEndTime = now + this.playVoice('休息中');
          }
        }
        this.emitUpdateWith(remainingMs);
      }

      if (item.type === 'action' && itemEnd > elapsedMs) {
        this.scheduleBeats(item, accumulatedMs, itemEnd);
      }
      if (item.type === 'transition') {
        const sigTime = this.startTime + accumulatedMs / 1000;
        if (sigTime > now && sigTime < now + LOOK_AHEAD_MS / 1000) {
          this.playSignal(item.signal, sigTime);
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
    const isAlternating = item.pan === 'alternating';
    let beatIndex = 0;

    for (let t = offsetMs; t < endMs; t += intervalMs) {
      let actualInterval = intervalMs;
      if (t >= boostStart) actualInterval = 60000 / (bpm + BPM_BOOST_AMOUNT);

      const absTime = this.startTime + t / 1000;
      if (absTime < this.voiceEndTime) {
        if (t >= boostStart) t += actualInterval - intervalMs;
        beatIndex++;
        continue;
      }

      const key = Math.round(absTime * 1000);
      if (absTime > now && absTime < now + LOOK_AHEAD_MS / 1000) {
        if (!this.scheduledBeats.has(key)) {
          this.scheduledBeats.add(key);
          // 交错模式: 每拍交替 -1 / 1
          const pan = isAlternating ? (beatIndex % 2 === 0 ? -1 : 1) : (item.pan as number);
          this.playBeat(item.sound, absTime, item.volume, pan);
        }
      }
      if (t >= boostStart) t += actualInterval - intervalMs;
      beatIndex++;
    }
  }

  // ---- 音频播放 ----

  private playBeat(sound: SoundType, when: number, volume: number, pan: number = 0): void {
    if (!this.ctx) return;
    const buf = this.beatBuffers.get(sound);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(panner).connect(gain).connect(this.ctx.destination);
    src.start(when);
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
          this.voiceBuffers.set(name, await this.ctx!.decodeAudioData(await resp.arrayBuffer()));
        } catch { /* skip */ }
      })
    );
  }

  // ---- React 通知 ----

  private emitUpdateWith(remMs: number): void {
    this.onUpdate?.({
      actionName: this.currentActionName,
      actionRemainingMs: remMs,
      totalElapsedMs: this.totalElapsedMs,
      phase: this.currentPhase,
      isPaused: this.isPaused,
    });
  }

  private emitUpdate(): void {
    this.onUpdate?.({
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

  // ---- 打点 / 高潮 / 余韵 ----

  playExcitementDing(): void {
    if (!this.ctx || !this.excitementBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.excitementBuffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.8;
    src.connect(gain).connect(this.ctx.destination);
    src.start(this.ctx.currentTime);
  }

  recordExcitement(actionName: string): number {
    this.playExcitementDing();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([20, 40, 20]);
    }
    this.excitementPoints.push({
      elapsedMs: this.totalElapsedMs, actionName,
      phase: this.currentPhase, bpm: this.currentBpm || 60,
    });
    return this.totalElapsedMs;
  }

  getExcitementPoints(): ExcitementPoint[] { return [...this.excitementPoints]; }
  getLastExcitementPoint(): ExcitementPoint | null {
    if (this.excitementPoints.length === 0) return null;
    return { ...this.excitementPoints[this.excitementPoints.length - 1] };
  }

  triggerSubjectiveClimax(actionName: string): void {
    if (!this.ctx || !this.isRunning) return;
    const elapsedMs = this.totalElapsedMs;
    this.scheduledBeats.clear();
    this.lastVoiceKey = '';

    let acc = 0;
    const tl: TimelineItem[] = [];
    for (const item of this.timeline) {
      if (item.type === 'end') break;
      const dur = item.type === 'action' || item.type === 'rest' ? item.duration : 0;
      if (acc + dur <= elapsedMs) { tl.push(item); acc += dur; }
      else {
        if ((item.type === 'action' || item.type === 'rest') && elapsedMs > acc) {
          const rem = elapsedMs - acc;
          if (rem > 0) { tl.push({ ...item, duration: rem } as TimelineItem); acc += rem; }
        }
        break;
      }
    }
    tl.push({ type: 'transition', signal: 'heavy_beats', phase: 'climax' });
    tl.push({ type: 'action', name: actionName, duration: 43200000, bpm: 135, sound: 'bassdrum', volume: 1.0, phase: 'climax', pan: 0 });
    tl.push({ type: 'end' });
    this.timeline = tl;

    // 重建一整条响指轨（新 timeline）+ 从当前位置重启
    this.snapTrackBuffer = null;
    this.startSnapSource(this.elapsed);

    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([100, 50, 100]);
  }

  triggerReleaseAfterglow(afterglowActionName: string): void {
    if (!this.ctx || !this.isRunning) return;
    const elapsedMs = this.totalElapsedMs;
    this.scheduledBeats.clear();
    this.lastVoiceKey = '';

    let acc = 0;
    const tl: TimelineItem[] = [];
    for (const item of this.timeline) {
      if (item.type === 'end') break;
      const dur = item.type === 'action' || item.type === 'rest' ? item.duration : 0;
      if (acc + dur <= elapsedMs) { tl.push(item); acc += dur; }
      else {
        if ((item.type === 'action' || item.type === 'rest') && elapsedMs > acc) {
          const rem = elapsedMs - acc;
          if (rem > 0) { tl.push({ ...item, duration: rem } as TimelineItem); acc += rem; }
        }
        break;
      }
    }
    tl.push({ type: 'action', name: afterglowActionName, duration: 60000, bpm: 120, sound: 'heartbeat', volume: 0.9, phase: 'afterglow', pan: 0 });
    tl.push({ type: 'action', name: '收尾缓冲', duration: 15000, bpm: 20, sound: 'tick', volume: 0.7, phase: 'cooldown', pan: 0 });
    tl.push({ type: 'action', name: '静默着陆中', duration: 30000, bpm: 1, sound: 'fingertap', volume: 0, phase: 'landing', pan: 0 });
    tl.push({ type: 'end' });
    this.timeline = tl;

    this.snapTrackBuffer = null;
    this.startSnapSource(this.elapsed);

    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([40, 200]);
  }

  // ---- Media Session ----

  private setupMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: '节奏按摩引导器', artist: 'Rhythm Guide', album: 'Session',
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
