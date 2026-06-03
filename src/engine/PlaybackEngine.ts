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

  // ---- 响指预调度：每个 snap 独立 BufferSource，按绝对 ctx 时间一次性排进未来 ----
  // 避免预渲染整条 16+min 音轨占 168MB 内存被浏览器截断
  private snapMasterGain: GainNode | null = null;
  private scheduledSnapSources: AudioBufferSourceNode[] = [];

  // 响指配置：运行期由外部注入；启动时锁定 seed 保持 pause/resume 听感稳定
  private snapCounts: Record<Phase, number> = {
    warmup: 0, core: 0, sprint_start: 0, sprint_accel: 0, sprint_peak: 0,
    climax: 0, afterglow: 0, cooldown: 0, landing: 0,
  };
  private snapSeed: number | null = null;
  private cachedSnapTimes: number[] | null = null;

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

    // 合成主观狂热微振风铃音
    this.excitementBuffer = synthesizeExcitementDing();

    // 预加载语音 + 响指音频（全部 await 确保 ready 后再播放）
    // 注意：initialized 必须放在 await 之后，避免 start() 在 snapBuffer/voices 还未就绪时跑
    await Promise.all([this.loadVoices(), this.loadDefaultSnap()]);
    this.initialized = true;
  }

  /** 加载默认 snap.mp3（仅 init 时使用） */
  private async loadDefaultSnap(): Promise<void> {
    if (!this.ctx) { console.log('[Engine] loadDefaultSnap: ctx 为空'); return; }
    try {
      const base = import.meta.env.BASE_URL || '/';
      const url = `${base}snap.mp3`;
      console.log(`[Engine] loadDefaultSnap: 加载 ${url}`);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const arrayBuf = await resp.arrayBuffer();
      console.log(`[Engine] loadDefaultSnap: 下载 ${arrayBuf.byteLength} 字节`);
      this.snapBuffer = await this.ctx.decodeAudioData(arrayBuf);
      console.log(`[Engine] loadDefaultSnap: 解码成功, ${this.snapBuffer.duration.toFixed(2)}s`);
    } catch (e) {
      console.warn('[Engine] loadDefaultSnap: 加载失败，回退合成', e);
      this.snapBuffer = this.makeSnap();
      console.log(`[Engine] loadDefaultSnap: 合成回退 ${this.snapBuffer.duration.toFixed(2)}s`);
    }
  }

  // ---- 响指预调度：每个 snap 独立 BufferSource，按绝对 ctx 时间一次性排进未来 ----

  /**
   * 由外部注入每阶段响指次数（不立即排程；下次 scheduleSnapsFrom 生效）
   */
  setSnapConfig(counts: Record<Phase, number>): void {
    this.snapCounts = { ...counts };
    // 配置变化 → 清空时刻缓存，让下次重新生成
    this.cachedSnapTimes = null;
  }

  /**
   * 替换 snap 音源；null → 重新加载默认 snap.mp3；非 null → 直接替换。
   * 已排程的 source 不受影响（继续播放旧源直到自然结束）。
   */
  async setSnapSource(buffer: AudioBuffer | null): Promise<void> {
    if (buffer) {
      this.snapBuffer = buffer;
      console.log(`[Engine] setSnapSource: 使用外部 buffer, ${buffer.duration.toFixed(2)}s`);
      return;
    }
    if (!this.ctx) return;
    try {
      const base = import.meta.env.BASE_URL || '/';
      const url = `${base}snap.mp3`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const arrayBuf = await resp.arrayBuffer();
      this.snapBuffer = await this.ctx.decodeAudioData(arrayBuf);
      console.log(`[Engine] setSnapSource(null): 回退默认 snap.mp3, ${this.snapBuffer.duration.toFixed(2)}s`);
    } catch (e) {
      console.warn('[Engine] setSnapSource(null): 默认加载失败, 保持当前 buffer');
    }
  }

  /**
   * 直接从 ArrayBuffer 解码并设为 snap 音源（用于用户上传文件）
   */
  async setSnapSourceFromArrayBuffer(arrayBuf: ArrayBuffer): Promise<void> {
    if (!this.ctx) return;
    this.snapBuffer = await this.ctx.decodeAudioData(arrayBuf);
    console.log(`[Engine] setSnapSourceFromArrayBuffer: 解码成功, ${this.snapBuffer.duration.toFixed(2)}s`);
  }

  /**
   * 扫描 timeline，根据 snapCounts + snapSeed 随机生成 fromMs 之后的响指绝对毫秒列表。
   * 同一 timeline + 同一 counts + 同一 seed → 输出确定。
   */
  private generateSnapTimes(): number[] {
    if (this.snapSeed === null) {
      this.snapSeed = (Date.now() & 0xffffffff) >>> 0;
    }
    const rng = mulberry32(this.snapSeed);

    // 累计每个 phase 的 action+rest 总时长（绝对毫秒）
    const phaseDurations: Map<Phase, { startMs: number; endMs: number }> = new Map();
    let accMs = 0;
    let curPhase: Phase | null = null;
    let segStart = 0;
    for (const item of this.timeline) {
      if (item.type === 'end') break;
      const dur = item.type === 'action' || item.type === 'rest' ? item.duration : 0;
      const ph: Phase | undefined = (item.type === 'action' || item.type === 'rest') ? item.phase : undefined;
      if (ph && ph !== curPhase) {
        if (curPhase !== null) {
          phaseDurations.set(curPhase, { startMs: segStart, endMs: accMs });
        }
        curPhase = ph;
        segStart = accMs;
      }
      accMs += dur;
    }
    if (curPhase !== null) {
      phaseDurations.set(curPhase, { startMs: segStart, endMs: accMs });
    }

    const times: number[] = [];
    for (const phaseStr of Object.keys(this.snapCounts) as Phase[]) {
      const count = this.snapCounts[phaseStr];
      if (count <= 0) continue;
      if (phaseStr === 'warmup') continue; // 热身阶段不响应
      const seg = phaseDurations.get(phaseStr);
      if (!seg) continue;
      const totalMs = seg.endMs - seg.startMs;
      if (totalMs <= 0) continue;
      const bucket = totalMs / (count + 1);
      for (let k = 1; k <= count; k++) {
        const center = bucket * k;
        const jitter = (rng() - 0.5) * bucket * 0.5;
        times.push(seg.startMs + center + jitter);
      }
    }
    times.sort((a, b) => a - b);
    return times;
  }

  /** 取 fromMs 之后（含）的、尚未在 ctx 时钟上排过的 snap 时刻 */
  private getPendingSnapTimes(fromMs: number): number[] {
    if (this.cachedSnapTimes === null) {
      this.cachedSnapTimes = this.generateSnapTimes();
    }
    return this.cachedSnapTimes.filter(t => t >= fromMs);
  }

  /** 清空 snap 时刻缓存（配置/seed 变化时） */
  private clearSnapTimeCache(): void {
    this.cachedSnapTimes = null;
  }

  /**
   * 把 fromMs 之后的 snap 时刻一次性排到 AudioContext 时钟上。
   * Web Audio 内部 sample-accurate 调度，无需 JS 轮询。
   */
  private scheduleSnapsFrom(fromMs: number): void {
    if (!this.ctx || !this.snapBuffer) return;
    this.clearSnapSources();
    if (!this.snapMasterGain) {
      this.snapMasterGain = this.ctx.createGain();
      this.snapMasterGain.gain.value = this.snapVolume;
      this.snapMasterGain.connect(this.ctx.destination);
    }
    const now = this.ctx.currentTime;
    const times = this.getPendingSnapTimes(fromMs);
    let scheduled = 0;
    for (const t of times) {
      // 正确语义：snap 距离 fromMs 多久后播放 = (t - fromMs) ms
      // schedule 时 ctx 时钟为 now，所以 absTime = now + (t - fromMs) / 1000
      // 旧公式 startSec + (t-fromMs) = now - fromMs + (t-fromMs) 会在 t 接近 fromMs 时算到过去
      // 触发"每次 seek 立刻响指"的 bug
      const absTime = now + (t - fromMs) / 1000;
      if (absTime < now) continue; // 防御性兜底（理论上 t>=fromMs 不会触发）
      const src = this.ctx.createBufferSource();
      src.buffer = this.snapBuffer;
      src.connect(this.snapMasterGain);
      try { src.start(absTime); } catch {}
      this.scheduledSnapSources.push(src);
      scheduled++;
    }
    if (scheduled > 0) console.log(`[Snap] 预排 ${scheduled} 个响指 fromMs=${fromMs}`);
  }

  /** 停掉所有已排好的响指 source（pause/seek/stop/timelineChange 时调用） */
  private clearSnapSources(): void {
    for (const src of this.scheduledSnapSources) {
      try { src.stop(); } catch {}
      try { src.disconnect(); } catch {}
    }
    this.scheduledSnapSources = [];
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
    // 启动时锁定一次 seed（之后 pause/resume/seek 复用），保证听感稳定
    this.snapSeed = (Date.now() & 0xffffffff) >>> 0;
    this.cachedSnapTimes = null;

    // 启动响指预调度：把生成的 snap 时刻一次性排到 ctx 时钟上
    this.scheduleSnapsFrom(0);

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
    // 暂停时停掉所有已排好的响指（保留 timeline，恢复时重新排）
    this.clearSnapSources();
    this.emitUpdate();
  }

  resume(): void {
    if (!this.isPaused || this.pausedAt === null || !this.ctx) return;
    this.isPaused = false;
    this.startTime = this.ctx.currentTime - this.elapsedBeforePause;
    this.pausedAt = null;
    // 恢复：从当前 elapsed 位置起重新排响指
    this.scheduleSnapsFrom(this.elapsedBeforePause * 1000);
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
    // 重置响指到目标位置起排
    this.scheduleSnapsFrom(targetMs);
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
    this.clearSnapSources();
  }

  destroy(): void {
    this.stop();
    this.teardownMediaSession();
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
    this.beatBuffers.clear();
    this.signalBuffers.clear();
    this.voiceBuffers.clear();
    this.snapMasterGain = null;
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
    if (this.snapMasterGain) {
      this.snapMasterGain.gain.value = this.snapVolume;
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
    this.cachedSnapTimes = null; // timeline 变了，snap 时刻需重新生成

    // 重建响指调度以匹配新 timeline，并保持当前播放位置
    this.clearSnapSources();
    this.scheduleSnapsFrom(this.elapsed);

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
    this.cachedSnapTimes = null; // timeline 变了，snap 时刻需重新生成

    // 重建响指调度以匹配新 timeline，并保持当前播放位置
    this.clearSnapSources();
    this.scheduleSnapsFrom(this.elapsed);

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
