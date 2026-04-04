/**
 * GET /api/weather-market-brief?positionId=<id>
 *
 * 为前端 WX BOT 卡片提供 AI 深度分析播报。
 * 数据来源：
 *   1. Supabase 快照（仓位、NWP 多模型预报、METAR、盘口）
 *   2. Open-Meteo 实时拉取（逐小时温度曲线、风速、风向、湿度、体感温度）
 * 上述数据组成完整 prompt → Gemini 3.1 Pro → 返回 200-400 字深度分析。
 * Gemini 不可用时自动降级到模板文案，保证 brief 字段不为空。
 *
 * 环境变量（在 Vercel 后台配置）：
 *   GOOGLE_API_KEY        ← Google AI Studio 获取
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 */

import { GoogleGenAI } from '@google/genai'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ── ICAO → 坐标（同步 CITY_REGISTRY，用于 Open-Meteo 实时拉取）─────────────
const ICAO_COORDS: Record<string, { lat: number; lon: number; tz: string }> = {
  CYYZ: { lat: 43.6772, lon: -79.6306, tz: 'America/Toronto' },
  EDDM: { lat: 48.3537, lon: 11.775,   tz: 'Europe/Berlin' },
  EGLC: { lat: 51.5053, lon: 0.0553,   tz: 'Europe/London' },
  EGLL: { lat: 51.4775, lon: -0.4614,  tz: 'Europe/London' },
  EPWA: { lat: 52.1657, lon: 20.9671,  tz: 'Europe/Warsaw' },
  KATL: { lat: 33.6407, lon: -84.4277, tz: 'America/New_York' },
  KDAL: { lat: 32.8481, lon: -96.8518, tz: 'America/Chicago' },
  KDFW: { lat: 32.8998, lon: -97.0403, tz: 'America/Chicago' },
  KJFK: { lat: 40.6413, lon: -73.7781, tz: 'America/New_York' },
  KLGA: { lat: 40.7772, lon: -73.8726, tz: 'America/New_York' },
  KMIA: { lat: 25.7959, lon: -80.287,  tz: 'America/New_York' },
  KORD: { lat: 41.9742, lon: -87.9073, tz: 'America/Chicago' },
  KSEA: { lat: 47.4502, lon: -122.3088,tz: 'America/Los_Angeles' },
  LEMD: { lat: 40.4717, lon: -3.5617,  tz: 'Europe/Madrid' },
  LFPG: { lat: 48.9964, lon: 2.555,    tz: 'Europe/Paris' },
  LIMC: { lat: 45.6305, lon: 8.7231,   tz: 'Europe/Rome' },
  LLBG: { lat: 31.9965, lon: 34.8906,  tz: 'Asia/Jerusalem' },
  LTAC: { lat: 40.1282, lon: 32.9951,  tz: 'Europe/Istanbul' },
  NZWN: { lat: -41.3272,lon: 174.805,  tz: 'Pacific/Auckland' },
  OMDB: { lat: 25.2528, lon: 55.3644,  tz: 'Asia/Dubai' },
  RJTT: { lat: 35.5494, lon: 139.7798, tz: 'Asia/Tokyo' },
  RKSI: { lat: 37.4602, lon: 126.4407, tz: 'Asia/Seoul' },
  SAEZ: { lat: -34.8222,lon: -58.5358, tz: 'America/Argentina/Buenos_Aires' },
  SBGR: { lat: -23.4356,lon: -46.4731, tz: 'America/Sao_Paulo' },
  VHHH: { lat: 22.308,  lon: 113.9185, tz: 'Asia/Hong_Kong' },
  VILK: { lat: 26.7606, lon: 80.8893,  tz: 'Asia/Kolkata' },
  WSSS: { lat: 1.3644,  lon: 103.9915, tz: 'Asia/Singapore' },
  YSSY: { lat: -33.9461,lon: 151.1772, tz: 'Australia/Sydney' },
  ZBAA: { lat: 40.0799, lon: 116.5847, tz: 'Asia/Shanghai' },
  ZGGG: { lat: 23.3924, lon: 113.299,  tz: 'Asia/Shanghai' },
  ZGSZ: { lat: 22.6393, lon: 113.8107, tz: 'Asia/Shanghai' },
  ZHHH: { lat: 30.7838, lon: 114.2081, tz: 'Asia/Shanghai' },
  ZSPD: { lat: 31.1443, lon: 121.8083, tz: 'Asia/Shanghai' },
  ZUCK: { lat: 29.7192, lon: 106.6417, tz: 'Asia/Shanghai' },
  ZUUU: { lat: 30.5786, lon: 103.9459, tz: 'Asia/Shanghai' },
}

