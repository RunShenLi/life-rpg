-- 实时天气市场快照表（单行 upsert，供前端通过 supabase-js 读取）
-- 执行方式: Supabase Dashboard → SQL Editor → Run
create table if not exists weather_snapshots (
  id int primary key default 1,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- 确保只有 id=1 这一行
-- id int primary key 已保证唯一性，无需额外 check constraint
-- （PostgreSQL 不支持 ADD CONSTRAINT IF NOT EXISTS 语法）
alter table weather_snapshots disable row level security;
