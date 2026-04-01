# Life RPG — 最小可行性设计文档 v0.1

## 一、产品定位

> 把真实人生映射成一个 RPG 角色扮演界面——不是为了娱乐，而是为了**看清自己**。

核心问题：我是谁 / 我有什么 / 我要去哪  
解决方式：用游戏语言（角色面板 / 装备栏 / 任务板）把散乱信息结构化

---

## 二、核心实体（数据模型）

### 2.1 角色（Character）
```
id, name, class（职业）, level, exp
avatar_url（像素头像图片）
tags: string[]          # 自定义标签，如"创业者""夜猫子"
debuffs: Debuff[]       # 负面状态，如"睡眠不足""资金紧张"
created_at
```

### 2.2 装备/资产（Asset）
```
id, name
type: cash | stock | fund | crypto | property | other
amount（数量/份额）
unit_price（当前单价，手动录入）
total_value = amount × unit_price（计算字段）
note
updated_at
```

### 2.3 资产快照（AssetSnapshot）
```
id
snapshot_date（日期）
total_net_worth（当日总净值）
created_at
```
> 每次手动更新资产后，可选择"记录今日快照"，用于绘制折线图

### 2.4 任务（Quest）
```
id, title, description
type: daily | weekly | longterm
status: todo | done
priority: low | medium | high
due_date（可选）
created_at, completed_at
```

### 2.5 DEBUFF
```
id, label（名称）, color（徽章颜色）, severity: 1~3
```

---

## 三、页面结构（MVP 4页）

```
App
├── /character    角色面板（首页）
├── /assets       资产装备栏
├── /quests       任务板
└── /settings     设置（角色编辑、数据导出）
```

### /character — 角色面板
- 像素头像（占位图先用静态PNG）
- 名字 / 职业 / 等级
- 经验进度条（手动设定，象征性）
- 标签列表（可增删）
- DEBUFF 徽章列表（可增删）
- 今日净值摘要（从资产模块拉取）

### /assets — 资产装备栏
- 资产列表（按类型分组：现金/股票/基金/其他）
- 每条资产：名称 + 当前价值 + 占比
- 底部总净值
- 「记录快照」按钮
- 折线图：净值历史走势（基于快照）

### /quests — 任务板
- 三列：今日 / 本周 / 长期
- 每条任务：标题 + 优先级色标 + 勾选完成
- 快速新增任务（inline输入）

### /settings — 设置
- 编辑角色基础信息
- 数据导出（JSON）
- 主题切换（像素风 on/off，预留）

---

## 四、技术栈

| 层 | 选型 |
|----|------|
| 前端框架 | React 18 + TypeScript + Vite |
| 样式 | Tailwind CSS v3 |
| 状态管理 | Zustand（本地缓存层） |
| 图表 | Recharts |
| 后端/数据库 | Supabase（PostgreSQL + Auth + Storage） |
| 部署 | Vercel（前端）+ Supabase Cloud（后端）|
| 移动端（未来）| Capacitor |
| 像素字体 | Press Start 2P（Google Fonts）|
| 像素美术 | AI生成 PNG sprite，CSS image-rendering: pixelated |

---

## 五、Supabase 表结构

```sql
-- 角色表（单用户MVP期只有一条记录）
create table characters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  class text,
  level int default 1,
  exp int default 0,
  avatar_url text,
  tags text[] default '{}',
  created_at timestamptz default now()
);

-- DEBUFF表
create table debuffs (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references characters(id),
  label text not null,
  color text default '#ff4444',
  severity int default 1,
  created_at timestamptz default now()
);

-- 资产表
create table assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,  -- cash/stock/fund/crypto/property/other
  amount numeric default 0,
  unit_price numeric default 0,
  note text,
  updated_at timestamptz default now()
);

-- 资产快照表（用于净值折线图）
create table asset_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  total_net_worth numeric not null,
  created_at timestamptz default now()
);

-- 任务表
create table quests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text not null,   -- daily/weekly/longterm
  status text default 'todo',  -- todo/done
  priority text default 'medium',  -- low/medium/high
  due_date date,
  created_at timestamptz default now(),
  completed_at timestamptz
);
```

---

## 六、MVP 开发顺序

```
Week 1
├── Day 1-2: 项目脚手架 + Tailwind像素主题 + 路由
├── Day 3-4: 角色面板页（静态展示 + Zustand数据）
└── Day 5-7: 资产装备栏 + 折线图

Week 2
├── Day 1-3: 任务板（CRUD）
├── Day 4-5: 接入Supabase（替换localStorage）
└── Day 6-7: 整体联调 + 部署Vercel
```

---

## 七、MVP 不做的事（范围控制）

- ❌ 用户认证（单用户，数据存本地/Supabase单表）
- ❌ 换装动画（静态头像图片即可）
- ❌ 行情API自动更新（手动录入）
- ❌ 房屋系统
- ❌ 多人/社交功能
- ❌ 移动端打包

---

## 八、验证成功标准

> 用了两周后，打开这个页面能比打开记事本更清晰地回答：
> - 我现在总资产是多少，分布在哪
> - 我今天/这周要做什么
> - 我现在有哪些"状态问题"需要关注
