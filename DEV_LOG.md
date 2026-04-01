# Life RPG — 开发日志

> 每次开发后在此记录：完成了什么、遇到了什么、下一步做什么。

---

## 当前开发计划

参考 DESIGN.md § 六：MVP 开发顺序

| 阶段 | 目标 | 状态 |
|------|------|------|
| Week 1 Day 1-2 | 脚手架 + Tailwind像素主题 + 路由 | ✅ 完成 |
| Week 1 Day 3-4 | 角色面板页（静态展示 + Zustand数据） | 🔲 待开始 |
| Week 1 Day 5-7 | 资产装备栏 + 折线图 | 🔲 待开始 |
| Week 2 Day 1-3 | 任务板（CRUD） | 🔲 待开始 |
| Week 2 Day 4-5 | 接入 Supabase | 🔲 待开始 |
| Week 2 Day 6-7 | 整体联调 + 部署 Vercel | 🔲 待开始 |

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

- [ ] 角色面板：增加「编辑标签」和「增删 DEBUFF」的 inline UI
- [ ] 角色面板：头像占位图（可用 emoji 或像素 PNG）
- [ ] 资产页：增加「新增资产」表单（名称 / 类型 / 数量 / 单价）
- [ ] 资产页：支持编辑和删除单条资产
- [ ] Settings：EXP 手动调整