// ── 类型定义 ───────────────────────────────────────────────────────────────
type ModelDetail = { name: string; value: number }
type TopBidMarket = { slug: string; bestBid: number; bestAsk: number; tempLabel: string }

type Position = {
  id: string
  city: string
  icao: string
  targetDate: string
  roundRule: string
  side: 'YES' | 'NO'
  bracket: string
  entryPrice: number
  currentPrice: number
  sizeUsdc: number
  entryFeeUsdc: number
  signalDetailReason: string
  modelUsed: string
  signalTemperature: number | null
  modelDetails: ModelDetail[]
  currentModelDetails: ModelDetail[] | null
  metarActualTemp: number | null
  metarRunningMax: number | null
  metarObservedAt: string
  wuReportedHighTemp: number | null
  topBidMarkets: TopBidMarket[]
  viewStatus?: 'open' | 'history'
  totalRealizedPnl?: number
  timeline: Array<{ token_id?: string }>
}

type Snapshot = {
  generatedAt: string
  positions: Position[]
  historyPositions: Position[]
}

type HourlyWeather = {
  time: string[]
  temperature_2m: number[]
  apparent_temperature: number[]
  windspeed_10m: number[]
  winddirection_10m: number[]
  relative_humidity_2m: number[]
}

type LiveWeather = {
  hourly: HourlyWeather
  daily: {
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    windspeed_10m_max: number[]
    winddirection_10m_dominant: number[]
    precipitation_sum: number[]
  }
}

type Highlights = {
  bestModel: string
  bestModelTempC: number | null
  metarActualTempC: number | null
  metarRunningMaxC: number | null
  leaderTempLabel: string
  holdingBracket: string
  pnlUsdc: number
}

// ── 工具函数 ───────────────────────────────────────────────────────────────

function extractBestModel(reason: string): string {
  return reason.match(/best_model_[^:]*:([a-z0-9_]+)/i)?.[1] ?? ''
}

function roundHalfUp(v: number) { return Math.floor(v + 0.5) }

function tempToBracketDisplay(c: number | null, roundRule: string): string {
  if (c === null) return '--'
  if (roundRule === 'fahrenheit') return `${roundHalfUp(c * 9 / 5 + 32)}°F`
  const fRounded = roundHalfUp(c * 9 / 5 + 32)
  return `${roundHalfUp((fRounded - 32) * 5 / 9)}°C`
}

function degToCompass(deg: number): string {
  const dirs = ['北', '北北东', '东北', '东北东', '东', '东南东', '东南', '南南东',
                '南', '南南西', '西南', '西西南', '西', '西北西', '西北', '北北西']
  return dirs[Math.round(deg / 22.5) % 16]
}

function modelLabel(name: string): string {
  const map: Record<string, string> = {
    gfs_seamless: 'GFS', gfs_graphcast025: 'GraphCast',
    ecmwf_ifs025: 'ECMWF', ecmwf_aifs025: 'ECMWF-AI',
    gem_seamless: 'GEM', icon_seamless: 'ICON',
    jma_seamless: 'JMA', kma_seamless: 'KMA',
    cma_grapes_global: 'CMA', ukmo_seamless: 'UKMO',
    meteofrance_seamless: 'Météo-France',
  }
  return map[name] ?? name
}

function findPosition(rows: Position[], positionId: string): Position | null {
  const exact = rows.find(r => r.id === positionId)
  if (exact) return exact
  return rows.find(r => r.timeline?.some(e => String(e.token_id ?? '') === positionId)) ?? null
}

function computeNetPnl(pos: Position): number {
  if (pos.viewStatus === 'history' && pos.totalRealizedPnl != null) return pos.totalRealizedPnl
  if (pos.entryPrice <= 0) return 0
  const balance = pos.currentPrice * (pos.sizeUsdc / pos.entryPrice) - pos.entryFeeUsdc
  return balance - pos.sizeUsdc
}

