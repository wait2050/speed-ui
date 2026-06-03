# 节奏按摩引导器

移动端优先的智能节拍引导 H5 应用。基于 **刺激→休息→再刺激** 生理循环模型，自动编排动作序列并按序播放节拍音与语音提示。

**在线地址：** `https://wait2050.github.io/speed-ui/`

## 技术栈

- React 18 + TypeScript + Zustand（状态管理）
- Vite（构建） · Vitest（测试）
- Web Audio API（全部音效实时合成，零外部音频依赖）
- GitHub Pages（`main` 分支 `/docs` 目录部署）

## 核心模块

| 模块 | 路径 | 职责 |
|------|------|------|
| 编译器 | `src/compiler/` | 根据时长/阶段/动作配置生成 Timeline |
| 播放引擎 | `src/engine/PlaybackEngine.ts` | AudioContext 调度：节拍/语音/响指/信号音 |
| 响指轨 | PlaybackEngine 内部 | 一整条拼接 AudioBuffer（silence + snap）+ 单源播放，mulberry32 确定性随机 |
| 音色合成 | `src/audio/sounds.ts` | 6 种节拍音 + 信号音实时合成 |
| 状态管理 | `src/state/store.ts` | Zustand：播放状态/响指配置/音源持久化 |
| 音频引擎 | `src/audio/engine.ts` | AudioContext 管理 + 预览/试听 |

## 响指功能

- 每阶段可配置 0-4 次响指（热身阶段除外）
- **一整条拼接轨**：timeline 全长 AudioBuffer，静音打底 + snap 样本嵌入
- 单个 `AudioBufferSourceNode` 播到底，与节拍器共享 AudioContext 时钟
- Mulberry32 确定性 RNG：同一 seed 同一位置，pause/resume 不漂移
- 支持用户上传自定义音源（≤5MB，localStorage base64 持久化）

## 命令

| 操作 | 命令 |
|------|------|
| 开发 | `npm run dev` |
| 构建 | `npm run build` |
| 测试 | `npm test` |
| 构建+推送 | `npm run build && rm -rf docs && mv dist docs && git add -A && git commit -m "build" && git push origin main` |

## 项目结构

```
src/
├── compiler/       # 序列编译器
├── engine/         # PlaybackEngine（核心播放）
├── audio/          # AudioEngine + 音色合成
├── state/          # Zustand store
├── pages/          # Home / Player / Preview / Landing / HistoryDetail
├── components/     # Timer / ProgressBar / Sidebar / Footer / BreathingLight
├── hooks/          # useWakeLock / useFullscreen
├── storage/        # localStorage 持久化 / 导入导出
├── scheduler/      # 阶段边界计算
├── types/          # 类型定义
└── styles/         # CSS
```
