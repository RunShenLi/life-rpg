# Life RPG — 开发日志

> 每次开发后在此记录：完成了什么、遇到了什么、下一步做什么。

---

## 当前开发计划

参考 DESIGN.md § 六：MVP 开发顺序

| 阶段 | 目标 | 状态 |
|------|------|------|
| Week 1 Day 1-2 | 脚手架 + Tailwind像素主题 + 路由 | ✅ 完成 |
| Week 1 Day 3-4 | 角色面板页（静态展示 + Zustand数据） | ✅ 完成 |
| Week 1 Day 5-7 | 资产装备栏 + 折线图 | ✅ 完成 |
| Week 2 Day 1-3 | 任务板（CRUD） | ✅ 完成 |
| Week 2 Day 4-5 | 接入 Supabase | ✅ 完成 |
| Week 2 Day 6-7 | 整体联调 + 部署 Vercel | ✅ 完成 |

---

## 开发记录

---

### 2026-04-01 — 脚手架搭建

**完成内容**

- 使用 Vite + React 18 + TypeScript 初始化项目
- 安装并配置依赖：
  - `tailwindcss` (v4, `@tailwindcss/vite` 插件方式接入)
  - `zustand` + `persist` 中间件（localStorage 持久化）
  - `react-router-dom` v7（BrowserRouter + 4 个页面路由）
  - `recharts`（资产折线图）
  - `@supabase/supabase-js`（预留，尚未接入真实 DB）
- 引入 `Press Start 2P` 像素字体（Google Fonts）
- 建立项目目录结构：
  ```
  src/
  ├── types/index.ts          # 所有实体类型定义
  ├── store/
  │   ├── characterStore.ts   # Zustand 角色状态
  │   ├── assetStore.ts       # Zustand 资产状态
  │   └── questStore.ts       # Zustand 任务状态
  ├── components/Layout.tsx   # 底部导航栏 + Outlet
  └── pages/
      ├── CharacterPage.tsx   # 角色面板（静态展示）
      ├── AssetsPage.tsx      # 资产栏 + 净值折线图
      ├── QuestsPage.tsx      # 三列任务板 + inline 新增
      └── SettingsPage.tsx    # 角色编辑 + JSON 导出
  ```
- 全局像素风样式：深色背景 (`gray-950`)、`pixel-card` 组件类、`pixel-text` 字体类
- `npm run build` 通过，无 TypeScript 报错

**遗留问题 / 注意**

- Supabase 环境变量尚未配置（见 `.env.example`），当前所有数据存 localStorage
- 资产页、设置页暂无「新增资产」UI，只有展示和快照功能
- 角色面板的标签/DEBUFF 只能在 Settings 外没有编辑入口（待 Day 3-4 完善）

---

## 下一步（Week 1 Day 3-4）

- [x] 角色面板：增加「编辑标签」和「增删 DEBUFF」的 inline UI
- [x] 角色面板：头像占位图（可用 emoji 或像素 PNG）
- [x] 资产页：增加「新增资产」表单（名称 / 类型 / 数量 / 单价）
- [x] 资产页：支持编辑和删除单条资产
- [x] Settings：EXP 手动调整

---

### 2026-04-01 — 角色与资产交互补全

**完成内容**

- 角色面板：
  - 增加标签 inline 新增输入框与删除按钮
  - 增加 DEBUFF inline 新增表单（名称 / 严重度 / 颜色）与删除按钮
  - 接入 `src/assets/hero.png` 作为默认头像占位图
- 资产页：
  - 增加新增资产表单（名称 / 类型 / 数量 / 单价 / 备注）
  - 增加单条资产的 inline 编辑与删除
  - 保留净值汇总、按类型分组展示与快照记录
- 设置页：
  - 增加 EXP 数值输入
  - 增加 `-100 / +100 / +500 / 清零` 快捷调整按钮
- 验证：
  - `npm run build` 通过

**遗留问题 / 注意**

- Vite 构建产物主包约 `590 kB`，目前有 chunk size warning；功能不受影响，但后续可考虑路由懒加载
- 资产页当前未做更严格的表单校验提示，非法输入会被静默忽略

---

## 下一步（Week 1 Day 5-7）

- [x] 资产页：补充空状态引导与表单校验提示
- [x] 资产快照：避免同一天重复记录，支持覆盖或提示
- [x] 折线图：优化日期显示与 tooltip 信息密度
- [x] 任务板：开始补齐 CRUD、优先级和完成流转
- [x] 评估按路由拆包，消除构建体积 warning

---

### 2026-04-01 — 资产折线图优化 + 任务板完善 + 路由懒加载

**完成内容**

- `assetStore`：`addSnapshot` 改为 `upsertSnapshot`，同一天重复点击会覆盖而非重复插入
- 资产页：
  - 新增资产表单加入校验错误提示（名称为空 / 数量/单价非法 → 红色提示框）
  - 折线图改为按日期升序排列；Y 轴用 `¥Xw` 格式压缩；Tooltip 显示完整 ¥ 金额 + "净值"标签；
    只有 1 条记录也会渲染图表（之前要求 >1 条才显示，现改为 ≥1 条）
