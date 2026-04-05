import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = '/root/quant/quant_strategy/framework/runtime'
const CITY_REGISTRY_PATH = '/root/quant/quant_strategy/framework/city_registry.py'
const OUT_PATH = '/root/life-rpg/public/data/weather-market-snapshot.json'
const VERSION_JSON_PATH = '/root/life-rpg/public/version.json'
const BUILD_META_PATH = '/root/life-rpg/src/generated/buildMeta.ts'
const GAMMA_BASE_URL = 'https://gamma-api.polymarket.com'
const HISTORY_START_DATE = '2026-04-03'
const WU_API_KEY = process.env.WU_API_KEY || 'e1f10a1e78da46f5b10a1e78da96f525'
const AWC_METAR_URL = 'https://aviationweather.gov/api/data/metar'
const BUILD_ID = new Date().toISOString()

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return fallback
  }
}

function readTimelineMap() {
  try {
    const output = execFileSync(
      'python3',
      ['/root/life-rpg/scripts/export-market-timelines.py'],
      { encoding: 'utf-8' }
    )
    return JSON.parse(output)
  } catch {
    return {}
  }
}

function buildCityConfigMap() {
  try {
    const source = fs.readFileSync(CITY_REGISTRY_PATH, 'utf-8')
    const map = {}
    const pattern =
      /"([A-Z0-9]{4})": CityConfig\("([^"]+)",\s*([-\d.]+),\s*([-\d.]+),\s*\d+,\s*"([^"]+)"(?:,\s*round_rule="([^"]+)")?[\s\S]*?models=\((.*?)\),/g
    let match
    while ((match = pattern.exec(source)) !== null) {
      map[match[1]] = {
        name: match[2].replace(/\s+Fallback$/u, ''),
        lat: Number(match[3]),
        lon: Number(match[4]),
        tz: match[5],
        roundRule: match[6] || 'round',
        models: [...match[7].matchAll(/"([^"]+)"/g)].map((item) => item[1]),
      }
    }
    return map
  } catch {
    return {}
  }
}

function getJsonArray(payload) {
  return Array.isArray(payload) ? payload : []
}

function toNumberOrNull(value) {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function toIsoFromUnix(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''
  return new Date(numeric * 1000).toISOString()
}

function normalizeDateKey(value) {
  return String(value || '').replaceAll('-', '')
}

function readLatestActuals() {
  const filePath = path.join(ROOT, '_nwp_accuracy/actuals.jsonl.migrated')
  try {
    const rows = fs
      .readFileSync(filePath, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))

    const map = new Map()
    for (const row of rows) {
      const key = `${row.icao}-${row.target_date}`
      const previous = map.get(key)
      if (!previous || String(previous.logged_at_utc || '') < String(row.logged_at_utc || '')) {
        map.set(key, row)
      }
    }
    return map
  } catch {
    return new Map()
  }
}

function extractMetarTempC(obs) {
  return toNumberOrNull(obs?.temp ?? obs?.tmpc)
}

