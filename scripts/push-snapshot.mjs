/**
 * 实时快照推送脚本
 *
 * 调用现有的 build-weather-market-snapshot.mjs 生成快照文件，
 * 再把结果 upsert 到 Supabase weather_snapshots 表。
 *
 * 运行方式（需要 .env 中的 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）：
 *   node --env-file=.env scripts/push-snapshot.mjs
 *
 * Cron 示例（每 5 分钟）：
 *   *\/5 * * * * cd /root/life-rpg && node --env-file=.env scripts/push-snapshot.mjs >> logs/snapshot-push.log 2>&1
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const SNAPSHOT_PATH = '/root/life-rpg/public/data/weather-market-snapshot.json'
const SCRIPT_PATH = '/root/life-rpg/scripts/build-weather-market-snapshot.mjs'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('[push-snapshot] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 未设置，检查 .env')
  process.exit(1)
}

// Step 1: 生成快照（写入 SNAPSHOT_PATH）
console.log(`[push-snapshot] ${new Date().toISOString()} 开始生成快照...`)
execFileSync(process.execPath, [SCRIPT_PATH], {
  stdio: 'inherit',
  env: process.env,
})

// Step 2: 读取生成的快照
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'))

// Step 3: upsert 到 Supabase（id=1 保证单行）
const supabase = createClient(supabaseUrl, supabaseKey)
const { error } = await supabase
  .from('weather_snapshots')
  .upsert({ id: 1, data: snapshot, updated_at: new Date().toISOString() })

if (error) {
  console.error('[push-snapshot] Supabase upsert 失败:', error.message)
  process.exit(1)
}

console.log(`[push-snapshot] 推送成功，快照时间: ${snapshot.generatedAt}`)