- 任务板：
  - 勾选框改为 toggle：已完成 → 再次点击恢复为 todo（使用 `updateQuest` 替代专用 `completeQuest`）
  - 任务标题支持双击 inline 编辑，Enter 保存，Esc 取消，失焦自动保存
  - 空列显示"暂无任务"占位提示
  - 底部添加"双击任务标题可编辑"操作提示
- 路由懒加载：
  - `App.tsx` 改为 `React.lazy` + `Suspense`，四个页面各自独立 chunk
  - 构建产物从单包 590 kB 拆分为多个小包，chunk size warning 消除

**遗留问题 / 注意**

- `AssetsPage` chunk 仍有 343 kB（含 recharts），属正常，无警告
- Supabase 仍未接入，所有数据存 localStorage

---

## 下一步（Week 2 Day 4-5）

- [x] 创建 Supabase 项目，配置 `.env` 中的 URL 和 anon key
- [x] 执行建表 SQL（characters / debuffs / assets / asset_snapshots / quests）
- [x] 将 Zustand store 中的读写替换为 Supabase CRUD（保留 localStorage 作为离线缓存）
- [x] 页面首次加载时从 Supabase 拉取初始数据

---

### 2026-04-01 — 接入 Supabase 持久层

**完成内容**

- 创建 `supabase/init.sql`：建表脚本（含 `snapshot_date UNIQUE` 约束 + 禁用 RLS）
- 创建 `src/lib/db.ts`：封装所有表的 Supabase CRUD 操作
- 将三个 Zustand store 更新为双写模式：
  - 每次 mutation 先更新本地（localStorage persist），再 fire-and-forget 写入 Supabase
  - 新增 `loadFromSupabase()` action，拉取远端数据覆盖本地
  - character store 首次运行时若远端无数据，自动将本地默认角色推送到 Supabase
- 创建 `src/components/DataLoader.tsx`：App 挂载时并行调用三个 store 的 `loadFromSupabase`
- `.env` 不提交（已加入 `.gitignore`）；保留 `.env.example` 作为模板

**架构说明**

- **离线优先**：localStorage 作为主缓存，Supabase 作为持久层；Supabase 失败不影响 UI
- **单用户**：关闭 RLS，使用 anon key 直接读写所有表
- **快照 upsert**：`asset_snapshots` 的 `snapshot_date` 加了 UNIQUE 约束，Supabase 端支持覆盖

**遗留问题 / 注意**

- 需要在 Supabase Dashboard → SQL Editor 中手动执行 `supabase/init.sql` 建表
- 尚未部署到 Vercel（Week 2 Day 6-7）

---

## 下一步（Week 2 Day 6-7）

- [x] 在 Supabase Dashboard 执行 `supabase/init.sql` 完成建表
- [x] 部署到 Vercel（预构建本地 dist → 上传，绕过 Vercel 远端 npm bug）
- [x] 设置生产环境变量（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）

---

### 2026-04-01 — 部署 Vercel，MVP v0.1 上线

**完成内容**

- Supabase 建表成功（5 张表：characters / debuffs / assets / asset_snapshots / quests）
- 配置 `vercel.json`（SPA rewrites + Vite framework）
- 使用 Vercel CLI `--prebuilt` 模式绕过远端 npm install 故障，部署成功
- **线上地址：https://life-rpg-flame.vercel.app**

**架构总结（MVP v0.1）**

```
浏览器
  ├── React 18 + Vite（Vercel CDN）
  ├── Zustand + localStorage（离线优先缓存）
  └── Supabase anon key（PostgreSQL 持久层）
```

**遗留 / 后续可做**

- 每次部署需手动在本地 `vercel build` → `vercel deploy --prebuilt`（可用 GitHub Actions 自动化）
- Supabase anon key 在前端可见，MVP 可接受；多用户版本需接入 Auth + RLS

---

## MVP v0.1 完成 🎉

所有计划功能均已实现并上线。后续需求请直接提出。

---

## v0.2 开始 — 移动端适配 + 星露谷视觉风格

设计文档：`DESIGN_V02.md`

### 2026-04-01 — 字体热修复 + 星露谷色板初版

**完成内容**

- `index.css`：切换 body 字体为 `Noto Sans SC`（中文对齐，消除混排错位）
- `index.css`：通过 Tailwind `@theme` 全局替换色板为星露谷暖色调
  - 背景 `#0f0804` 深暖棕 / 卡片 `#1e1005` / 木边框 `#6b4423`
  - 文字 `#f5e6c8` 奶油白 / 草绿 `#7ab648` / 金色 `#f5c542`
- `Layout.tsx`：标题改金色，底部导航激活项改金色高亮，边框改木褐色
- `index.html`：Google Fonts 换为 `Noto Sans SC`
- `deploy.sh`：新增一键部署脚本（token 从环境变量读取）
- 修复部署流程：`vercel build --prod` → `vercel deploy --prebuilt --prod`

**遗留 / 下一步**

- Phase 1：viewport safe-area + iOS 防缩放 + touch-action（见 DESIGN_V02.md）
- Phase 2：触摸目标尺寸修复（勾选框、删除按钮等）
- Phase 3：星露谷视觉细节精修
