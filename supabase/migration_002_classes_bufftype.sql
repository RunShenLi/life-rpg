-- Migration 002: 多职业 + BUFF 类型
-- 在 Supabase Dashboard → SQL Editor 中执行

-- characters 表新增 classes 列（多职业/身份数组）
ALTER TABLE characters ADD COLUMN IF NOT EXISTS classes text[] DEFAULT '{}';

-- 将旧的 class 字段迁移到 classes（如果 class 有值则作为第一个元素）
UPDATE characters
SET classes = ARRAY[class]
WHERE class IS NOT NULL AND class != '' AND array_length(classes, 1) IS NULL;

-- debuffs 表新增 buff_type 列（buff=正面 / debuff=负面）
ALTER TABLE debuffs ADD COLUMN IF NOT EXISTS buff_type text DEFAULT 'debuff';
