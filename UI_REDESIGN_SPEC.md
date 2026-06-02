# Rhythm Massage Guide - UI 再设计规格文档 v2

> 本文档为全面 UI 再设计的实现规格说明，供开发团队直接按文档编码落地。
> 基于 Linear / Vercel 极简暗色美学 + 按摩放松场景的盲操心流体验设计。

---

## 目录

1. [设计哲学与参考](#1-设计哲学与参考)
2. [设计系统 Design Tokens](#2-设计系统-design-tokens)
3. [组件规范](#3-组件规范)
4. [Task 1: Tailwind CSS v4 安装与配置](#task-1)
5. [Task 2: 全局样式 + 动效基础设施](#task-2)
6. [Task 3: 首页信息架构重构](#task-3)
7. [Task 4: 播放器沉浸感 + 盲操体验升级](#task-4)
8. [Task 5: 预览页和着陆页升级](#task-5)
9. [Task 6: 侧边栏 + 历史详情页升级](#task-6)
10. [Task 7: 响应式 + 性能 + 后台保活](#task-7)

---

## 1. 设计哲学与参考

### 1.1 设计参考产品

| 产品 | 借鉴元素 |
|------|---------|
| **Linear** (linear.app) | 极深黑底、微妙氛围光晕、精致微动画、信息密度与留白的平衡 |
| **Vercel Dashboard** | Glass Morphism 卡片、渐变强调色、Spring 弹性按钮 |
| **Spotify Mobile** | 沉浸式全屏播放器、动态渐变背景随专辑变化 |
| **Calm / Headspace** | 呼吸引导动效、柔和渐变、冥想式过渡转场 |
| **Apple Music (iOS)** | 声画同步的 Now Playing 界面、歌词动画 |

### 1.2 核心设计原则

| 原则 | 说明 |
|------|------|
| **极深黑底** | `#0a0a0f` 纯黑为底，配合微妙蓝紫 radial-gradient 氛围光 |
| **Glass Morphism** | 半透明毛玻璃卡片，`backdrop-filter: blur()` + 半透明背景 + 细边框 |
| **声画联觉** | 视觉动效与音频节拍像素级同步，拒绝脱节的 CSS infinite 动画 |
| **盲操友好** | 全屏手势覆盖层 + navigator.vibrate 触觉反馈，无需精准视觉对准 |
| **弹性物理动效** | Spring Curve `cubic-bezier(0.34, 1.56, 0.64, 1)` 替代线性 ease |
| **渐变强调** | 紫粉渐变 (`#7c3aed` -> `#ec4899`) 替代单一纯色 accent |

### 1.3 使用场景特殊性

本产品的核心使用场景是**按摩放松**，用户可能处于：
- 闭眼或微光环境 → 需要盲操手势 + 触觉反馈
- 放松状态无法精准操作 → 全屏手势区替代精准拖拽
- 听觉为主要感知通道 → 声画联觉，音效确认操作
- 长时间不触碰屏幕 → 防误触锁定 + 后台音频保活

---

## 2. 设计系统 Design Tokens

### 2.1 配色系统

```css
:root {
  /* ---- 背景层次 ---- */
  --bg-primary: #0a0a0f;              /* 极深纯黑（页面底色） */
  --bg-card: rgba(255, 255, 255, 0.03);   /* 毛玻璃卡片 */
  --bg-card-hover: rgba(255, 255, 255, 0.05);  /* 卡片悬浮态 */
  --bg-elevated: rgba(255, 255, 255, 0.06);    /* 悬浮/弹出层 */
  --bg-overlay: rgba(0, 0, 0, 0.5);   /* 遮罩层 */

  /* ---- 强调色 ---- */
  --accent-start: #7c3aed;            /* 渐变起点 - 紫 */
  --accent-end: #ec4899;              /* 渐变终点 - 粉 */
  --accent-gradient: linear-gradient(135deg, #7c3aed, #ec4899);
  --accent: #a855f7;                  /* 中间色（用于单色场景） */
  --accent-dim: rgba(168, 85, 247, 0.15); /* 强调色半透明 */

  /* ---- 暖色强调（高潮/巅峰阶段） ---- */
  --warm-start: #ff6b35;
  --warm-end: #ffc107;
  --warm-gradient: linear-gradient(135deg, #ff6b35, #ffc107);
  --warm-dim: rgba(255, 107, 53, 0.15);

  /* ---- 文字 ---- */
  --text-primary: #f0f0f5;
  --text-secondary: #6b7280;
  --text-tertiary: rgba(255, 255, 255, 0.2);
  --text-accent: var(--accent);

  /* ---- 边框 ---- */
  --border: rgba(255, 255, 255, 0.08);
  --border-hover: rgba(255, 255, 255, 0.15);
  --border-active: var(--accent);

  /* ---- 圆角 ---- */
  --radius-sm: 8px;
  --radius: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;

  /* ---- 安全区 ---- */
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
```

### 2.2 阶段专用色

```css
:root {
  --phase-warmup: #4fc3f7;       /* 冷蓝 */
  --phase-core: #7c4dff;         /* 紫 */
  --phase-sprint-start: #e040fb; /* 品红 */
  --phase-sprint-accel: #ff4081; /* 粉 */
  --phase-sprint-peak: #ff1744;  /* 红 */
  --phase-climax: #ff6e40;       /* 橙 */
  --phase-afterglow: #ffab40;    /* 琥珀 */
  --phase-cooldown: #69f0ae;     /* 绿 */
  --phase-landing: #b0bec5;      /* 灰蓝 */
}
```

### 2.3 字体系统

```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display",
    "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
    sans-serif;
  --font-mono: "SF Mono", "Fira Code", "Cascadia Code", monospace;
}

/* 字号层级 */
/* 超大标题（时长数字）  */ font-size: 72px; font-weight: 200;
/* 页面标题             */ font-size: 24px; font-weight: 300; letter-spacing: 2px;
/* 区域标题 h2          */ font-size: 16px; font-weight: 500; letter-spacing: 1.5px;
/* 正文                 */ font-size: 14px; font-weight: 400; line-height: 1.6;
/* 辅助文字             */ font-size: 12px; font-weight: 400; color: var(--text-secondary);
/* 微型标签             */ font-size: 10px; font-weight: 500; letter-spacing: 0.5px;
/* 动作名（播放器大字）  */ font-size: 32px; font-weight: 300; letter-spacing: 1px;
```

### 2.4 间距系统

```css
:root {
  --space-xs: 4px;
  --space-sm: 8px;
  --space: 12px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --space-3xl: 64px;
}
```

### 2.5 阴影系统

```css
:root {
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 20px rgba(168, 85, 247, 0.3);     /* 紫色发光 */
  --shadow-glow-warm: 0 0 20px rgba(255, 107, 53, 0.3); /* 暖色发光 */
  --shadow-inset: inset 0 2px 5px rgba(0, 0, 0, 0.5);
}
```

### 2.6 动效曲线

```css
:root {
  /* Spring 弹性曲线 - 按钮按压弹起 */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  /* 平滑减速 - 元素进入 */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  /* 加速离开 */
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  /* 自然节奏 - 通用 */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  /* 弹性过渡 - 卡片展开 */
  --ease-bounce: cubic-bezier(0.68, -0.6, 0.32, 1.6);

  /* 时长 */
  --duration-fast: 150ms;
  --duration: 300ms;
  --duration-slow: 500ms;
  --duration-page: 300ms;  /* 页面转场 */
}
```

### 2.7 氛围背景

```css
/* 全局页面背景 - Linear 风格深色氛围光晕 */
body {
  background: var(--bg-primary);
  background-image:
    radial-gradient(ellipse 600px 400px at 20% 10%, rgba(124, 58, 237, 0.06), transparent),
    radial-gradient(ellipse 500px 350px at 80% 80%, rgba(236, 72, 153, 0.04), transparent),
    radial-gradient(ellipse 400px 300px at 50% 50%, rgba(79, 195, 247, 0.03), transparent);
}
```

---

## 3. 组件规范

### 3.1 按钮系统

#### 主按钮 (Primary)

```css
.btn-primary {
  background: var(--accent-gradient);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
  box-shadow: var(--shadow), var(--shadow-glow);
  transition: all var(--duration) var(--ease-spring);
}

.btn-primary:hover {
  filter: brightness(1.15);
  box-shadow: var(--shadow-lg), 0 0 30px rgba(168, 85, 247, 0.5);
  transform: translateY(-1px);
}

.btn-primary:active {
  transform: scale(0.96) translateY(0);
  transition-duration: var(--duration-fast);
}

.btn-primary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.btn-primary:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  filter: none;
  box-shadow: none;
}
```

#### 次按钮 (Secondary / Ghost)

```css
.btn-secondary {
  background: var(--bg-card);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration) var(--ease-spring);
}

.btn-secondary:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-hover);
  backdrop-filter: blur(25px);
}

.btn-secondary:active {
  transform: scale(0.97);
}
```

#### 危险按钮 (Danger)

```css
.btn-danger {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: var(--radius);
  padding: 12px 24px;
  font-size: 14px;
  cursor: pointer;
  transition: all var(--duration) var(--ease-spring);
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.4);
}
```

#### Toggle / Chip 按钮

```css
.btn-chip {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--duration-fast);
}

.btn-chip.active {
  border-color: var(--accent);
  background: var(--accent-dim);
  color: var(--accent);
}

.btn-chip:hover:not(.active) {
  border-color: var(--border-hover);
  color: var(--text-primary);
}
```

### 3.2 Glass Morphism 卡片

```css
.glass-card {
  background: var(--bg-card);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  transition: all var(--duration) var(--ease-out);
}

.glass-card:hover {
  background: var(--bg-card-hover);
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  border-color: var(--border-hover);
}
```

### 3.3 可折叠手风琴卡片

```css
.accordion-card {
  /* 继承 .glass-card 基础 */
  background: var(--bg-card);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all var(--duration) var(--ease-out);
}

.accordion-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md);
  cursor: pointer;
  user-select: none;
}

.accordion-header:hover {
  background: rgba(255, 255, 255, 0.02);
}

.accordion-chevron {
  transition: transform var(--duration) var(--ease-spring);
  color: var(--text-secondary);
}

.accordion-card.open .accordion-chevron {
  transform: rotate(180deg);
}

.accordion-body {
  max-height: 0;
  overflow: hidden;
  transition: max-height var(--duration-slow) var(--ease-out);
}

.accordion-card.open .accordion-body {
  max-height: 800px; /* 足够大的值 */
}

.accordion-content {
  padding: 0 var(--space-md) var(--space-md);
}
```

### 3.4 输入控件

#### Range Slider

```css
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  outline: none;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--accent-gradient);
  cursor: pointer;
  box-shadow: var(--shadow-glow);
  transition: transform var(--duration-fast) var(--ease-spring);
}

input[type="range"]::-webkit-slider-thumb:active {
  transform: scale(1.2);
}
```

#### Text Input

```css
.input-text {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  backdrop-filter: blur(8px);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color var(--duration-fast);
}

.input-text:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}

.input-text::placeholder {
  color: var(--text-tertiary);
}
```

### 3.5 统计数字 (Gradient Text)

```css
.stat-number {
  font-size: 24px;
  font-weight: 300;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### 3.6 阶段标签 (Phase Badge)

```css
.phase-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.5px;
  background: var(--bg-elevated);
}

/* 每个阶段对应色 */
.phase-badge.warmup  { color: var(--phase-warmup); }
.phase-badge.core    { color: var(--phase-core); }
.phase-badge.climax  { color: var(--phase-climax); }
/* ... 以此类推 */
```

---

## Task 1

### Tailwind CSS v4 安装与配置

**目标**：引入 Tailwind CSS v4 作为工具类框架，与现有 CSS 文件共存。

**涉及文件**：`package.json`, `vite.config.ts`, `src/index.css`

#### 步骤 1: 安装依赖

```bash
npm install tailwindcss @tailwindcss/vite
```

#### 步骤 2: vite.config.ts

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/speed-ui/'
});
```

#### 步骤 3: src/index.css 顶部添加

```css
@import "tailwindcss";

/* 之后保留现有 @import 链 */
@import './styles/global.css';
@import './styles/buttons.css';
/* ... */
```

#### 验收标准

- [ ] `npm run dev` 正常启动无报错
- [ ] `npm run build` 构建成功
- [ ] Tailwind 工具类（如 `class="flex items-center"`）可正常使用
- [ ] 现有 CSS 样式不被覆盖或冲突

---

## Task 2

### 全局样式 + 动效基础设施

**目标**：升级全局视觉基底，建立动效基础设施。

**涉及文件**：`src/styles/global.css`, `src/styles/buttons.css`, `src/App.tsx`

#### 2a. global.css 升级

替换 `:root` 变量为上文 2.1 节定义的完整 Design Tokens。

新增氛围背景：

```css
html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: var(--font-sans);
  background: var(--bg-primary);
  background-image:
    radial-gradient(ellipse 600px 400px at 20% 10%, rgba(124, 58, 237, 0.06), transparent),
    radial-gradient(ellipse 500px 350px at 80% 80%, rgba(236, 72, 153, 0.04), transparent),
    radial-gradient(ellipse 400px 300px at 50% 50%, rgba(79, 195, 247, 0.03), transparent);
  color: var(--text-primary);
  font-feature-settings: "cv11", "ss01";
  -webkit-font-smoothing: antialiased;
}
```

#### 2b. buttons.css 升级

替换现有按钮样式为上文 3.1 节定义的按钮系统。关键变更：
- `.btn` 基础类圆角 `40px` -> `var(--radius)` (12px)
- `.btn-compile`, `.btn-start` 使用 `.btn-primary` 渐变样式
- `.btn-recompile`, `.btn-skip` 使用 `.btn-secondary` 玻璃样式
- 所有按钮增加 `:focus-visible` outline
- `:active` 使用 `var(--ease-spring)` 弹性缩放

#### 2c. 页面转场感官遮罩 (Ambient Blur Flash)

在 `App.tsx` 中实现页面切换过渡效果：

**App.tsx 新增逻辑**：

```tsx
const [transitioning, setTransitioning] = useState(false);
const prevStatus = useRef(status);

useEffect(() => {
  if (prevStatus.current !== status) {
    setTransitioning(true);
    const timer = setTimeout(() => setTransitioning(false), 300);
    prevStatus.current = status;
    return () => clearTimeout(timer);
  }
}, [status]);

// 在 JSX 中：
return (
  <>
    {/* 转场遮罩 */}
    <div className={`page-transition-overlay ${transitioning ? 'active' : ''}`} />
    {/* ...其余内容 */}
  </>
);
```

**CSS**：

```css
.page-transition-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  pointer-events: none;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(0px);
  opacity: 0;
  transition: all 300ms var(--ease-out);
}

.page-transition-overlay.active {
  opacity: 1;
  backdrop-filter: blur(8px);
  background: rgba(255, 255, 255, 0.05);
}
```

#### 验收标准

- [ ] 页面背景为深黑 + 微妙氛围光晕
- [ ] 所有按钮具有 Spring 弹性按压效果
- [ ] 页面切换时出现 300ms 毛玻璃模糊过渡
- [ ] 按钮 focus-visible 显示 outline ring
- [ ] 现有功能完全正常

---

## Task 3

### 首页 (Home) 信息架构重构

**目标**：将密集平铺的配置项重构为可折叠手风琴卡片，提升视觉层次和信息分区。

**涉及文件**：`src/pages/Home.tsx`, `src/styles/home.css`, `src/components/Footer.tsx`, `src/styles/footer.css`

#### 3a. Home.tsx 结构重构

```tsx
<div className="page home-page">
  {/* 标题 */}
  <h1 className="app-title">节奏按摩引导器</h1>

  {/* 时长选择 - Glass Card 包裹 */}
  <section className="glass-card duration-card">
    <div className="duration-display">
      <span className="stat-number duration-value">{minutes}</span>
      <span className="duration-unit">分钟</span>
    </div>
    <input type="range" className="duration-slider" ... />
    <div className="preset-row">...</div>
  </section>

  {/* 手风琴卡片 1：阶段配置 */}
  <AccordionCard title="阶段配置" defaultOpen>
    {/* 阶段 toggle + 高潮/余韵时长 + 打响指次数 */}
  </AccordionCard>

  {/* 手风琴卡片 2：动作选择 */}
  <AccordionCard title="可选动作" badge={`${count}/7`}>
    {/* 动作 toggle buttons */}
  </AccordionCard>

  {/* 手风琴卡片 3：高级设置（默认折叠） */}
  <AccordionCard title="高级设置" defaultOpen={false}>
    {/* BPM 滑块 + 音色选择 */}
  </AccordionCard>

  {/* CTA 按钮 */}
  <button className="btn-primary btn-compile">生成编排</button>

  <Footer />
</div>
```

#### 3b. AccordionCard 组件

可在 Home.tsx 内联实现或提取为独立组件：

```tsx
const AccordionCard: React.FC<{
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, badge, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`accordion-card ${open ? 'open' : ''}`}>
      <div className="accordion-header" onClick={() => setOpen(!open)}>
        <div className="accordion-title">
          <span>{title}</span>
          {badge && <span className="accordion-badge">{badge}</span>}
        </div>
        <span className="accordion-chevron">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>
      <div className="accordion-body">
        <div className="accordion-content">{children}</div>
      </div>
    </div>
  );
};
```

#### 3c. Footer 简化

```tsx
<footer className="app-footer">
  <p className="footer-note">v3 · 进度条版</p>
</footer>
```

#### 3d. home.css 关键样式

```css
.home-page {
  gap: var(--space-md);
  padding-bottom: calc(100px + var(--safe-bottom));
}

.duration-card {
  text-align: center;
  padding: var(--space-lg);
}

/* 底部固定 CTA */
.btn-compile {
  position: fixed;
  bottom: calc(20px + var(--safe-bottom));
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 40px);
  max-width: 400px;
  z-index: 10;
}

.accordion-card {
  width: 100%;
}

.accordion-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  letter-spacing: 0.5px;
}

.accordion-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--accent-dim);
  color: var(--accent);
}
```

#### 验收标准

- [ ] 首页配置项按逻辑分组到 3 个可折叠卡片
- [ ] 卡片具有 Glass Morphism 效果（模糊 + 半透明 + 细边框）
- [ ] 卡片展开/收起有平滑 max-height 过渡 + 箭头旋转
- [ ] 「生成编排」按钮固定在底部，渐变背景 + 发光阴影
- [ ] 时长数字使用渐变色文字
- [ ] Footer 仅显示版本号
- [ ] 所有原有功能（时长设定、阶段选择、打响指、动作选择、BPM/音色）正常

---

## Task 4

### 播放器页面 (Player) 沉浸感 + 盲操体验升级

**目标**：核心体验全面升级，涵盖视觉沉浸、盲操手势、声画联觉、触觉反馈、防误触锁定。

**涉及文件**：
- `src/pages/Player.tsx` - 主页面 + 手势覆盖层 + 锁定
- `src/components/Timer.tsx` - 音频驱动发光圆环
- `src/components/ProgressBar.tsx` - 进度条增强
- `src/styles/player.css` - 所有播放器样式
- `src/engine/PlaybackEngine.ts` - 节拍回调 + Media Session
- `src/audio/engine.ts` - 打点风铃音效

#### 4a. 视觉沉浸升级

**动态渐变背景 (player.css)**：

```css
.player-page {
  position: relative;
  overflow: hidden;
}

/* 背景氛围层 - 根据阶段切换 */
.player-page::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0.15;
  transition: background 1.5s var(--ease-in-out);
  pointer-events: none;
}

.player-page[data-phase="warmup"]::before {
  background: radial-gradient(ellipse at 50% 30%, var(--phase-warmup), transparent 70%);
}
.player-page[data-phase="core"]::before {
  background: radial-gradient(ellipse at 50% 30%, var(--phase-core), transparent 70%);
}
.player-page[data-phase="sprint_start"]::before,
.player-page[data-phase="sprint_accel"]::before,
.player-page[data-phase="sprint_peak"]::before {
  background: radial-gradient(ellipse at 50% 30%, var(--phase-sprint-accel), transparent 70%);
}
.player-page[data-phase="climax"]::before {
  background: radial-gradient(ellipse at 50% 40%, var(--phase-climax), var(--warm-start) 40%, transparent 70%);
  opacity: 0.25;
}
.player-page[data-phase="afterglow"]::before {
  background: radial-gradient(ellipse at 50% 30%, var(--phase-afterglow), transparent 70%);
}
.player-page[data-phase="cooldown"]::before {
  background: radial-gradient(ellipse at 50% 30%, var(--phase-cooldown), transparent 70%);
}

/* 所有内容在氛围层之上 */
.player-page > * {
  position: relative;
  z-index: 1;
}
```

**Player.tsx 增加 data-phase**：

```tsx
<div className="page player-page" data-phase={ds.phase}>
```

**动作名渐变色文字**：

```css
.player-action-name {
  font-size: 32px;
  font-weight: 300;
  text-align: center;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  transition: all var(--duration) var(--ease-out);
}

/* Climax 阶段切换为暖色渐变 */
.player-page[data-phase="climax"] .player-action-name {
  background: var(--warm-gradient);
  -webkit-background-clip: text;
  background-clip: text;
}
```

**暂停/停止 Glass 按钮 + Icon**：

```tsx
<button className="btn-secondary btn-icon" onClick={togglePause}>
  {ds.isPaused ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z"/>
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
    </svg>
  )}
</button>
<button className="btn-secondary btn-icon btn-icon-sm" onClick={handleStop}>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2"/>
  </svg>
</button>
```

**兴奋闪烁 - 粒子扩散替代全屏闪红**：

```css
/* 删除旧的 .excited-flash::before 全屏闪烁 */
/* 改为从中心向外扩散的粒子涟漪 */
.excited-ripple {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent-gradient);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 10;
  animation: rippleExpand 0.8s var(--ease-out) forwards;
}

@keyframes rippleExpand {
  0% {
    width: 10px; height: 10px;
    opacity: 0.8;
    box-shadow: 0 0 20px rgba(168, 85, 247, 0.6);
  }
  100% {
    width: 300px; height: 300px;
    opacity: 0;
    box-shadow: 0 0 60px rgba(168, 85, 247, 0);
  }
}
```

#### 4b. 全屏无视觉手势覆盖层 (Global Gesture Overlay)

**Player.tsx 新增 GestureOverlay 区域**：

```tsx
// 手势状态
const [gestureZone, setGestureZone] = useState<'left' | 'right' | null>(null);
const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const lastTapTime = useRef(0);

// 全屏手势层
<div
  className="gesture-overlay"
  onTouchStart={handleGestureStart}
  onTouchMove={handleGestureMove}
  onTouchEnd={handleGestureEnd}
>
  {/* 侧边霓虹刻度条 - 左 */}
  <div className={`gesture-indicator left ${gestureZone === 'left' ? 'visible' : ''}`}>
    <div className="gesture-bar" />
  </div>
  {/* 侧边霓虹刻度条 - 右 */}
  <div className={`gesture-indicator right ${gestureZone === 'right' ? 'visible' : ''}`}>
    <div className="gesture-bar" />
  </div>
</div>
```

**手势处理逻辑**：

```tsx
const handleGestureStart = (e: React.TouchEvent) => {
  const x = e.touches[0].clientX;
  const screenWidth = window.innerWidth;
  setGestureZone(x < screenWidth / 2 ? 'left' : 'right');

  // 长按检测 (1.5s)
  longPressTimer.current = setTimeout(() => {
    // 触发 Climax
    if (ds.phase !== 'climax') {
      engineRef.current?.triggerSubjectiveClimax('捏住并旋转');
      setSubjectiveClimax(true);
      triggerHaptic([50, 30, 50, 30, 100]); // 海浪震动
    }
  }, 1500);
};

const handleGestureEnd = (e: React.TouchEvent) => {
  if (longPressTimer.current) clearTimeout(longPressTimer.current);

  // 双击检测
  const now = Date.now();
  if (now - lastTapTime.current < 300) {
    // 双击 = 愉悦打点
    handleExcitement();
    lastTapTime.current = 0;
  } else {
    lastTapTime.current = now;
  }

  setGestureZone(null);
};
```

**CSS**：

```css
.gesture-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  /* 完全透明，不阻挡视觉 */
  background: transparent;
}

/* 侧边霓虹刻度条 */
.gesture-indicator {
  position: absolute;
  top: 20%;
  bottom: 20%;
  width: 3px;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}

.gesture-indicator.left { left: 8px; }
.gesture-indicator.right { right: 8px; }

.gesture-indicator.visible {
  opacity: 1;
}

.gesture-bar {
  width: 100%;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(180deg,
    var(--phase-warmup) 0%,
    var(--phase-core) 33%,
    var(--phase-sprint-accel) 66%,
    var(--phase-climax) 100%
  );
  box-shadow: 0 0 8px rgba(124, 77, 255, 0.4);
}
```

#### 4c. 声画联觉同步 (Audio-Visual Synesthesia)

**PlaybackEngine.ts 新增节拍回调**：

```ts
// 新增回调类型
private onBeatCallback?: () => void;

setOnBeat(cb: () => void) {
  this.onBeatCallback = cb;
}

// 在每次播放 tick 音效时触发
private playTick() {
  // ... 现有播放逻辑
  this.onBeatCallback?.();
}
```

**Timer.tsx 接收 beat 信号驱动视觉**：

```tsx
interface Props {
  remainingMs: number;
  totalMs: number;
  beatPulse?: number; // 0-1 的脉冲值，beat 时为 1，然后衰减
}

export const Timer: React.FC<Props> = ({ remainingMs, totalMs, beatPulse = 0 }) => {
  const scale = 1 + beatPulse * 0.05;       // 最大膨胀 5%
  const glowBlur = 6 + beatPulse * 20;      // shadow-blur 从 6px 到 26px
  const glowOpacity = 0.3 + beatPulse * 0.5; // 发光透明度

  return (
    <div className="timer" style={{
      transform: `scale(${scale})`,
      transition: beatPulse > 0.5 ? 'none' : 'transform 0.3s ease-out'
    }}>
      <svg viewBox="0 0 200 200" className="timer-ring">
        {/* 外圈发光 */}
        <circle cx="100" cy="100" r="92" fill="none"
          stroke={`rgba(168, 85, 247, ${glowOpacity})`}
          strokeWidth="2"
          filter="url(#glow)"
        />
        {/* 原有轨道 + 进度弧 */}
        <circle cx="100" cy="100" r="90" fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle cx="100" cy="100" r="90" fill="none"
          stroke="url(#timerGradient)" strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 100 100)"
          style={{ transition: 'stroke-dashoffset 0.3s linear' }}
        />
        {/* SVG 渐变定义 */}
        <defs>
          <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent-start)" />
            <stop offset="100%" stopColor="var(--accent-end)" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation={glowBlur} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
      <div className="timer-text">{formatMs(remainingMs)}</div>
    </div>
  );
};
```

**Player.tsx 中 beat 脉冲衰减逻辑**：

```tsx
const [beatPulse, setBeatPulse] = useState(0);
const beatRafRef = useRef<number>(0);

// PlaybackEngine 初始化时设置回调
engine.setOnBeat(() => {
  setBeatPulse(1);
  // 启动衰减
  const start = performance.now();
  const decay = (now: number) => {
    const elapsed = now - start;
    const value = Math.max(0, 1 - elapsed / 400); // 400ms 衰减
    setBeatPulse(value);
    if (value > 0) beatRafRef.current = requestAnimationFrame(decay);
  };
  beatRafRef.current = requestAnimationFrame(decay);
});

// 传给 Timer
<Timer remainingMs={ds.actionRemainingMs} totalMs={...} beatPulse={beatPulse} />
```

**打点风铃音效 (audio/engine.ts 新增)**：

```ts
/** 播放空灵风铃音效（FM 调频合成） */
async playChimeSound() {
  if (!this.ctx) return;
  const now = this.ctx.currentTime;

  // 载波振荡器
  const carrier = this.ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.setValueAtTime(1200, now);
  carrier.frequency.exponentialRampToValueAtTime(800, now + 0.3);

  // 调制器（产生金属感泛音）
  const modulator = this.ctx.createOscillator();
  modulator.type = 'sine';
  modulator.frequency.setValueAtTime(2400, now);

  const modGain = this.ctx.createGain();
  modGain.gain.setValueAtTime(600, now);
  modGain.gain.exponentialRampToValueAtTime(1, now + 0.4);

  // 包络
  const envelope = this.ctx.createGain();
  envelope.gain.setValueAtTime(0.15, now);
  envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  // 连接
  modulator.connect(modGain).connect(carrier.frequency);
  carrier.connect(envelope).connect(this.ctx.destination);

  carrier.start(now);
  modulator.start(now);
  carrier.stop(now + 0.5);
  modulator.stop(now + 0.5);
}
```

#### 4d. 触觉振动反馈 (Web Haptic Vibration)

```ts
/** 安全调用 navigator.vibrate，桌面端静默降级 */
function triggerHaptic(pattern: number | number[]) {
  if ('vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch {}
  }
}

// 使用场景：
// 1. 动作切换 / BPM 跨越刻度线
triggerHaptic(10);  // 10ms 极短震动 = 段落感

// 2. 进入 Climax
triggerHaptic([50, 30, 50, 30, 100]);  // 海浪呼吸震动

// 3. 打点记录
triggerHaptic([20, 10, 20]);  // 双点确认
```

#### 4e. 盲触防误触锁定 (Safe Grasp Lock)

```tsx
const [isLocked, setIsLocked] = useState(false);

// 锁定切换按钮（位于控制区上方）
<button
  className={`lock-toggle ${isLocked ? 'locked' : ''}`}
  onClick={() => setIsLocked(!isLocked)}
>
  {isLocked ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 019.9-1"/>
    </svg>
  )}
</button>

// 控制区包裹
<div className={`player-controls ${isLocked ? 'controls-locked' : ''}`}>
  {isLocked && <div className="controls-lock-overlay" />}
  {/* 暂停、停止按钮 */}
</div>
```

```css
.lock-toggle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-card);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--duration) var(--ease-spring);
}

.lock-toggle.locked {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-dim);
}

.controls-locked {
  position: relative;
}

.controls-lock-overlay {
  position: absolute;
  inset: -8px;
  border-radius: var(--radius-lg);
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 3;
  cursor: not-allowed;
}

.player-controls.controls-locked {
  opacity: 0.3;
  pointer-events: none;
}
```

#### 验收标准

- [ ] 播放器背景根据当前阶段平滑切换渐变色
- [ ] 动作名使用渐变文字（常规=紫粉，高潮=暖金）
- [ ] 全屏手势覆盖层可用：双击=打点，长按1.5s=触发Climax
- [ ] 侧边霓虹刻度条在手势操作时浮现
- [ ] Timer 圆环在每次节拍发声时有 scale 膨胀 + glow 衰减（400ms）
- [ ] 打点时播放空灵风铃音效
- [ ] 移动端触觉振动正常（桌面端静默降级）
- [ ] 锁定开关可屏蔽控制按钮，锁定态有视觉提示
- [ ] 原有左滑/右滑/键盘操作仍可用

---

## Task 5

### 预览页 (Preview) 和着陆页 (Landing) 升级

**涉及文件**：`src/pages/Preview.tsx`, `src/pages/Landing.tsx`, `src/components/BreathingLight.tsx`, `src/styles/preview.css`, `src/styles/landing.css`

#### 5a. Preview 页升级

**统计卡片 Glass + 渐变数字**：

```tsx
<div className="stats-grid">
  <div className="glass-card stat-item">
    <span className="stat-number">{formatMs(stats.totalDuration)}</span>
    <span className="stat-label">总时长</span>
  </div>
  {/* ... */}
</div>
```

```css
.stat-item {
  text-align: center;
  padding: var(--space-md);
}
```

**序列列表视觉区分**：

```css
/* 动作行 */
.edit-action-row { border-bottom: 1px solid rgba(255,255,255,0.03); }
.edit-action-name { color: var(--text-primary); }

/* 休息行 */
.edit-action-row.rest-row {
  opacity: 0.5;
  background: rgba(255,255,255,0.015);
}

/* 响指行 */
.edit-action-row.snap-row {
  background: rgba(255, 200, 50, 0.04);
}
```

**锁定/替换动画**：

```css
.edit-action-options {
  padding: 6px 10px 10px 34px;
  animation: slideDown 0.2s var(--ease-out);
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

**底部按钮区**：

```css
.preview-actions {
  display: flex;
  gap: var(--space);
  width: 100%;
}

.preview-actions .btn-start {
  flex: 2;
}

.preview-actions .btn-recompile {
  flex: 1;
}
```

#### 5b. 三层 SVG 羽化呼吸灯 (BreathingLight.tsx)

```tsx
export const BreathingLight: React.FC = () => {
  return (
    <div className="breathing-container">
      <svg width="240" height="240" viewBox="0 0 240 240" className="breathing-svg">
        <defs>
          {/* 三层不同模糊度 */}
          <filter id="blur-sm">
            <feGaussianBlur stdDeviation="20" />
          </filter>
          <filter id="blur-md">
            <feGaussianBlur stdDeviation="40" />
          </filter>
          <filter id="blur-lg">
            <feGaussianBlur stdDeviation="80" />
          </filter>

          {/* 渐变定义 */}
          <radialGradient id="breathGrad1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="breathGrad2">
            <stop offset="0%" stopColor="#ec4899" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="breathGrad3">
            <stop offset="0%" stopColor="#ff6b35" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ff6b35" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 大模糊层 - 最外层漫射光 */}
        <circle cx="120" cy="120" r="80" fill="url(#breathGrad3)"
          filter="url(#blur-lg)" className="breath-layer breath-slow" />

        {/* 中模糊层 */}
        <circle cx="120" cy="120" r="60" fill="url(#breathGrad2)"
          filter="url(#blur-md)" className="breath-layer breath-medium" />

        {/* 小模糊层 - 核心光点 */}
        <circle cx="120" cy="120" r="40" fill="url(#breathGrad1)"
          filter="url(#blur-sm)" className="breath-layer breath-fast" />
      </svg>

      <p className="breathing-text">静默着陆中...</p>
      <p className="breathing-sub">呼吸放松，可随时结束</p>
    </div>
  );
};
```

```css
.breathing-svg {
  width: 240px;
  height: 240px;
}

.breath-layer {
  transform-origin: center;
}

.breath-slow {
  animation: breathPulse 6s ease-in-out infinite;
}
.breath-medium {
  animation: breathPulse 4s ease-in-out infinite 0.5s;
}
.breath-fast {
  animation: breathPulse 3s ease-in-out infinite 1s;
}

@keyframes breathPulse {
  0%, 100% { transform: scale(0.8); opacity: 0.4; }
  50% { transform: scale(1.3); opacity: 0.9; }
}
```

#### 5c. 评分升级

```css
.star {
  background: none;
  border: none;
  cursor: pointer;
  transition: all var(--duration) var(--ease-spring);
  color: var(--border);
}

.star svg {
  width: 36px;
  height: 36px;
}

.star.active {
  color: #fbbf24;
  animation: starPop 0.4s var(--ease-spring);
}

@keyframes starPop {
  0% { transform: scale(0.5); }
  60% { transform: scale(1.2); }
  100% { transform: scale(1); }
}
```

#### 验收标准

- [ ] Preview 统计卡片为 Glass Morphism + 渐变数字
- [ ] 序列列表中动作/休息/响指有明确视觉区分
- [ ] 锁定展开有 slideDown 动画
- [ ] BreathingLight 使用三层 SVG + 不同模糊度 + 不同速度呼吸
- [ ] 评分星星有选中弹跳动画
- [ ] 所有原有功能正常

---

## Task 6

### 侧边栏 + 历史详情页升级

**涉及文件**：`src/components/Sidebar.tsx`, `src/pages/HistoryDetail.tsx`, `src/styles/sidebar.css`, `src/styles/history-detail.css`

#### 6a. Sidebar Glass 面板

```css
.sidebar-panel {
  position: fixed;
  top: 0; left: 0; bottom: 0;
  width: 300px;
  max-width: 80vw;
  background: rgba(22, 22, 40, 0.85);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-right: 1px solid var(--border);
  z-index: 201;
  display: flex;
  flex-direction: column;
  animation: slideIn 0.25s var(--ease-out);
}
```

**Tab 下划线滑动动画**：

```css
.sidebar-tabs {
  position: relative;
  display: flex;
  gap: 4px;
  padding: 0 16px 12px;
  border-bottom: 1px solid var(--border);
}

.sidebar-tab {
  position: relative;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 8px 14px;
  cursor: pointer;
  transition: color var(--duration-fast);
}

.sidebar-tab.active {
  color: var(--accent);
}

.sidebar-tab.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 14px;
  right: 14px;
  height: 2px;
  background: var(--accent-gradient);
  border-radius: 1px;
  animation: underlineIn 0.2s var(--ease-out);
}

@keyframes underlineIn {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
```

**汉堡菜单 SVG Icon**：

```tsx
// App.tsx 中替换 ☰
<button className="btn-hamburger" onClick={() => setSidebarOpen(true)}>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="17" y2="12"/>
    <line x1="3" y1="18" x2="13" y2="18"/>
  </svg>
</button>
```

#### 6b. HistoryDetail - 连续愉悦度声呐图 (Continuous Flow Wave)

在现有 `hd-heatmap-section` 下方新增 SVG 曲线：

```tsx
// 生成贝塞尔插值曲线数据
const generatePleasureCurve = (points: ExcitementPoint[], totalMs: number) => {
  if (points.length === 0) return '';

  const width = 100; // 百分比宽度
  const height = 60; // SVG 高度
  const dataPoints = points.map(p => ({
    x: (p.elapsedMs / totalMs) * width,
    y: height - (p.bpm / 200) * height, // BPM 映射到高度
  }));

  if (dataPoints.length === 1) {
    return `M ${dataPoints[0].x} ${height} L ${dataPoints[0].x} ${dataPoints[0].y}`;
  }

  // 三次贝塞尔插值
  let path = `M 0 ${height} L ${dataPoints[0].x} ${dataPoints[0].y}`;
  for (let i = 0; i < dataPoints.length - 1; i++) {
    const curr = dataPoints[i];
    const next = dataPoints[i + 1];
    const cpx1 = curr.x + (next.x - curr.x) * 0.4;
    const cpy1 = curr.y;
    const cpx2 = curr.x + (next.x - curr.x) * 0.6;
    const cpy2 = next.y;
    path += ` C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${next.x} ${next.y}`;
  }
  path += ` L ${width} ${height} Z`;
  return path;
};

// JSX
<svg className="pleasure-wave-svg" viewBox="0 0 100 60" preserveAspectRatio="none">
  <defs>
    <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#4fc3f7" stopOpacity="0.3" />
      <stop offset="50%" stopColor="#e040fb" stopOpacity="0.5" />
      <stop offset="100%" stopColor="#ff1744" stopOpacity="0.3" />
    </linearGradient>
  </defs>
  <path d={curvePath} fill="url(#waveGrad)" />
  {/* 打点锚点 */}
  {excitementPoints.map((p, i) => (
    <circle
      key={i}
      cx={(p.elapsedMs / totalDurationMs) * 100}
      cy={60 - (p.bpm / 200) * 60}
      r="1.5"
      fill="#fff"
      className="wave-anchor"
    />
  ))}
</svg>
```

```css
.pleasure-wave-svg {
  width: 100%;
  height: 80px;
  margin-top: 12px;
}

.wave-anchor {
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.8));
  animation: anchorPulse 2s ease-in-out infinite;
}

@keyframes anchorPulse {
  0%, 100% { r: 1.5; opacity: 0.8; }
  50% { r: 2.5; opacity: 1; }
}
```

#### 6c. AI 自适应调理话术 (Warm AI Advisory)

在 HistoryDetail.tsx 中，根据打点数据动态生成建议：

```tsx
const generateWarmAdvice = (entry: HistoryEntry, points: ExcitementPoint[]): string => {
  if (points.length === 0) return '本次体验暂无打点记录，下次可以尝试在感到愉悦时双击屏幕记录，帮助我们为您精准定制编排。';

  // 统计高频动作
  const actionCounts: Record<string, number> = {};
  const phaseCounts: Record<string, number> = {};
  points.forEach(p => {
    actionCounts[p.actionName] = (actionCounts[p.actionName] || 0) + 1;
    phaseCounts[p.phase] = (phaseCounts[p.phase] || 0) + 1;
  });

  const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0];
  const topPhase = Object.entries(phaseCounts).sort((a, b) => b[1] - a[1])[0];

  const advice = [
    `系统检测发现在 ${PHASE_LABELS[topPhase[0] as Phase] ?? topPhase[0]} 阶段的「${topAction[0]}」时您的打点非常高频（${topAction[1]} 次），`,
    `您的身体对此频率和动作组合高度敏感。下次编排已为您自动提高此动作的出现权重 15%。`,
  ];

  if (points.length >= 3) {
    advice.push(`本次共 ${points.length} 个极爽打点，愉悦密度较高，建议保持当前时长设定。`);
  }

  return advice.join('');
};
```

**AI 指令卡片样式**：

```css
.hd-ai-section {
  background: rgba(124, 77, 255, 0.05);
  border: 1px solid rgba(124, 77, 255, 0.15);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  position: relative;
  overflow: hidden;
}

/* 紫色渐变边框效果 */
.hd-ai-section::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--radius-lg);
  padding: 1px;
  background: linear-gradient(135deg, rgba(124, 77, 255, 0.3), rgba(224, 64, 251, 0.1), transparent);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.hd-warm-advice {
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary);
  padding: var(--space) 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  margin-bottom: var(--space);
}
```

#### 验收标准

- [ ] Sidebar 面板为 Glass Morphism 效果（blur 24px + 半透明背景）
- [ ] Tab 切换有下划线滑入动画
- [ ] 汉堡菜单使用 SVG 三线条图标
- [ ] HistoryDetail 新增 Pleasure 波动曲线（SVG 贝塞尔插值）
- [ ] 打点锚点有脉冲发光动画
- [ ] AI 卡片有紫色渐变边框 + Warm 调理建议文案
- [ ] 所有原有功能正常

---

## Task 7

### 响应式 + 性能 + 后台保活

**涉及文件**：`src/styles/responsive.css`, `src/engine/PlaybackEngine.ts`, `src/hooks/useWakeLock.ts`, `vite.config.ts`

#### 7a. 响应式适配

```css
/* responsive.css 升级 */

/* 手机竖屏 (默认) */
.page {
  max-width: 440px;
  margin: 0 auto;
  padding: var(--space-lg) var(--space-md);
}

/* 平板 */
@media (min-width: 768px) {
  .page {
    max-width: 600px;
    padding: var(--space-xl) var(--space-lg);
  }

  .home-page {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
  }

  .duration-card {
    grid-column: 1 / -1;
  }

  .stats-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* 大屏 */
@media (min-width: 1024px) {
  .page {
    max-width: 720px;
  }

  .player-action-name {
    font-size: 40px;
  }

  .sidebar-panel {
    width: 360px;
  }
}

/* iPhone SE 小屏 */
@media (max-height: 600px) {
  .duration-value { font-size: 48px; }
  .timer { width: 150px; height: 150px; }
  .app-title { margin-bottom: var(--space-md); font-size: 16px; }
}
```

#### 7b. Media Session API 后台保活

在 `PlaybackEngine.ts` 中集成：

```ts
/** 注册 Media Session，声明正在播放音频以保活后台线程 */
private setupMediaSession() {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: '节奏按摩引导器',
    artist: 'Rhythm Guide',
    album: 'Session',
  });

  // 系统锁屏/控制中心的播放暂停按钮
  navigator.mediaSession.setActionHandler('play', () => this.resume());
  navigator.mediaSession.setActionHandler('pause', () => this.pause());

  // 声明为"正在播放"状态
  navigator.mediaSession.playbackState = 'playing';
}

private teardownMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = 'none';
  navigator.mediaSession.metadata = null;
}

// 在 start() 中调用 setup，在 destroy() 中调用 teardown
```

#### 7c. useWakeLock 增强

```ts
// src/hooks/useWakeLock.ts
import { useEffect, useRef } from 'react';

export function useWakeLock(active: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    const request = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch {}
    };

    request();

    // 页面可见性变化时重新获取（从后台切回时）
    const onVisibility = () => {
      if (document.visibilityState === 'visible') request();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, [active]);
}
```

#### 7d. 性能检查清单

- [ ] 所有动画仅使用 `transform` 和 `opacity`（不触发 layout/paint）
- [ ] `backdrop-filter` 仅在可见时使用（隐藏元素不设 blur）
- [ ] SVG 动画使用 `will-change: transform`（仅在动画期间）
- [ ] requestAnimationFrame 回调在组件卸载时取消
- [ ] 手势事件使用 `passive: true` 监听（非 preventDefault 场景）

#### 验收标准

- [ ] iPhone SE (375x667) 所有页面正常显示无溢出
- [ ] iPhone 15 Pro Max (430x932) 正常
- [ ] iPad (768x1024) 布局自适应
- [ ] 桌面 1280px+ 正常
- [ ] iOS Safari 切后台/锁屏后音频继续播放
- [ ] Wake Lock 防止屏幕自动休眠（播放期间）
- [ ] Lighthouse Performance 分数 >= 90
- [ ] `npm run build` 无报错
- [ ] GitHub Pages 部署后可正常访问