// ── Open-Meteo 实时气象拉取（不走 NWP 缓存，按需拉最新实况）──────────────

async function fetchLiveWeather(icao: string, targetDate: string): Promise<LiveWeather | null> {
  const coord = ICAO_COORDS[icao]
  if (!coord) return null
  try {
    const params = new URLSearchParams({
      latitude: String(coord.lat),
      longitude: String(coord.lon),
      timezone: coord.tz,
      start_date: targetDate,
      end_date: targetDate,
      hourly: 'temperature_2m,apparent_temperature,windspeed_10m,winddirection_10m,relative_humidity_2m',
      daily: 'temperature_2m_max,temperature_2m_min,windspeed_10m_max,winddirection_10m_dominant,precipitation_sum',
      // 使用 GFS seamless 拿实况级数据；若当天已过，返回的是模型当日预报
      models: 'gfs_seamless',
      wind_speed_unit: 'kmh',
    })
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    return await res.json() as LiveWeather
  } catch {
    return null
  }
}

// ── highlights ─────────────────────────────────────────────────────────────

function buildHighlights(pos: Position): Highlights {
  const bestModel = extractBestModel(pos.signalDetailReason) || pos.modelUsed
  const bestModelDetail = pos.currentModelDetails?.find(m => m.name === bestModel)
  return {
    bestModel,
    bestModelTempC: bestModelDetail?.value ?? null,
    metarActualTempC: pos.metarActualTemp,
    metarRunningMaxC: pos.metarRunningMax,
    leaderTempLabel: pos.topBidMarkets[0]?.tempLabel ?? '--',
    holdingBracket: pos.bracket,
    pnlUsdc: computeNetPnl(pos),
  }
}

// ── prompt 组装 ────────────────────────────────────────────────────────────

function buildPrompt(pos: Position, h: Highlights, live: LiveWeather | null): string {
  const rr = pos.roundRule

  // 只给模型名和预报温度，不带 delta（delta 依赖入场价，属于持仓信息，会锚定 AI 判断）
  const modelLines = (pos.currentModelDetails ?? pos.modelDetails).map(cur =>
    `  ${modelLabel(cur.name)}: ${cur.value.toFixed(1)}°C（取整后 ${tempToBracketDisplay(cur.value, rr)}）`
  ).join('\n')

  // ── Open-Meteo 逐小时数据（今日）
  let liveSection = '（实时气象数据暂不可用）'
  if (live) {
    const d = live.daily
    const dailyMax  = d.temperature_2m_max[0]
    const dailyMin  = d.temperature_2m_min[0]
    const maxWind   = d.windspeed_10m_max[0]
    const domDir    = d.winddirection_10m_dominant[0]
    const precip    = d.precipitation_sum[0]

    // 逐小时摘要（每3小时一条，保持 prompt 紧凑）
    const h24 = live.hourly
    const hourlyRows: string[] = []
    for (let i = 0; i < h24.time.length; i += 3) {
      const localHour = h24.time[i].slice(11, 16)
      const t   = h24.temperature_2m[i]?.toFixed(1) ?? '--'
      const at  = h24.apparent_temperature[i]?.toFixed(1) ?? '--'
      const ws  = h24.windspeed_10m[i]?.toFixed(0) ?? '--'
      const wd  = h24.winddirection_10m[i] != null ? degToCompass(h24.winddirection_10m[i]) : '--'
      const rh  = h24.relative_humidity_2m[i]?.toFixed(0) ?? '--'
      hourlyRows.push(`  ${localHour}  气温 ${t}°C（体感 ${at}°C）  风 ${wd} ${ws}km/h  湿度 ${rh}%`)
    }

    liveSection = `预报日最高 ${dailyMax?.toFixed(1) ?? '--'}°C / 最低 ${dailyMin?.toFixed(1) ?? '--'}°C
主导风向：${degToCompass(domDir)} ${maxWind?.toFixed(0) ?? '--'} km/h（日最大）
降水量：${precip?.toFixed(1) ?? '0'} mm

逐小时（当地时间，每3小时）：
${hourlyRows.join('\n')}`
  }

  return `你是一位气象分析师，只根据气象数据进行客观分析，不参考任何市场价格或持仓信息。请用中文按以下固定格式输出，不要任何额外内容：

【气温】一句话说清今日实测峰温走势与预计最终最高温区间。
【模型】一句话概括各 NWP 模型的共识或分歧，点出最可信的温度方向。
【气象】一句话说明风速/风向/湿度对今日最高温的关键影响。
【结论】⚡ 一句话给出今日最可能结算的温度（精确到整数档位），并说明置信度高/中/低。

每项不超过50字，语气简洁直接。

━━ 城市与日期 ━━
城市：${pos.city}（${pos.icao}）
目标日期：${pos.targetDate}
温度取整规则：${pos.roundRule === 'fahrenheit' ? '原始°C → 转°F四舍五入取整 → 再转回°C' : '°C 直接四舍五入取整'}

━━ 实测气温（METAR / WU）━━
METAR 最新实温：${h.metarActualTempC != null ? h.metarActualTempC.toFixed(1) + '°C' : '暂无'}
今日 METAR 峰值：${h.metarRunningMaxC != null ? h.metarRunningMaxC.toFixed(1) + '°C' : '暂无'}
WU 汇报最高温：${pos.wuReportedHighTemp != null ? pos.wuReportedHighTemp.toFixed(1) + '°C' : '暂无'}

━━ 各 NWP 模型当前预报 ━━
${modelLines}

━━ Open-Meteo GFS 实时气象 ━━
${liveSection}`
}

