-- Life RPG — 初始化建表脚本
-- 在 Supabase Dashboard → SQL Editor 中执行

-- 角色表（单用户 MVP，只有一条记录）
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  class text,
  level int default 1,
  exp int default 0,
  avatar_url text,
  tags text[] default '{}',
  created_at timestamptz default now()
);

-- DEBUFF 表
create table if not exists debuffs (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references characters(id) on delete cascade,
  label text not null,
  color text default '#ff4444',
  severity int default 1,
  created_at timestamptz default now()
);

-- 资产表
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  amount numeric default 0,
  unit_price numeric default 0,
  note text default '',
  updated_at timestamptz default now()
);

-- 资产快照表（snapshot_date 唯一，支持 upsert 覆盖）
create table if not exists asset_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  total_net_worth numeric not null,
  created_at timestamptz default now()
);

-- 任务表
create table if not exists quests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  type text not null,
  status text default 'todo',
  priority text default 'medium',
  due_date date,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- MVP 单用户：关闭 RLS，允许匿名 key 直接读写
alter table characters disable row level security;
alter table debuffs disable row level security;
alter table assets disable row level security;
alter table asset_snapshots disable row level security;
alter table quests disable row level security;
