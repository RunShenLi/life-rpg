/**
 * 批量生成城市 AI 播报，每小时运行一次。
 *
 * 流程：
 *   1. 读取当前快照，取所有开仓中今日及未来城市
 *   2. 并行拉取各城市逐小时气象（Open-Meteo，仅 ~10 次请求，远低于配额）
 *   3. 组装一个批量 prompt → 一次 Gemini 调用
 *   4. 解析 JSON 响应，写回快照的 cityBriefs 字段
 *   5. 推送到 Supabase
 *
 * 运行：
 *   node --env-file=.env scripts/generate-city-briefs.mjs
 *
 * Cron（每小时第2分钟，错开快照推送）：
 *   2 * * * * cd /root/life-rpg && node --env-file=.env scripts/generate-city-briefs.mjs >> logs/city-briefs.log 2>&1
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'

const SNAPSHOT_PATH = '/root/life-rpg/public/data/weather-market-snapshot.json'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const googleKey   = process.env.GOOGLE_API_KEY

if (!supabaseUrl || !supabaseKey || !googleKey) {
  console.error('[city-briefs] 缺少环境变量：VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / GOOGLE_API_KEY')
  process.exit(1)
}

// ── 工具 ───────────────────────────────────────────────────────────────────

const ICAO_COORDS = {
  CYYZ:{lat:43.6772,lon:-79.6306,tz:'America/Toronto'},
  EDDM:{lat:48.3537,lon:11.775,tz:'Europe/Berlin'},
  EGLC:{lat:51.5053,lon:0.0553,tz:'Europe/London'},
  EGLL:{lat:51.4775,lon:-0.4614,tz:'Europe/London'},
  EPWA:{lat:52.1657,lon:20.9671,tz:'Europe/Warsaw'},
  KATL:{lat:33.6407,lon:-84.4277,tz:'America/New_York'},
  KDAL:{lat:32.8481,lon:-96.8518,tz:'America/Chicago'},
  KDFW:{lat:32.8998,lon:-97.0403,tz:'America/Chicago'},
  KJFK:{lat:40.6413,lon:-73.7781,tz:'America/New_York'},
  KLGA:{lat:40.7772,lon:-73.8726,tz:'America/New_York'},
  KMIA:{lat:25.7959,lon:-80.287,tz:'America/New_York'},
  KORD:{lat:41.9742,lon:-87.9073,tz:'America/Chicago'},
  KSEA:{lat:47.4502,lon:-122.3088,tz:'America/Los_Angeles'},
  LEMD:{lat:40.4717,lon:-3.5617,tz:'Europe/Madrid'},
  LFPG:{lat:48.9964,lon:2.555,tz:'Europe/Paris'},
  LIMC:{lat:45.6305,lon:8.7231,tz:'Europe/Rome'},
  LLBG:{lat:31.9965,lon:34.8906,tz:'Asia/Jerusalem'},
  LTAC:{lat:40.1282,lon:32.9951,tz:'Europe/Istanbul'},
  NZWN:{lat:-41.3272,lon:174.805,tz:'Pacific/Auckland'},
  OMDB:{lat:25.2528,lon:55.3644,tz:'Asia/Dubai'},
  RJTT:{lat:35.5494,lon:139.7798,tz:'Asia/Tokyo'},
  RKSI:{lat:37.4602,lon:126.4407,tz:'Asia/Seoul'},
  SAEZ:{lat:-34.8222,lon:-58.5358,tz:'America/Argentina/Buenos_Aires'},
  SBGR:{lat:-23.4356,lon:-46.4731,tz:'America/Sao_Paulo'},
  VHHH:{lat:22.308,lon:113.9185,tz:'Asia/Hong_Kong'},
  VILK:{lat:26.7606,lon:80.8893,tz:'Asia/Kolkata'},
  WSSS:{lat:1.3644,lon:103.9915,tz:'Asia/Singapore'},
  YSSY:{lat:-33.9461,lon:151.1772,tz:'Australia/Sydney'},
  ZBAA:{lat:40.0799,lon:116.5847,tz:'Asia/Shanghai'},
  ZGGG:{lat:23.3924,lon:113.299,tz:'Asia/Shanghai'},
  ZGSZ:{lat:22.6393,lon:113.8107,tz:'Asia/Shanghai'},
  ZHHH:{lat:30.7838,lon:114.2081,tz:'Asia/Shanghai'},
  ZSPD:{lat:31.1443,lon:121.8083,tz:'Asia/Shanghai'},
  ZUCK:{lat:29.7192,lon:106.6417,tz:'Asia/Shanghai'},
  ZUUU:{lat:30.5786,lon:103.9459,tz:'Asia/Shanghai'},
}

function degToCompass(deg) {
  const dirs = ['北','北北东','东北','东北东','东','东南东','东南','南南东',
                '南','南南西','西南','西西南','西','西北西','西北','北北西']
  return dirs[Math.round(deg / 22.5) % 16]
}

function modelLabel(name) {
  const map = {
    gfs_seamless:'GFS', gfs_graphcast025:'GraphCast',
    ecmwf_ifs025:'ECMWF', ecmwf_aifs025:'ECMWF-AI',
    gem_seamless:'GEM', icon_seamless:'ICON',
    jma_seamless:'JMA', kma_seamless:'KMA',
    cma_grapes_global:'CMA', ukmo_seamless:'UKMO',
    meteofrance_seamless:'Météo-France',
  }
  return map[name] ?? name
}

function roundHalfUp(v) { return Math.floor(v + 0.5) }

function tempDisplay(c, roundRule) {
  if (c == null) return '--'
  if (roundRule === 'fahrenheit') return `${roundHalfUp(c * 9/5 + 32)}°F`
  return `${roundHalfUp(c)}°C`
}

// ── 拉逐小时气象 ───────────────────────────────────────────────────────────

function fetchHourly(icao, targetDate) {
  // Node.js fetch 对 api.open-meteo.com 的 TLS SNI 被防火墙拦截（ETIMEDOUT），
  // 改用 Python 子进程发起请求，Python 的 TLS 实现不受同一限制。
  const coord = ICAO_COORDS[icao]
  if (!coord) return null
  try {
    const params = new URLSearchParams({
      latitude: String(coord.lat), longitude: String(coord.lon),
      timezone: coord.tz, start_date: targetDate, end_date: targetDate,
      hourly: 'temperature_2m,apparent_temperature,windspeed_10m,winddirection_10m,relative_humidity_2m',
      daily: 'temperature_2m_max,temperature_2m_min,windspeed_10m_max,winddirection_10m_dominant,precipitation_sum',
      models: 'gfs_seamless', wind_speed_unit: 'kmh',
    })
    const url = `https://api.open-meteo.com/v1/forecast?${params}`
    const out = execFileSync('python3', ['-c',
      `import urllib.request,json,sys; r=urllib.request.urlopen(${JSON.stringify(url)},timeout=12); print(r.read().decode())`
    ], { timeout: 15000, encoding: 'utf-8' })
    return JSON.parse(out)
  } catch {
    return null
  }
}

// ── 为单个城市生成 prompt 片段 ─────────────────────────────────────────────

function buildCitySection(pos, live, snapshotTime) {
  const rr = pos.roundRule ?? 'round'
  const coord = ICAO_COORDS[pos.icao]
  const tz = coord?.tz ?? 'UTC'

  const localNow = new Date().toLocaleString('zh-CN', {
    timeZone: tz, month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12: false,
  })
  const snapshotLocal = new Date(snapshotTime).toLocaleString('zh-CN', {
    timeZone: tz, hour:'2-digit', minute:'2-digit', hour12: false,
  })
  const metarTime = pos.metarObservedAt
    ? new Date(pos.metarObservedAt).toLocaleString('zh-CN', {
        timeZone: tz, hour:'2-digit', minute:'2-digit', hour12: false,
      })
    : null

  const models = (pos.currentModelDetails ?? pos.modelDetails ?? [])
    .map(m => `  ${modelLabel(m.name)}: ${m.value?.toFixed(1)}°C → ${tempDisplay(m.value, rr)}`)
    .join('\n') || '  （无模型数据）'

  let liveSection = '（实时气象不可用）'
  if (live) {
    const d = live.daily
    // 只取当前小时（最近一小时），不发全天 24 行，减少 token 浪费
    const nowHour = new Date().toLocaleString('sv-SE', { timeZone: tz, hour: '2-digit', hour12: false }).slice(0, 2)
    const curIdx = (live.hourly?.time ?? []).findLastIndex(t => t.slice(11, 13) <= nowHour)
    const idx = curIdx >= 0 ? curIdx : (live.hourly?.time?.length ?? 1) - 1
    const t  = live.hourly.temperature_2m[idx]?.toFixed(1) ?? '--'
    const at = live.hourly.apparent_temperature[idx]?.toFixed(1) ?? '--'
    const ws = live.hourly.windspeed_10m[idx]?.toFixed(0) ?? '--'
    const wd = live.hourly.winddirection_10m[idx] != null ? degToCompass(live.hourly.winddirection_10m[idx]) : '--'
    const rh = live.hourly.relative_humidity_2m[idx]?.toFixed(0) ?? '--'
    const hrLabel = live.hourly.time[idx]?.slice(11, 16) ?? '--'
    liveSection = `日最高${d.temperature_2m_max?.[0]?.toFixed(1) ?? '--'}°C / 最低${d.temperature_2m_min?.[0]?.toFixed(1) ?? '--'}°C  主导风${degToCompass(d.winddirection_10m_dominant?.[0])}${d.windspeed_10m_max?.[0]?.toFixed(0) ?? '--'}km/h  降水${d.precipitation_sum?.[0]?.toFixed(1) ?? '0'}mm\n当前(${hrLabel})：${t}°C 体感${at}°C  ${wd}${ws}km/h  湿${rh}%`
  }

  return `━━ ${pos.city}（${pos.icao}）${pos.targetDate} ━━
当地时间：${localNow}  NWP快照：${snapshotLocal}  METAR：${metarTime ?? '暂无'}  GFS实时
取整规则：${rr === 'fahrenheit' ? '°C→°F四舍五入→°C' : '°C直接取整'}
METAR实温：${pos.metarActualTemp != null ? pos.metarActualTemp.toFixed(1)+'°C' : '暂无'}  今日峰值：${pos.metarRunningMax != null ? pos.metarRunningMax.toFixed(1)+'°C' : '暂无'}  WU高温：${pos.wuReportedHighTemp != null ? pos.wuReportedHighTemp.toFixed(1)+'°C' : '暂无'}
NWP模型：
${models}
GFS实时气象：
${liveSection}`
}

// ── 批量 prompt ────────────────────────────────────────────────────────────

function buildBatchPrompt(cities) {
  const sections = cities.map(({ pos, live, snapshotTime }) =>
    buildCitySection(pos, live, snapshotTime)
  ).join('\n\n')

  return `你是气象分析师，只根据气象数据客观分析。
对以下每个城市独立分析，输出严格 JSON，key 为 "ICAO-日期"，value 为分析文本。
分析文本格式（每项≤60字，不要额外换行）：
【时间】当地时间 + 峰温时段 + (NWP截至HH:mm，METAR截至HH:mm，GFS实时)
【气温】实测走势与预计最终最高温区间
【模型】各模型共识或分歧，最可信方向
【气象】风/湿度对最高温的关键影响
【结论】⚡ 最可能结算温度（整数档位）及置信度高/中/低

只输出 JSON，不要 markdown 代码块，不要其他内容。

${sections}`
}

// ── 主流程 ────────────────────────────────────────────────────────────────

const todayUtc = new Date().toISOString().slice(0, 10)

// 1. 读快照
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'))
const openPositions = (snapshot.positions ?? []).filter(
  p => String(p.targetDate ?? '') >= todayUtc
)

// 去重：同一 icao-date 只处理一次，取第一个仓位的元数据
const seen = new Map()
for (const pos of openPositions) {
  const key = `${pos.icao}-${pos.targetDate}`
  if (!seen.has(key)) seen.set(key, pos)
}
const uniquePairs = [...seen.values()]

if (uniquePairs.length === 0) {
  console.log('[city-briefs] 无开仓城市需要分析，退出')
  process.exit(0)
}

console.log(`[city-briefs] 处理 ${uniquePairs.length} 个城市日期对`)

// 2. 并行拉逐小时气象
const liveResults = await Promise.all(
  uniquePairs.map(pos => fetchHourly(pos.icao, pos.targetDate))
)

const cities = uniquePairs.map((pos, i) => ({
  pos,
  live: liveResults[i],
  snapshotTime: snapshot.generatedAt,
}))

// 3. 调 Gemini（主 3.1 Pro，降级 3.0 Pro）
const ai = new GoogleGenAI({ apiKey: googleKey })
const prompt = buildBatchPrompt(cities)

async function tryModel(model) {
  try {
    const result = await ai.models.generateContent({
      model,
      contents: prompt,
      // 10城市 × GFS逐小时 × 5段输出，token 需求约 4000+；给足空间防截断
      config: { maxOutputTokens: 16384 },
    })
    const text = result.text?.trim() ?? ''
    // 去掉可能的 ```json 包裹
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    return JSON.parse(clean)
  } catch (e) {
    console.error(`[city-briefs] ${model} 失败:`, e.message?.slice(0, 120))
    return null
  }
}

console.log('[city-briefs] 调用 Gemini...')
const briefs = await tryModel('gemini-3.1-pro-preview')
           ?? await tryModel('gemini-3-pro-preview')

if (!briefs) {
  console.error('[city-briefs] Gemini 调用失败，跳过本次更新')
  process.exit(0)
}

console.log(`[city-briefs] 获得 ${Object.keys(briefs).length} 条播报`)

// 4. 写回快照
snapshot.cityBriefs = { ...(snapshot.cityBriefs ?? {}), ...briefs }
snapshot.cityBriefsGeneratedAt = new Date().toISOString()
writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot))

// 5. 推送到 Supabase
const supabase = createClient(supabaseUrl, supabaseKey)
const { error } = await supabase
  .from('weather_snapshots')
  .upsert({ id: 1, data: snapshot, updated_at: new Date().toISOString() })

if (error) {
  console.error('[city-briefs] Supabase 推送失败:', error.message)
  process.exit(1)
}

console.log(`[city-briefs] 完成，${new Date().toISOString()}`)