// ── 模板兜底 ───────────────────────────────────────────────────────────────

function buildFallbackBrief(pos: Position, h: Highlights): string {
  const rr = pos.roundRule
  const metar = h.metarRunningMaxC ?? h.metarActualTempC
  const metarStr = metar !== null ? `今日峰温已达 ${tempToBracketDisplay(metar, rr)}` : '暂无实测数据'
  const modelStr = h.bestModelTempC !== null
    ? `最优模型 ${modelLabel(h.bestModel)} 指向 ${tempToBracketDisplay(h.bestModelTempC, rr)}`
    : '模型预报待更新'
  const pnlSign = h.pnlUsdc >= 0 ? '+' : ''
  return `${pos.city} ${pos.targetDate}：${metarStr}，${modelStr}，盘口主档 ${h.leaderTempLabel}。当前持 ${pos.bracket}，净盈亏 ${pnlSign}${h.pnlUsdc.toFixed(2)} USDC。`
}

// ── 主 handler ────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  const positionId = typeof req.query.positionId === 'string' ? req.query.positionId : null
  if (!positionId) {
    return res.status(400).json({ ok: false, error: 'positionId_required' })
  }

  // 1. 并行拉快照 + 位置确认（live weather 需要 icao，先拿仓位）
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
  )
  const { data, error: sbErr } = await supabase
    .from('weather_snapshots')
    .select('data')
    .eq('id', 1)
    .single()

  if (sbErr || !data?.data) {
    return res.status(503).json({ ok: false, error: 'snapshot_unavailable' })
  }

  const snapshot = data.data as Snapshot
  const allPositions = [...(snapshot.positions ?? []), ...(snapshot.historyPositions ?? [])]
  const pos = findPosition(allPositions, positionId)

  if (!pos) {
    return res.status(404).json({ ok: false, error: 'position_not_found' })
  }

  // 2. 并行拉 Open-Meteo 实时气象（不阻塞主流程，失败静默）
  const [highlights, live] = await Promise.all([
    Promise.resolve(buildHighlights(pos)),
    fetchLiveWeather(pos.icao, pos.targetDate),
  ])

  // 3. 调 Gemini 3.1 Pro，失败降级模板
  let brief: string
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
    const result = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: buildPrompt(pos, highlights, live),
      config: { maxOutputTokens: 4096 },
    })
    const text = result.text?.trim() ?? ''
    brief = text.length > 20 ? text : buildFallbackBrief(pos, highlights)
  } catch {
    brief = buildFallbackBrief(pos, highlights)
  }

  return res.status(200).json({
    ok: true,
    generatedAt: new Date().toISOString(),
    version: 'v2',
    brief,
    highlights,
  })
}