function extractObservationTime(obs) {
  const candidates = [obs?.reportTime, obs?.receiptTime, obs?.obsTime]
  for (const raw of candidates) {
    if (raw == null) continue
    if (typeof raw === 'number') return new Date(raw * 1000)
    const parsed = new Date(String(raw))
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

function formatLocalDate(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date)
}

function currentLocalDate(timeZone) {
  return formatLocalDate(new Date(), timeZone)
}

function slugToCity(slug, fallback = '') {
  const match = String(slug || '').match(/highest-temperature-in-(.+?)-on-/)
  if (!match) return fallback
  return match[1]
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatBracket(low, high) {
  if (low == null && high == null) return '未知'
  if (low === high) return String(low)
  return `${low ?? '?'} ~ ${high ?? '?'}`
}

function translateSkipReason(reason) {
  const map = {
    d0_entry_disabled: '当日入场策略关闭',
    no_depth: '盘口深度不足',
    duplicate_position: '已有同类仓位',
    risk_blocked: '风险限制拦截',
  }
  return map[reason] ?? reason ?? '已扫描未购入'
}

function translateAlertStatus(status) {
  const map = {
    on_track: '正常跟踪',
    warn_gap: '温度差距偏大',
    hit_bracket: '已触达区间',
  }
  return map[status] ?? '已扫描'
}

function formatChartLabel(ts) {
  if (!ts) return '--'
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return String(ts)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function roundHalfUp(value) {
  return Math.floor(value + 0.5)
}

// 与前端 tempToBracket 保持一致：Polymarket 温度档位的取整规则
// fahrenheit 模式：原始摄氏 → 华氏取整（档位即华氏整数）
// celsius 模式（默认）：先转华氏取整，再转回摄氏取整（两次取整消除精度噪声）
function tempToBracket(value, roundRule) {
  if (roundRule === 'fahrenheit') {
    return roundHalfUp(value * 9 / 5 + 32)
  }
  const fRounded = roundHalfUp(value * 9 / 5 + 32)
  return roundHalfUp((fRounded - 32) * 5 / 9)
}

function buildMarketSlug(row) {
  const low = row.bracket_low
  const suffix = row?.entry_signal?.round_rule === 'fahrenheit' ? 'f' : 'c'
  return low == null ? '' : `${row.event_slug}-${low}${suffix}`
}

function groupBy(items, makeKey) {
  const map = new Map()
  for (const item of items) {
    const key = makeKey(item)
    const group = map.get(key)
    if (group) {
      group.push(item)
    } else {
      map.set(key, [item])
    }
  }
  return map
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function extractOutcomeTokenId(market, side) {
  const tokenIds = parseJsonList(market?.clobTokenIds).map((value) => String(value))
  const outcomes = parseJsonList(market?.outcomes).map((value) => String(value).trim().toLowerCase())

  for (let index = 0; index < outcomes.length; index += 1) {
    if (outcomes[index] === side && tokenIds[index]) {
      return tokenIds[index]
    }
  }

  if (side === 'yes') return tokenIds[0] || ''
  if (side === 'no') return tokenIds[1] || ''
  return ''
}

function findEventMarketByToken(event, tokenId, side) {
  const markets = Array.isArray(event?.markets) ? event.markets : []
  return (
    markets.find((market) => extractOutcomeTokenId(market, side) === String(tokenId || '')) ?? null
  )
}

function parseTempLabel(row) {
  const question = String(row?.question || '')
  const rangeMatch = question.match(/(\d{1,3})\s*(?:to|-)\s*(\d{1,3})\s*°?\s*([CF])/i)
  if (rangeMatch) return `${rangeMatch[1]}-${rangeMatch[2]}°${rangeMatch[3].toUpperCase()}`
  const match = question.match(/(\d{1,3})\s*°?\s*([CF])/i)
  if (match) return `${match[1]}°${match[2].toUpperCase()}`
  const slug = String(row?.slug || '')
  const slugRangeMatch = slug.match(/-(\d{1,3})-(\d{1,3})([cf])$/i)
  if (slugRangeMatch) return `${slugRangeMatch[1]}-${slugRangeMatch[2]}°${slugRangeMatch[3].toUpperCase()}`
  const slugMatch = slug.match(/-(\d{1,3})([cf])$/i)
  if (slugMatch) return `${slugMatch[1]}°${slugMatch[2].toUpperCase()}`
  const higherMatch = slug.match(/-(\d{1,3})([cf])orhigher$/i)
  if (higherMatch) return `${higherMatch[1]}°${higherMatch[2].toUpperCase()}+`
  const lowerMatch = slug.match(/-(\d{1,3})([cf])orlower$/i)
  if (lowerMatch) return `${lowerMatch[1]}°${lowerMatch[2].toUpperCase()}-`
  return '未知'
}

function aggregateModelDetails(rows) {
  const map = new Map()
  for (const row of rows) {
    const details = row?.entry_signal?.model_details || {}
    for (const [name, value] of Object.entries(details)) {
      if (value == null) continue
      const numeric = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(numeric)) continue
      const previous = map.get(name)
      if (previous == null || numeric > previous) {
        map.set(name, numeric)
      }
    }
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`fetch_failed:${response.status}:${url}`)
  }
  return response.json()
}

const cityConfigMap = buildCityConfigMap()
const cityMap = Object.fromEntries(
  Object.entries(cityConfigMap).map(([icao, value]) => [icao, value.name])
)
const modelPriorityMap = Object.fromEntries(
  Object.entries(cityConfigMap).map(([icao, value]) => [icao, value.models])
)
const positionsPayload = readJson(path.join(ROOT, '_nwp_positions/positions.json'), { positions: [] })
const weatherPayload = readJson(path.join(ROOT, '_weather_arb/latest.json'), { opportunities: [] })
const monitorPayload = readJson(path.join(ROOT, '_nwp_monitor/latest.json'), { skipped: [], metar_alerts: [] })
const actualsMap = readLatestActuals()
const timelineMap = readTimelineMap()
const todayUtc = new Date().toISOString().slice(0, 10)

const allPositions = Array.isArray(positionsPayload.positions) ? positionsPayload.positions : []
const positionsByToken = new Map(
  allPositions
    .filter((row) => row?.token_id)
    .map((row) => [String(row.token_id), row])
)
const openRawPositions = allPositions
  .filter((row) => row?.status === 'open')
  .sort((a, b) => {
    const byDate = String(a.target_date).localeCompare(String(b.target_date))
    if (byDate !== 0) return byDate
    return String(b.entered_at_utc || '').localeCompare(String(a.entered_at_utc || ''))
  })

const eventCache = new Map()
const marketCache = new Map()
const wuCache = new Map()
const metarCache = new Map()
const currentNwpCache = new Map()

function buildPositionChain(row) {
  const chain = []
  let current = row
  const seen = new Set()

  while (current?.token_id && !seen.has(String(current.token_id))) {
    chain.push(current)
    seen.add(String(current.token_id))
    const previousTokenId = current?.rebalance_from
    if (!previousTokenId) break
    current = positionsByToken.get(String(previousTokenId))
  }

  return chain.reverse()
}

function toTimelineBracket(row) {
  const low = Number(row?.bracket_low)
  const high = Number(row?.bracket_high)
  if (Number.isFinite(low) && Number.isFinite(high)) return [low, high]
  if (Number.isFinite(low)) return [low, low]
  return undefined
}

function buildSyntheticChainTimeline(row) {
  const chain = buildPositionChain(row)
  const events = []

  chain.forEach((item, index) => {
    const bracket = toTimelineBracket(item)
    const baseEvent = {
      bracket,
      size_usdc: Number(item?.size_usdc || 0),
      entry_fee_usdc: Number(item?.entry_fee_usdc || 0),
      model: item?.entry_signal?.model_used || '',
      model_temp_c: toNumberOrNull(item?.entry_signal?.predicted_temp_c_raw),
      days_ahead: Number(item?.days_ahead_at_entry || 0),
      token_id: String(item?.token_id || ''),
    }

    if (index === 0 && item?.entered_at_utc) {
      events.push({
        ts: item.entered_at_utc,
        event_type: 'ENTRY',
        entry_price: toNumberOrNull(item?.entry_price),
        ...baseEvent,
      })

      // Single-leg markets that were closed without a successful rebalance still
      // need an exit event in the synthesized timeline; otherwise history rows
      // look like duplicate entries with no explanation.
      if (chain.length === 1 && item?.status === 'closed' && item?.exit_ts_utc) {
        events.push({
          ts: item.exit_ts_utc,
          event_type: 'REBAL_OUT',
          bracket,
          exit_price: toNumberOrNull(item?.exit_price),
          realized_pnl: toNumberOrNull(item?.realized_pnl_usdc),
          reason: item?.notes || '',
          size_usdc: Number(item?.size_usdc || 0),
          token_id: String(item?.token_id || ''),
        })
      }
    }

    if (index > 0 && item?.entered_at_utc) {
      const previous = chain[index - 1]
      if (previous?.exit_ts_utc || previous?.status === 'closed') {
        events.push({
          ts: previous?.exit_ts_utc || item.entered_at_utc,
          event_type: 'REBAL_OUT',
          bracket: toTimelineBracket(previous),
          exit_price: toNumberOrNull(previous?.exit_price),
          realized_pnl: toNumberOrNull(previous?.realized_pnl_usdc),
          reason: previous?.notes || '',
          size_usdc: Number(previous?.size_usdc || 0),
          token_id: String(previous?.token_id || ''),
        })
      }

      events.push({
        ts: item.entered_at_utc,
        event_type: 'REBAL_IN',
        entry_price: toNumberOrNull(item?.entry_price),
        ...baseEvent,
      })
    }
  })

  return events
}

function mergeTimelineEvents(existingEvents, chainEvents) {
  const allEvents = [...chainEvents, ...existingEvents]
  const seen = new Set()

  return allEvents
    .filter((event) => event && event.ts)
    .sort((left, right) => String(left.ts || '').localeCompare(String(right.ts || '')))
    .filter((event) => {
      const key = JSON.stringify({
        ts: event.ts || '',
        type: event.event_type || event.eventType || '',
        bracket: event.bracket || event.old_bracket || event.new_bracket || null,
        entry_price: event.entry_price ?? null,
        exit_price: event.exit_price ?? null,
        realized_pnl: event.realized_pnl ?? null,
        final_pnl_usdc: event.final_pnl_usdc ?? null,
        size_usdc: event.size_usdc ?? null,
        reason: event.reason ?? null,
      })
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

async function getEventBySlug(eventSlug) {
  if (!eventSlug) return null
  if (!eventCache.has(eventSlug)) {
    const promise = fetchJson(`${GAMMA_BASE_URL}/events?slug=${encodeURIComponent(eventSlug)}`)
      .then((rows) => (Array.isArray(rows) && rows.length > 0 ? rows[0] : null))
      .catch(() => null)
    eventCache.set(eventSlug, promise)
  }
  return eventCache.get(eventSlug)
}

async function getMarketBySlug(marketSlug) {
  if (!marketSlug) return null
  if (!marketCache.has(marketSlug)) {
    const promise = fetchJson(`${GAMMA_BASE_URL}/markets?limit=5&slug=${encodeURIComponent(marketSlug)}`)
      .then((rows) => (Array.isArray(rows) && rows.length > 0 ? rows[0] : null))
      .catch(() => null)
    marketCache.set(marketSlug, promise)
  }
  return marketCache.get(marketSlug)
}

async function getWuSummary(icao, targetDate) {
  const city = cityConfigMap[icao]
  if (!city || !targetDate || targetDate > todayUtc) return null

  const cacheKey = `${icao}-${targetDate}`
  if (!wuCache.has(cacheKey)) {
    const promise = fetchJson(
      `https://api.weather.com/v1/geocode/${city.lat}/${city.lon}/observations/historical.json?apiKey=${encodeURIComponent(WU_API_KEY)}&units=m&language=en-US&startDate=${normalizeDateKey(targetDate)}&endDate=${normalizeDateKey(targetDate)}`
    )
      .then((payload) => {
        const observations = getJsonArray(payload?.observations)
        const maxTemp = observations.reduce((highest, row) => {
          const value = toNumberOrNull(row?.max_temp ?? row?.temp)
          if (value == null) return highest
          return highest == null ? value : Math.max(highest, value)
        }, null)
        const latestUtc = observations.reduce((latest, row) => {
          const value = toIsoFromUnix(row?.valid_time_gmt)
          return value > latest ? value : latest
        }, '')

        return {
          reportedHighTemp: maxTemp,
          observedAt: latestUtc,
        }
      })
      .catch(() => null)

    wuCache.set(cacheKey, promise)
  }

  return wuCache.get(cacheKey)
}

// 共享观测数据聚合逻辑，AWC 和 IEM 两个数据源均用此函数
function summarizeMetarObservations(observations, city) {
  const sorted = observations
    .filter((obs) => obs.tempC != null && obs.observedAt instanceof Date && !Number.isNaN(obs.observedAt.getTime()))
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())

  const latest = sorted[0] ?? null
  const localToday = currentLocalDate(city.tz)
  const todayObs = sorted.filter(
    (obs) => formatLocalDate(obs.observedAt, city.tz) === localToday
  )
  const todayTemps = todayObs.map((obs) => obs.tempC).filter((v) => v != null)
  const todaySpeciObs = todayObs.filter((obs) => obs.isSpeci)
  const todaySpeciTemps = todaySpeciObs.map((obs) => obs.tempC).filter((v) => v != null)

  const runningMax = todayTemps.length > 0 ? Math.max(...todayTemps) : null
  const speciMax = todaySpeciTemps.length > 0 ? Math.max(...todaySpeciTemps) : null
  // runningMaxFromSpeci: 今日最高温由 SPECI 报产生——说明峰值读数来自极端天气事件
  // 用于前端标记该最高温可信度存疑（SPECI 可能记录瞬时异常而非持续高温）
  const runningMaxFromSpeci = runningMax != null && speciMax != null && runningMax === speciMax

  return {
    actualTemp: latest?.tempC ?? null,
    observedAt: latest?.observedAt?.toISOString() ?? '',
    runningMax,
    speciCount: todaySpeciObs.length,
    speciMax,
    runningMaxFromSpeci,
  }
}

async function fetchAwcObservations(icao) {
  const payload = await fetchJson(`${AWC_METAR_URL}?ids=${encodeURIComponent(icao)}&format=json&hours=24`)
  return getJsonArray(payload).map((obs) => {
    const observedAt = extractObservationTime(obs)
    // SPECI: 非例行特殊气象观测报，由显著天气变化触发（阵雨、强风、能见度骤变等）
    // rawOb 以 "SPECI" 开头则为特殊报，否则为例行 METAR
    const rawOb = typeof obs?.rawOb === 'string' ? obs.rawOb.trimStart() : ''
    const isSpeci = rawOb.startsWith('SPECI')
    return { tempC: extractMetarTempC(obs), observedAt, isSpeci }
  })
}

async function fetchIemObservations(icao) {
  // IEM: Iowa Environmental Mesonet，作为 AWC 失效时的备用源
  // 查询 UTC 前一天到后一天，覆盖各时区当地今日的全范围
  const yesterday = new Date(Date.now() - 86400_000)
  const tomorrow = new Date(Date.now() + 86400_000)
  const fmt = (d) => [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ]
  const [y1, m1, d1] = fmt(yesterday)
  const [y2, m2, d2] = fmt(tomorrow)
  const url =
    `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py` +
    `?station=${encodeURIComponent(icao)}&data=tmpf` +
    `&year1=${y1}&month1=${m1}&day1=${d1}` +
    `&year2=${y2}&month2=${m2}&day2=${d2}` +
    `&tz=UTC&format=json&latlon=no&elev=no&missing=null&report_type=3,4`
  const payload = await fetchJson(url)
  return getJsonArray(payload?.data).map((row) => {
    const valid = typeof row?.valid === 'string' ? row.valid : ''
    // IEM valid 格式为 "YYYY-MM-DD HH:MM"（UTC），补 T+秒+Z 转为 ISO
    const observedAt = valid ? new Date(`${valid.replace(' ', 'T')}:00Z`) : null
    const tmpf = toNumberOrNull(row?.tmpf)
    // IEM 温度单位为华氏，需换算
    const tempC = tmpf != null ? (tmpf - 32) * 5 / 9 : null
    // IEM report_type: 3=例行METAR, 4=SPECI特殊报
    const rt = String(row?.report_type ?? '')
    const isSpeci = rt === '4' || rt.toLowerCase().includes('speci')
    return { tempC, observedAt, isSpeci }
  })
}

async function getMetarSummary(icao) {
  const city = cityConfigMap[icao]
  if (!city) return null

  if (!metarCache.has(icao)) {
    const promise = fetchAwcObservations(icao)
      .then((observations) => {
        const valid = observations.filter(
          (obs) => obs.tempC != null && obs.observedAt instanceof Date
        )
        // AWC 有效数据时直接返回，跳过 IEM 备用源
        return valid.length > 0 ? summarizeMetarObservations(valid, city) : null
      })
      .catch(() => null)
      .then(async (result) => {
        if (result != null) return result
        // AWC 失败/无数据时回退到 IEM（mesonet.agron.iastate.edu）
        // IEM 偶发 503 过载，所有异常静默处理，宁可返回 null
        try {
          const observations = await fetchIemObservations(icao)
          const valid = observations.filter(
            (obs) => obs.tempC != null && obs.observedAt instanceof Date && !Number.isNaN(obs.observedAt.getTime())
          )
          return valid.length > 0 ? summarizeMetarObservations(valid, city) : null
        } catch {
          return null
        }
      })

    metarCache.set(icao, promise)
  }

  return metarCache.get(icao)
}

// 批量拉当前 NWP 预报：Node.js fetch 到 api.open-meteo.com 有 TLS/HTTP2 超时，
// 改走 Python subprocess（requests 库可正常访问），一次性批量处理所有城市+日期对。
function batchFetchCurrentNwp(pairs) {
  if (pairs.length === 0) return {}
  try {
    const output = execFileSync(
      'python3',
      ['/root/life-rpg/scripts/fetch-current-nwp.py'],
      { input: JSON.stringify(pairs), encoding: 'utf-8', timeout: 60000 }
    )
    return JSON.parse(output)
  } catch {
    return {}
  }
}

// 从预填的 cache 中读取当前 NWP 预报（cache 由批量调用在位置处理前填充）
function getCurrentNwpForecasts(icao, targetDate) {
  const cacheKey = `${icao}-${targetDate}`
  return Promise.resolve(currentNwpCache.get(cacheKey) ?? null)
}

function normalizeTimelineEvents(row, marketRows = [row]) {
  const hasOpenPosition = marketRows.some((item) => String(item?.status || '') === 'open')
  const hasExpiredPosition = marketRows.some((item) => String(item?.status || '') === 'expired')
  const existingTimeline = (timelineMap[`${row.icao}-${row.target_date}`] || [])
    .filter((event) => {
      const eventType = String(event?.event_type || event?.eventType || '')
      // Trade lifecycle events from positions.json are the source of truth.
      // The market timeline log may contain stale or duplicated ENTRY/REBAL
      // events after retries or historical schema changes, which pollutes
      // history pages with phantom buys. Keep only non-trade annotations here.
      if (['ENTRY', 'REBAL_IN', 'REBAL_OUT'].includes(eventType)) return false
      // Only show settlement after the market is truly resolved.
      // D0 monitor may emit "SETTLEMENT" as an early-loss marker for a single leg,
      // but if the market still has open positions that is not a real market settlement.
      if (eventType === 'SETTLEMENT') {
        return !hasOpenPosition && hasExpiredPosition
      }
      return true
    })
    .map((event) => ({
    ...event,
    eventType: String(event.event_type || event.eventType || ''),
  }))
  const syntheticTimeline = buildSyntheticChainTimeline(row).map((event) => ({
    ...event,
    eventType: String(event.event_type || ''),
  }))
  return mergeTimelineEvents(existingTimeline, syntheticTimeline)
}

async function buildPositionSnapshot(row, extraFields = {}) {
  const marketSlug = buildMarketSlug(row)
  const [marketBySlug, event] = await Promise.all([
    getMarketBySlug(marketSlug),
    getEventBySlug(row.event_slug),
  ])
  const market = findEventMarketByToken(
    event,
    row.token_id,
    String(row.side || '').toLowerCase()
  ) || marketBySlug
  const [wuSummary, metarSummary, currentNwpForecasts] = await Promise.all([
    getWuSummary(row.icao, row.target_date),
    getMetarSummary(row.icao),
    // 仅对今日及未来仓位拉最新预报，历史仓位无意义
    row.target_date >= todayUtc
      ? getCurrentNwpForecasts(row.icao, row.target_date)
      : Promise.resolve(null),
  ])
  const actualRecord = actualsMap.get(`${row.icao}-${row.target_date}`) ?? null

  const priority = modelPriorityMap[row.icao] || []
  const usedModel = row.entry_signal?.model_used || ''
  const signalDetails = Object.entries(row.entry_signal?.model_details || {})
    .filter(([, value]) => value !== null && value !== undefined)  // null = 模型未返回数据，跳过避免 Number(null)=0 → 32°F 的误显示
    .map(([name, value]) => ({
      name,
      value: typeof value === 'number' ? value : Number(value),
    }))
    .sort((a, b) => {
      if (a.name === usedModel && b.name !== usedModel) return -1
      if (b.name === usedModel && a.name !== usedModel) return 1
      const ai = priority.indexOf(a.name)
      const bi = priority.indexOf(b.name)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return a.name.localeCompare(b.name)
    })

  // 返回全部档位（不截断），前端需要完整的赔率面板来绘制进度条
  const topBidMarkets = (Array.isArray(event?.markets) ? event.markets : [])
    .map((item) => ({
      slug: String(item?.slug || ''),
      bestBid: Number(item?.bestBid || 0),
      bestAsk: Number(item?.bestAsk || 0),
      tempLabel: parseTempLabel(item),
    }))
    .sort((a, b) => b.bestBid - a.bestBid)

  return {
    id: row.token_id,
    eventSlug: row.event_slug,
    marketSlug,
    city: slugToCity(row.event_slug, cityMap[row.icao] || row.icao),
    icao: row.icao,
    timeZone: cityConfigMap[row.icao]?.tz || 'UTC',
    roundRule: row.entry_signal?.round_rule || cityConfigMap[row.icao]?.roundRule || 'round',
    targetDate: row.target_date,
    side: row.side,
    bracket: formatBracket(row.bracket_low, row.bracket_high),
    entryPrice: Number(row.entry_price || 0),
    currentPrice: Number(market?.lastTradePrice || market?.bestBid || row?.exit_price || 0),
    bestBid: Number(market?.bestBid || 0),
    bestAsk: Number(market?.bestAsk || 0),
    sizeUsdc: Number(row.size_usdc || 0),
    entryFeeUsdc: Number(row.entry_fee_usdc || 0),
    daysAhead: Number(row.days_ahead_at_entry || 0),
    signalSource: row.signal_source || 'unknown',
    enteredAt: row.entered_at_utc || '',
    notes: row.notes || '',
    signalDetailReason: row.entry_signal?.reason || '',
    modelUsed: usedModel,
    signalTemperature: row.entry_signal?.predicted_temp_c_raw ?? null,
    modelDetails: signalDetails,
    currentModelDetails: currentNwpForecasts ?? null,
    topBidMarkets,
    metarActualTemp: metarSummary?.actualTemp ?? null,
    metarObservedAt: metarSummary?.observedAt ?? '',
    metarRunningMax: metarSummary?.runningMax ?? null,
    metarSpeciCount: metarSummary?.speciCount ?? 0,
    metarSpeciMax: metarSummary?.speciMax ?? null,
    metarRunningMaxFromSpeci: metarSummary?.runningMaxFromSpeci ?? false,
    // 临界区警告：若当前温度在 ±0.5°C 内跨越档位边界，预测结果可能因微小误差而变位
    // 用 metarRunningMax（今日峰温）作为参考，因市场结算取当日最高温
    boundaryWarning: (() => {
      const effectiveRoundRule = row.entry_signal?.round_rule || cityConfigMap[row.icao]?.roundRule || 'round'
      const refTemp = metarSummary?.runningMax ?? metarSummary?.actualTemp ?? null
      if (refTemp == null) return false
      const bracket = tempToBracket(refTemp, effectiveRoundRule)
      return (
        tempToBracket(refTemp + 0.5, effectiveRoundRule) !== bracket ||
        tempToBracket(refTemp - 0.5, effectiveRoundRule) !== bracket
      )
    })(),
    wuReportedHighTemp:
      wuSummary?.reportedHighTemp ??
      (actualRecord ? toNumberOrNull(actualRecord.actual_temp_c) : null),
    wuObservedAt: wuSummary?.observedAt ?? String(actualRecord?.logged_at_utc || ''),
    wuDataSource:
      wuSummary?.reportedHighTemp != null
        ? 'wunderground'
        : actualRecord?.source
          ? String(actualRecord.source)
          : '',
    settlementTemp: actualRecord ? toNumberOrNull(actualRecord.actual_temp_c) : null,
    settlementObservedAt: String(actualRecord?.logged_at_utc || ''),
    settlementSource: String(actualRecord?.source || ''),
    timeline: normalizeTimelineEvents(row),
    ...extraFields,
  }
}

// 批量预拉当前 NWP：收集所有开仓中今日及未来仓位的城市+日期对，调 Python 脚本一次性拉取
const nwpInputPairs = [
  ...new Map(
    openRawPositions
      .filter((row) => String(row.target_date || '') >= todayUtc)
      .map((row) => [`${row.icao}-${row.target_date}`, { icao: row.icao, target_date: row.target_date }])
  ).values(),
]
const nwpBatchResult = batchFetchCurrentNwp(nwpInputPairs)
for (const [key, entries] of Object.entries(nwpBatchResult)) {
  currentNwpCache.set(key, entries)
}

const groupedPositions = groupBy(
  allPositions.filter((row) => String(row?.target_date || '') >= HISTORY_START_DATE),
  (row) => `${row.icao}-${row.target_date}`
)

const openPositions = await Promise.all(
  openRawPositions.map((row) =>
    buildPositionSnapshot(row, {
      viewStatus: 'open',
      timeline: normalizeTimelineEvents(
        row,
        groupedPositions.get(`${row.icao}-${row.target_date}`) || [row]
      ),
    })
  )
)

const historyPositions = await Promise.all(
  [...groupedPositions.entries()]
    .filter(([, rows]) => rows.length > 0 && !rows.some((row) => row?.status === 'open'))
    .map(async ([, rows]) => {
      const orderedRows = [...rows].sort((a, b) => {
        const exitCompare = String(a.exit_ts_utc || '').localeCompare(String(b.exit_ts_utc || ''))
        if (exitCompare !== 0) return exitCompare
        return String(a.entered_at_utc || '').localeCompare(String(b.entered_at_utc || ''))
      })
      const latestRow = orderedRows.at(-1)
      if (!latestRow) return null
      const settledAt =
        [...orderedRows]
          .map((row) => String(row.exit_ts_utc || ''))
          .filter(Boolean)
          .sort()
          .at(-1) || ''
      const totalRealizedPnl = Number(
        orderedRows.reduce((sum, row) => sum + Number(row.realized_pnl_usdc || 0), 0).toFixed(4)
      )
      const heldBrackets = [...new Set(
        orderedRows.map((row) => formatBracket(row.bracket_low, row.bracket_high))
      )]
      const timeline = normalizeTimelineEvents(latestRow, orderedRows)
      const hasSettlement = timeline.some((event) => event.eventType === 'SETTLEMENT')
        || orderedRows.some((row) => String(row?.status || '') === 'expired')

      let historyStatus = 'closed_no_reentry'
      if (hasSettlement) {
        historyStatus = totalRealizedPnl > 0 ? 'settled_win' : 'settled_loss'
      }

      return buildPositionSnapshot(latestRow, {
        id: `history-${latestRow.icao}-${latestRow.target_date}`,
        viewStatus: 'history',
        settledAt,
        totalRealizedPnl,
        heldPositionCount: orderedRows.length,
        heldBrackets,
        historyStatus,
        modelDetails: aggregateModelDetails(orderedRows),
        timeline,
      })
    })
)

const settledPositions = allPositions
  .filter((row) =>
    ['closed', 'expired'].includes(String(row?.status)) &&
    row?.exit_ts_utc &&
    typeof row?.realized_pnl_usdc === 'number'
  )
  .sort((a, b) => String(a.exit_ts_utc).localeCompare(String(b.exit_ts_utc)))

const recentSettled = settledPositions.slice(-8)
let cumulativePnl = 0
const chart = recentSettled.map((row) => {
  cumulativePnl += Number(row.realized_pnl_usdc || 0)
  return {
    time: formatChartLabel(row.exit_ts_utc),
    pnl: Number(cumulativePnl.toFixed(4)),
    singlePnl: Number(Number(row.realized_pnl_usdc || 0).toFixed(4)),
    icao: row.icao,
  }
})

const alertMap = new Map(
  (Array.isArray(monitorPayload.metar_alerts) ? monitorPayload.metar_alerts : []).map((row) => [
    `${row.icao}-${row.target_date}`,
    row,
  ])
)

const watchlist = (Array.isArray(monitorPayload.skipped) ? monitorPayload.skipped : [])
  .slice(0, 12)
  .map((row, index) => {
    const alert = alertMap.get(`${row.icao}-${row.date}`)
    return {
      id: `${row.icao}-${row.date}-${index}`,
      city: cityMap[row.icao] || row.icao,
      icao: row.icao,
      targetDate: row.date,
      bracket: alert ? formatBracket(alert.bracket_low, alert.bracket_low) : '未知',
      reason: translateSkipReason(row.reason),
      status: alert ? translateAlertStatus(alert.status) : '已扫描',
      runningMax: typeof alert?.running_max === 'number' ? alert.running_max : null,
    }
  })

const opportunities = (Array.isArray(weatherPayload.opportunities) ? weatherPayload.opportunities : [])
  .slice(0, 8)
  .map((row, index) => ({
    id: `${row.event_slug || index}`,
    city: slugToCity(row.event_slug, row.event_title || '未知市场'),
    targetDate: row.event_target_date || '',
    bracket: formatBracket(row.bracket_low, row.bracket_high),
    predictedTemp: row.confirmed_temp_c != null ? `${row.confirmed_temp_c}` : '未知',
    edgeBps: Number(row.net_edge_bps || 0),
    signalSource: row.signal_source || '',
  }))

const totalRealizedPnl = settledPositions.reduce(
  (sum, row) => sum + Number(row.realized_pnl_usdc || 0),
  0
)

const snapshot = {
  generatedAt: new Date().toISOString(),
  dataSources: {
    positionsSavedAt: positionsPayload.saved_at_utc || '',
    weatherScanAt: weatherPayload.ts_utc || '',
    monitorAt: monitorPayload.ts || '',
  },
  overview: {
    openPositions: openPositions.length,
    cityCount: new Set(openPositions.map((row) => row.city)).size,
    totalExposureUsdc: Number(
      openPositions.reduce((sum, row) => sum + row.sizeUsdc, 0).toFixed(4)
    ),
    totalRealizedPnlUsdc: Number(totalRealizedPnl.toFixed(4)),
    settledWins: settledPositions.filter((row) => Number(row.realized_pnl_usdc || 0) > 0).length,
    watchCount: watchlist.length,
    opportunityCount: Number(weatherPayload.opportunities_found || 0),
    alertCount: Array.isArray(monitorPayload.metar_alerts) ? monitorPayload.metar_alerts.length : 0,
    mode: monitorPayload.mode || weatherPayload.mode || 'unknown',
  },
  chart,
  positions: openPositions,
  historyPositions: historyPositions.filter(Boolean),
  watchlist,
  opportunities,
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })

// 保留上一次 generate-city-briefs.mjs 写入的 AI 播报，避免每次重建快照时被清空。
// push-snapshot 每5分钟跑一次，city-briefs 每小时跑一次，若不 merge 会丢失。
try {
  const existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf-8'))
  if (existing?.cityBriefs && typeof existing.cityBriefs === 'object') {
    snapshot.cityBriefs = existing.cityBriefs
    snapshot.cityBriefsGeneratedAt = existing.cityBriefsGeneratedAt
  }
} catch {
  // 首次运行或文件损坏时忽略
}

fs.writeFileSync(OUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8')
fs.writeFileSync(
  VERSION_JSON_PATH,
  `${JSON.stringify({ buildId: BUILD_ID, generatedAt: snapshot.generatedAt }, null, 2)}\n`,
  'utf-8'
)
fs.mkdirSync(path.dirname(BUILD_META_PATH), { recursive: true })
fs.writeFileSync(
  BUILD_META_PATH,
  `export const BUILD_ID = ${JSON.stringify(BUILD_ID)}\n`,
  'utf-8'
)
console.log(`[weather-snapshot] wrote ${OUT_PATH}`)
