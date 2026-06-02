# Speed-UI 构建与推送指南

> 仓库：`wait2050/speed-ui`
> 在线地址：`https://wait2050.github.io/speed-ui/`
> GitHub Pages 部署源：`main` 分支 `/docs` 目录

## 一行推送（最常用）

```bash
npm run build && rm -rf docs && mv dist docs && git add -A && git commit -m "build" && git push origin main
```

## 完整流程

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 构建
npm run build

# 3. 替换部署目录
rm -rf docs && mv dist docs

# 4. 提交并推送
git add -A
git commit -m "build: 描述本次变更"
git push origin main
```

## 开发模式

```bash
npm run dev
# 浏览器打开 http://localhost:5173/speed-ui/
```

## 功能分支开发

```bash
# 创建分支
git checkout -b feat/功能名

# 开发完成后提交
git add -A && git commit -m "feat: 描述"

# 合并回 main
git checkout main
git merge feat/功能名

# 构建推送
npm run build && rm -rf docs && mv dist docs && git add -A && git commit -m "build" && git push origin main
```

## 常用命令

| 操作 | 命令 |
|---|---|
| 本地开发 | `npm run dev` |
| 构建 | `npm run build` |
| 测试 | `npm test` |
| 查看状态 | `git status` |
| 查看历史 | `git log --oneline -5` |
| 放弃修改 | `git checkout -- .` |

## 注意事项

- `vite.config.ts` 中 `base: '/speed-ui/'` 必须保留，否则 GitHub Pages 资源路径会 404
- 构建产物在 `dist/`，部署用 `docs/`（GitHub Pages 只认 `docs` 或根目录）
- 每次推送后 GitHub Pages 约 1-2 分钟生效
