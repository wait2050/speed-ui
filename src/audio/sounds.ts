// ============================================================
// 6种音色合成函数 — 全部实时合成，零外部文件
// ============================================================

const SAMPLE_RATE = 44100;

function secondsToFrames(sec: number): number {
  return Math.ceil(sec * SAMPLE_RATE);
}

// --- tick: 800Hz 正弦波，50ms ---
export function synthesizeTick(): AudioBuffer {
  return createSineBuffer(800, 0.05, 0.3);
}

// --- woodblock: 400Hz + 1200Hz 叠加，80ms ---
export function synthesizeWoodblock(): AudioBuffer {
  const len = secondsToFrames(0.08);
  const buf = new AudioBuffer({ length: len, sampleRate: SAMPLE_RATE });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t / 0.02);
    ch[i] = (
      0.5 * Math.sin(2 * Math.PI * 400 * t) +
      0.15 * Math.sin(2 * Math.PI * 1200 * t)
    ) * env;
    // Clip
    if (ch[i] > 1) ch[i] = 1;
    if (ch[i] < -1) ch[i] = -1;
  }
  return buf;
}

// --- heartbeat: 60Hz 双脉冲（间隔100ms），150ms 总长 ---
export function synthesizeHeartbeat(): AudioBuffer {
  const totalLen = secondsToFrames(0.25); // 双脉冲+衰减
  const buf = new AudioBuffer({ length: totalLen, sampleRate: SAMPLE_RATE });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < totalLen; i++) {
    const t = i / SAMPLE_RATE;
    let val = 0;
    // 第一个脉冲
    const t1 = t;
    if (t1 >= 0 && t1 <= 0.15) {
      val += 0.6 * Math.sin(2 * Math.PI * 60 * t1) * Math.exp(-t1 / 0.04);
    }
    // 第二个脉冲（100ms 偏移）
    const t2 = t - 0.1;
    if (t2 >= 0 && t2 <= 0.15) {
      val += 0.5 * Math.sin(2 * Math.PI * 60 * t2) * Math.exp(-t2 / 0.04);
    }
    if (val > 1) val = 1;
    if (val < -1) val = -1;
    ch[i] = val;
  }
  return buf;
}

// --- waterdrop: 1200Hz 正弦，150ms 指数衰减 ---
export function synthesizeWaterdrop(): AudioBuffer {
  const len = secondsToFrames(0.15);
  const buf = new AudioBuffer({ length: len, sampleRate: SAMPLE_RATE });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t / 0.03);
    ch[i] = 0.4 * Math.sin(2 * Math.PI * 1200 * t) * env;
  }
  return buf;
}

// --- fingertap: 白噪声 + 带通滤波 2kHz，30ms ---
export function synthesizeFingertap(): AudioBuffer {
  const len = secondsToFrames(0.03);
  const buf = new AudioBuffer({ length: len, sampleRate: SAMPLE_RATE });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t / 0.003);
    ch[i] = (Math.random() * 2 - 1) * 0.15 * env;
  }
  // Simple bandpass via convolution in time domain — or just playback with BiquadFilter
  // We'll apply the filter at playback time
  return buf;
}

// --- bassdrum: 150→40Hz 频率下滑正弦波，200ms ---
export function synthesizeBassdrum(): AudioBuffer {
  const len = secondsToFrames(0.25);
  const buf = new AudioBuffer({ length: len, sampleRate: SAMPLE_RATE });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    if (t > 0.25) break;
    // 频率从 150Hz 指数下滑到 40Hz
    const freq = 150 * Math.exp(-t * 6.5) + 40 * (1 - Math.exp(-t * 6.5));
    if (freq < 40) {
      ch[i] = 0;
      continue;
    }
    const phase = 2 * Math.PI * freq * t;
    const env = Math.exp(-t / 0.08);
    ch[i] = 0.8 * Math.sin(phase) * env;
    if (ch[i] > 1) ch[i] = 1;
    if (ch[i] < -1) ch[i] = -1;
  }
  return buf;
}

// --- 通用正弦波 ---
function createSineBuffer(freq: number, duration: number, amplitude: number): AudioBuffer {
  const len = secondsToFrames(duration);
  const buf = new AudioBuffer({ length: len, sampleRate: SAMPLE_RATE });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t / (duration * 0.35));
    ch[i] = amplitude * Math.sin(2 * Math.PI * freq * t) * env;
  }
  return buf;
}

// --- excitement_ding: 高频空灵水滴风铃声，800ms 柔和余韵 ---
export function synthesizeExcitementDing(): AudioBuffer {
  const len = secondsToFrames(0.8);
  const buf = new AudioBuffer({ length: len, sampleRate: SAMPLE_RATE });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t / 0.15); // 快速起，慢慢余音跌落
    ch[i] = (
      0.35 * Math.sin(2 * Math.PI * 1500 * t) * env +
      0.15 * Math.sin(2 * Math.PI * 3000 * t) * env
    );
  }
  return buf;
}

