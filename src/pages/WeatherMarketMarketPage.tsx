import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type PositionDetail = {
  id: string
  city: string
  icao: string
  timeZone: string
  roundRule: string
  targetDate: string
  side: 'YES' | 'NO'
  bracket: string
  entryPrice: number
  currentPrice: number
  bestBid: number
  bestAsk: number
  sizeUsdc: number
  entryFeeUsdc: number
  signalDetailReason: string
  modelUsed: string
  signalTemperature: number | null
  modelDetails: Array<{ name: string; value: number }>
  currentModelDetails: Array<{ name: string; value: number }> | null
  metarActualTemp: number | null
  metarObservedAt: string
  metarRunningMax: number | null
  wuReportedHighTemp: number | null
  wuObservedAt: string
  topBidMarkets: Array<{
    slug: string
    bestBid: number
    bestAsk: number
    tempLabel: string
  }>
  viewStatus?: 'open' | 'history'
  settledAt?: string
  totalRealizedPnl?: number
  historyStatus?: 'settled_win' | 'settled_loss' | 'closed_no_reentry'
  timeline: Array<{
    ts: string
    eventType: string
    bracket?: number[]
    old_bracket?: number[]
    new_bracket?: number[]
    entry_price?: number
    exit_price?: number
    realized_pnl?: number
    final_pnl_usdc?: number
    actual_temp_c?: number
    actual_bracket?: number
    model?: string
    model_temp_c?: number
    old_temp_c?: number
    new_temp_c?: number
    reason?: string
    won?: boolean
    size_usdc?: number
    entry_fee_usdc?: number
    token_id?: string
  }>
}

type WeatherSnapshot = {
  generatedAt: string
  positions?: PositionDetail[]
  historyPositions?: PositionDetail[]
  cityBriefs?: Record<string, string>       // key: "ICAO-YYYY-MM-DD"
  cityBriefsGeneratedAt?: string
}

type ChatMessage = {
  id: string
  model: 'gemini' | 'claude' | 'gpt' | 'template'
  text: string
  timestamp: string
  loading: boolean
}

const SNAPSHOT_REFRESH_MS = 30_000
const SNAPSHOT_HIDDEN_REFRESH_MS = 120_000

function formatDateTime(value: string, timeZone?: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatNowInZone(timeZone: string) {
  return new Date().toLocaleString('zh-CN', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function roundHalfUp(value: number) {
  return Math.floor(value + 0.5)
}

function tempToBracket(value: number, roundRule: string) {
  if (roundRule === 'fahrenheit') return roundHalfUp(value * 9 / 5 + 32)
  const fRounded = roundHalfUp(value * 9 / 5 + 32)
  return roundHalfUp((fRounded - 32) * 5 / 9)
}

function formatSignalSource(name: string) {
  const map: Record<string, string> = {
    nwp_poller: 'NWP',
    wu_forecast: 'WU',
    gfs_seamless: 'GFS Seamless',
    icon_seamless: 'ICON Seamless',
    ecmwf_ifs025: 'ECMWF IFS',
    yr_no: 'YR',
    ukmo_seamless: 'UKMO',
    jma_seamless: 'JMA',
    cma_grapes_global: 'CMA',
    gfs_graphcast025: 'GraphCast',
    gem_seamless: 'GEM',
    metar_floor: 'METAR Floor',
  }
  return map[name] ?? name
}

function extractBestModel(signalDetailReason: string) {
  const match = signalDetailReason.match(/best_model_[^:]*:([a-z0-9_]+)/i)
  return match?.[1] ?? ''
}

function formatCompactTemp(value: number | null, roundRule: string) {
  if (value === null) return '--'
  return roundRule === 'fahrenheit'
    ? `${tempToBracket(value, roundRule)}°F`
    : `${tempToBracket(value, roundRule)}°C`
}

function formatRichTemp(value: number | null, roundRule: string) {
  if (value === null) return '--'
  return roundRule === 'fahrenheit'
    ? `${tempToBracket(value, roundRule)}°F / ${value.toFixed(1)}°C`
    : `${tempToBracket(value, roundRule)}°C / ${value.toFixed(1)}°C`
}

function computeCurrentBalance(position: Pick<PositionDetail, 'entryPrice' | 'currentPrice' | 'sizeUsdc' | 'entryFeeUsdc'>) {
  if (position.entryPrice <= 0) return 0
  return position.currentPrice * (position.sizeUsdc / position.entryPrice) - position.entryFeeUsdc
}

function computeCurrentNetPnl(position: Pick<PositionDetail, 'entryPrice' | 'currentPrice' | 'sizeUsdc' | 'entryFeeUsdc'>) {
  return computeCurrentBalance(position) - position.sizeUsdc
}

function findMatchingPosition(rows: PositionDetail[], positionId: string | undefined) {
  if (!positionId) return null
  const exact = rows.find((row) => row.id === positionId)
  if (exact) return exact
  return rows.find((row) => row.timeline.some((event) => String(event.token_id || '') === positionId)) ?? null
}

function bracketText(value?: number[]) {
  if (!value || value.length === 0) return '--'
  if (value[0] === value[1]) return String(value[0])
  return `${value[0]} ~ ${value[1]}`
}

function eventLabel(eventType: string) {
  const map: Record<string, string> = {
    ENTRY: '初次出手',
    REBAL_OUT: '旧仓退场',
    REBAL_IN: '新仓接力',
    REBAL_SKIP: '观察后按兵不动',
    FORECAST_SHIFT: '预测风向变化',
    SETTLEMENT: '市场结算',
  }
  return map[eventType] ?? eventType
}

function marketMatchesBracket(tempLabel: string, bracket: string) {
  const normalized = tempLabel.replace('°C', '').replace('°F', '')
  return normalized.includes(bracket)
}

function buildWeatherBrief(position: PositionDetail, variant: number) {
  const bestModel = extractBestModel(position.signalDetailReason) || position.modelUsed
  const leader = position.topBidMarkets[0] ?? null
  const metarNow = formatCompactTemp(position.metarActualTemp, position.roundRule)
  const metarHigh = formatCompactTemp(position.metarRunningMax, position.roundRule)
  const predicted = formatCompactTemp(position.signalTemperature, position.roundRule)
  const leaderLine = leader
    ? `盘口当前最强的是 ${leader.tempLabel}，买一在 ${leader.bestBid.toFixed(3)}。`
    : '盘口主档位暂时还不够清晰。'
  const holdVsLeader = leader && marketMatchesBracket(leader.tempLabel, position.bracket)
    ? `我们手里的 ${position.bracket} 档还站在主档位上。`
    : `我们手里的 ${position.bracket} 档和主档位已经不完全一致。`

  const scripts = [
    `${position.city} 这场我先播报一下。METAR 当前 ${metarNow}，日内最高 ${metarHigh}。最优模型 ${formatSignalSource(bestModel)} 给到 ${predicted}，${leaderLine}${holdVsLeader}`,
    `最新气象口径是：${position.city} 当前实测 ${metarNow}，今天最高摸到 ${metarHigh}。模型里领跑的是 ${formatSignalSource(bestModel)}，它把目标放在 ${predicted}。${leaderLine}`,
    `这场现在最值得盯的是温度、模型和盘口三件事。实测温度在 ${metarNow}，峰值是 ${metarHigh}；${formatSignalSource(bestModel)} 认为应看 ${predicted}。${holdVsLeader}${leaderLine}`,
  ]
  return scripts[variant % scripts.length]
}

function isValidSnapshot(payload: WeatherSnapshot | null | undefined) {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    Array.isArray(payload.positions) &&
    Array.isArray(payload.historyPositions),
  )
}

function normalizeSnapshot(payload: WeatherSnapshot | null | undefined): WeatherSnapshot {
  return {
    generatedAt: String(payload?.generatedAt || ''),
    positions: Array.isArray(payload?.positions) ? payload.positions : [],
    historyPositions: Array.isArray(payload?.historyPositions) ? payload.historyPositions : [],
    // cityBriefs 必须透传，否则 generate-city-briefs.mjs 写入的 AI 播报会在这里丢失
    cityBriefs: payload?.cityBriefs ?? {},
    cityBriefsGeneratedAt: payload?.cityBriefsGeneratedAt,
  }
}

export default function WeatherMarketMarketPage() {
  const { positionId } = useParams()
  const [position, setPosition] = useState<PositionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [briefVariant, setBriefVariant] = useState(0)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [lastSyncAt, setLastSyncAt] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [isPageVisible, setIsPageVisible] = useState(document.visibilityState === 'visible')
  // 预生成播报缓存（来自 generate-city-briefs.mjs，key = "ICAO-YYYY-MM-DD"）
  const cityBriefsRef = useRef<Record<string, string>>({})

  const fetchSnapshot = useEffectEvent(async () => {
    const { data, error: supabaseError } = await supabase
      .from('weather_snapshots')
      .select('data')
      .eq('id', 1)
      .single()
    if (!supabaseError && isValidSnapshot(data?.data as WeatherSnapshot)) {
      return normalizeSnapshot(data.data as WeatherSnapshot)
    }
    const response = await fetch(`/data/weather-market-snapshot.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(supabaseError?.message || `snapshot_load_failed:${response.status}`)
    return normalizeSnapshot((await response.json()) as WeatherSnapshot)
  })

  const loadSnapshot = useEffectEvent(async (background = false) => {
    try {
      if (background) setRefreshing(true)
      else setLoading(true)
      const snapshot = await fetchSnapshot()
      if (snapshot.cityBriefs) cityBriefsRef.current = snapshot.cityBriefs
      const matched = findMatchingPosition(
        [...(snapshot.positions ?? []), ...(snapshot.historyPositions ?? [])],
        positionId,
      )
      setPosition(matched)
      setError(matched ? null : 'market_not_found')
      setLastSyncAt(new Date().toISOString())
      // 初次加载时将预生成播报推入聊天。后台刷新（background=true）只更新
      // 仓位数据，不重置用户已有的聊天记录。
      if (!background && matched && snapshot.cityBriefs) {
        const pregenKey = `${matched.icao}-${matched.targetDate}`
        const pregenBrief = snapshot.cityBriefs[pregenKey]
        if (pregenBrief) {
          setChatMessages([{
            id: `gemini-pregen-${Date.now()}`,
            model: 'gemini',
            text: pregenBrief,
            timestamp: snapshot.cityBriefsGeneratedAt ?? new Date().toISOString(),
            loading: false,
          }])
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown_error')
    } finally {
      if (background) setRefreshing(false)
      else setLoading(false)
    }
  })

  useEffect(() => {
    void loadSnapshot(false)
  }, [positionId])

  useEffect(() => {
    if (!positionId) return
    setBriefVariant(0)
    setChatMessages([])
  }, [positionId])

  const callModel = useEffectEvent(async (model: 'gemini' | 'claude' | 'gpt') => {
    if (!positionId || !position) return
    // 拒绝并发：等待当前正在生成的消息完成
    if (chatMessages.some(m => m.loading)) return

    const msgId = `${model}-${Date.now()}`
    const timestamp = new Date().toISOString()
    setChatMessages(prev => [...prev, { id: msgId, model, text: '', timestamp, loading: true }])

    try {
      const res = await fetch(
        `/api/weather-market-brief?positionId=${encodeURIComponent(positionId)}&model=${model}`,
        { cache: 'no-store' },
      )
      const payload = await res.json() as { ok?: boolean; brief?: string; error?: string }
      if (!res.ok || !payload?.ok) {
        // API 返回明确错误（如 OPENROUTER_API_KEY 未配置），直接展示错误原因
        throw new Error(payload?.error ?? `HTTP ${res.status}`)
      }
      const text = String(payload?.brief || '').trim()
      if (!text) throw new Error('返回内容为空')
      setChatMessages(prev => prev.map(m => m.id === msgId ? { ...m, text, loading: false } : m))
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      setChatMessages(prev => prev.map(m =>
        m.id === msgId
          ? { ...m, model: 'template' as const, text: `调用失败：${errMsg}`, loading: false }
          : m,
      ))
    }
  })

  useEffect(() => {
    let timer = 0
    const scheduleRefresh = () => {
      window.clearInterval(timer)
      timer = window.setInterval(() => {
        void loadSnapshot(true)
      }, document.visibilityState === 'visible' ? SNAPSHOT_REFRESH_MS : SNAPSHOT_HIDDEN_REFRESH_MS)
    }
    const onVisibility = () => {
      const visible = document.visibilityState === 'visible'
      setIsPageVisible(visible)
      scheduleRefresh()
      if (visible) void loadSnapshot(true)
    }
    const onFocus = () => {
      setIsPageVisible(true)
      void loadSnapshot(true)
    }
    const onOnline = () => void loadSnapshot(true)
    scheduleRefresh()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  // 新消息进来时自动滚到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const isHistory = position?.viewStatus === 'history'
  const bestModel = position ? (extractBestModel(position.signalDetailReason) || position.modelUsed) : ''
  const pnl = useMemo(() => {
    if (!position) return 0
    if (position.viewStatus === 'history' && position.totalRealizedPnl != null) return position.totalRealizedPnl
    return computeCurrentNetPnl(position)
  }, [position])

  return (
    <div className="p-4 md:p-8 max-w-[1500px] mx-auto space-y-6">
      <section className="pixel-card space-y-4">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <Link to="/world" className="hover:text-yellow-400 transition-colors">世界</Link>
          <span>/</span>
          <Link to="/world/polymarket" className="hover:text-yellow-400 transition-colors">Polymarket</Link>
          <span>/</span>
          <Link to="/world/polymarket/weather" className="hover:text-yellow-400 transition-colors">天气市场</Link>
          <span>/</span>
          <span className="text-gray-400">市场页</span>
        </div>

        {loading ? (
          <div className="text-sm text-gray-400">正在载入市场页...</div>
        ) : error || !position ? (
          <div className="text-sm text-red-400">市场页读取失败：{error ?? 'unknown_error'}</div>
        ) : (
          <>
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
              <div className="space-y-2">
                <div className="pixel-text text-yellow-400">MARKET BOARD</div>
                <div className="text-2xl text-gray-100">{position.city}</div>
                <div className="text-xs text-gray-500 font-mono">
                  {position.icao} · {position.targetDate} · {position.side} · 持有档位 {position.bracket}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4 xl:min-w-[760px]">
                <div className="border border-gray-700 bg-gray-950/40 px-3 py-3">
                  <div className="text-[11px] text-gray-500">净利润</div>
                  <div className={`font-mono text-2xl ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}U
                  </div>
                </div>
                <div className="border border-gray-700 bg-gray-950/40 px-3 py-3">
                  <div className="text-[11px] text-gray-500">最佳模型</div>
                  <div className="text-sm text-yellow-300">{formatSignalSource(bestModel)}</div>
                </div>
                <div className="border border-gray-700 bg-gray-950/40 px-3 py-3">
                  <div className="text-[11px] text-gray-500">市场状态</div>
                  <div className="text-sm text-gray-200">{isHistory ? '历史市场' : '当前持仓'}</div>
                </div>
                <div className="border border-gray-700 bg-gray-950/40 px-3 py-3">
                  <div className="text-[11px] text-gray-500">自动刷新</div>
                  <div className="text-sm text-gray-200">{isPageVisible ? '前台 30 秒' : '后台 2 分钟'}</div>
                  <div className="text-[11px] text-gray-500">
                    {refreshing ? '同步中' : (lastSyncAt ? `上次同步 ${formatDateTime(lastSyncAt)}` : '等待同步')}
                  </div>
                </div>
                <div className="border border-gray-700 bg-gray-950/40 px-3 py-3">
                  <div className="text-[11px] text-gray-500">当地时间</div>
                  <div className="text-sm font-mono text-gray-200">{formatNowInZone(position.timeZone)}</div>
                </div>
              </div>
            </div>

            <section className="border border-yellow-600/70 bg-linear-to-r from-yellow-400/10 via-green-900/20 to-blue-900/20 p-4 space-y-3">
              {/* 标题栏 + 三个模型按钮 */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="pixel-text text-yellow-400">AI 分析室</div>
                  <div className="text-[11px] text-gray-500">多模型天气分析 · 实时播报</div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => void callModel('gemini')}
                    disabled={chatMessages.some(m => m.loading)}
                    className="border border-purple-500/70 bg-purple-500/10 px-3 py-1.5 text-xs text-purple-300 hover:bg-purple-500/20 disabled:opacity-50 disabled:cursor-wait"
                  >
                    🔮 Gemini
                  </button>
                  <button
                    type="button"
                    onClick={() => void callModel('claude')}
                    disabled={chatMessages.some(m => m.loading)}
                    className="border border-orange-500/70 bg-orange-500/10 px-3 py-1.5 text-xs text-orange-300 hover:bg-orange-500/20 disabled:opacity-50 disabled:cursor-wait"
                  >
                    🎭 Claude
                  </button>
                  <button
                    type="button"
                    onClick={() => void callModel('gpt')}
                    disabled={chatMessages.some(m => m.loading)}
                    className="border border-green-500/70 bg-green-500/10 px-3 py-1.5 text-xs text-green-300 hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-wait"
                  >
                    🤖 GPT
                  </button>
                </div>
              </div>

              {/* 可滚动聊天窗口 */}
              <div className="border border-gray-700 bg-gray-950/60 h-96 overflow-y-auto p-3 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-xs text-gray-600">
                      <div className="text-3xl mb-2">◕‿◕</div>
                      <div>加载中，或点击上方按钮召唤 AI 分析师</div>
                    </div>
                  </div>
                )}
                {chatMessages.map((msg) => {
                  const isGemini = msg.model === 'gemini'
                  const isClaude = msg.model === 'claude'
                  const isGpt = msg.model === 'gpt'
                  const avatarEmoji = isGemini ? '🔮' : isClaude ? '🎭' : isGpt ? '🤖' : '📋'
                  const modelName = isGemini ? 'Gemini 3.1 Pro' : isClaude ? 'Claude Opus 4.6' : isGpt ? 'GPT-5.4' : '模板播报'
                  const borderCls = isGemini ? 'border-purple-700/50' : isClaude ? 'border-orange-700/50' : isGpt ? 'border-green-700/50' : 'border-gray-700/50'
                  const bgCls = isGemini ? 'bg-purple-950/25' : isClaude ? 'bg-orange-950/25' : isGpt ? 'bg-green-950/25' : 'bg-gray-950/25'
                  const labelCls = isGemini ? 'text-purple-400' : isClaude ? 'text-orange-400' : isGpt ? 'text-green-400' : 'text-gray-500'
                  return (
                    <div key={msg.id} className={`border ${borderCls} ${bgCls} p-3 flex gap-3`}>
                      <div className="shrink-0 w-9 h-9 border border-gray-700 bg-gray-900/80 flex items-center justify-center text-lg select-none">
                        {avatarEmoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-[11px] font-mono font-semibold ${labelCls}`}>{modelName}</span>
                          <span className="text-[10px] text-gray-600">{formatDateTime(msg.timestamp)}</span>
                        </div>
                        {msg.loading ? (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
                            <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
                            <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
                            <span className="ml-2">正在分析中...</span>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-200 leading-7 whitespace-pre-wrap">{msg.text}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={chatEndRef} />
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr]">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="border border-green-700/70 bg-green-900/15 p-4">
                  <div className="text-[11px] uppercase tracking-[0.15em] text-green-400">METAR Now</div>
                  <div className="mt-3 font-mono text-3xl text-gray-100">{formatCompactTemp(position.metarActualTemp, position.roundRule)}</div>
                  <div className="mt-2 text-xs text-gray-500">{formatDateTime(position.metarObservedAt, position.timeZone)}</div>
                </div>
                <div className="border border-blue-700/70 bg-blue-900/15 p-4">
                  <div className="text-[11px] uppercase tracking-[0.15em] text-blue-400">Today High</div>
                  <div className="mt-3 font-mono text-3xl text-gray-100">{formatCompactTemp(position.metarRunningMax, position.roundRule)}</div>
                  <div className="mt-2 text-xs text-gray-500">WU {formatCompactTemp(position.wuReportedHighTemp, position.roundRule)}</div>
                </div>
                <div className="border border-yellow-600/70 bg-yellow-400/10 p-4">
                  <div className="text-[11px] uppercase tracking-[0.15em] text-yellow-400">Position</div>
                  <div className="mt-3 font-mono text-3xl text-gray-100">{position.bracket}</div>
                  <div className="mt-2 text-xs text-gray-500">
                    入场 {position.entryPrice.toFixed(3)} · 当前 {position.currentPrice.toFixed(3)}
                  </div>
                </div>
              </div>

              <div className="border border-gray-700 bg-gray-950/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-yellow-400 text-sm">行情摘要</div>
                    <div className="text-xs text-gray-500">保留木板质感，但把重要数字压成一屏可扫的广播式信息块。</div>
                  </div>
                  <Link to={`/world/polymarket/weather/${position.id}`} className="border border-gray-600 px-3 py-2 text-xs text-gray-300 hover:border-yellow-400 hover:text-yellow-300">
                    查看持仓详情
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div>
                    <div className="text-[11px] text-gray-500">预报温度</div>
                    <div className="font-mono text-lg text-gray-100">{formatRichTemp(position.signalTemperature, position.roundRule)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500">买一 / 卖一</div>
                    <div className="font-mono text-lg text-gray-100">{position.bestBid.toFixed(3)} / {position.bestAsk.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500">仓位余额</div>
                    <div className="font-mono text-lg text-gray-100">{computeCurrentBalance(position).toFixed(2)}U</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500">{isHistory ? '结束时间' : '观测时间'}</div>
                    <div className="font-mono text-sm text-gray-100">{formatDateTime(isHistory ? position.settledAt || '' : position.metarObservedAt, position.timeZone)}</div>
                  </div>
                </div>
              </div>
            </div>

            <section className="pixel-card space-y-4">
              <div className="text-yellow-400 text-sm">模型对比表</div>
              <div className="overflow-x-auto border border-gray-700 bg-gray-950/30">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-gray-950/80 text-[11px] uppercase tracking-[0.15em] text-gray-500">
                    <tr>
                      <th className="px-3 py-3 text-left">模型</th>
                      <th className="px-3 py-3 text-right font-mono">入场预报</th>
                      <th className="px-3 py-3 text-right font-mono">当前预报</th>
                      <th className="px-3 py-3 text-right font-mono">Delta</th>
                      <th className="px-3 py-3 text-right font-mono">对应档位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {position.modelDetails.map((detail) => {
                      const current = position.currentModelDetails?.find((item) => item.name === detail.name) ?? null
                      const currentValue = current?.value ?? detail.value
                      const delta = currentValue - detail.value
                      const targetBracket = formatCompactTemp(currentValue, position.roundRule)
                      const isBest = detail.name === bestModel
                      const holdsBracket = targetBracket.includes(position.bracket)
                      return (
                        <tr key={detail.name} className={`border-t border-gray-800 ${isBest ? 'bg-yellow-400/6' : ''}`}>
                          <td className="px-3 py-3">
                            <div className={`inline-flex items-center gap-2 ${isBest ? 'text-yellow-300' : 'text-gray-200'}`}>
                              <span>{formatSignalSource(detail.name)}</span>
                              {isBest && <span className="border border-yellow-500 px-1 py-0.5 text-[10px] font-mono">BEST</span>}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-gray-200">{formatCompactTemp(detail.value, position.roundRule)}</td>
                          <td className="px-3 py-3 text-right font-mono text-gray-200">{current ? formatCompactTemp(current.value, position.roundRule) : '--'}</td>
                          <td className={`px-3 py-3 text-right font-mono ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)}</td>
                          <td className="px-3 py-3 text-right">
                            <span className={`inline-flex px-2 py-1 font-mono border ${holdsBracket ? 'border-yellow-500 bg-yellow-400/10 text-yellow-300' : 'border-gray-700 text-gray-300'}`}>
                              {targetBracket}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="pixel-card space-y-4">
              <div className="text-yellow-400 text-sm">档位赔率面板</div>
              <div className="space-y-3">
                {position.topBidMarkets.map((market) => {
                  const active = marketMatchesBracket(market.tempLabel, position.bracket)
                  return (
                    <div key={market.slug} className={`border p-3 ${active ? 'border-yellow-500 bg-yellow-400/10' : 'border-gray-700 bg-gray-950/30'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-mono text-gray-100">{market.tempLabel}</div>
                        <div className="font-mono text-xs text-gray-400">Bid {market.bestBid.toFixed(3)} / Ask {market.bestAsk.toFixed(3)}</div>
                      </div>
                      <div className="mt-2 h-3 border border-gray-700 bg-gray-950">
                        <div className={`h-full ${active ? 'bg-yellow-400' : 'bg-green-500'}`} style={{ width: `${Math.max(0, Math.min(100, market.bestBid * 100))}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="pixel-card space-y-4">
              <button type="button" onClick={() => setTimelineOpen((value) => !value)} className="w-full flex items-center justify-between text-left">
                <div>
                  <div className="text-yellow-400 text-sm">时间线</div>
                  <div className="text-xs text-gray-500">保留原始链路，不和市场广播面板混在一起。</div>
                </div>
                <span className="text-sm text-gray-400">{timelineOpen ? '收起' : `展开 ${position.timeline.length} 条`}</span>
              </button>
              {timelineOpen && (
                <div className="space-y-2">
                  {position.timeline.map((event, index) => {
                    const pnlValue = event.realized_pnl ?? event.final_pnl_usdc
                    return (
                      <div key={`${event.ts}-${event.eventType}-${index}`} className="border border-gray-700 bg-gray-950/35 px-3 py-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-gray-100">{eventLabel(event.eventType)}</div>
                            <div className="text-xs text-gray-500 font-mono">{formatDateTime(event.ts, position.timeZone)}</div>
                          </div>
                          {typeof pnlValue === 'number' && (
                            <div className={`font-mono ${pnlValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {pnlValue >= 0 ? '+' : ''}{pnlValue.toFixed(2)}U
                            </div>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-gray-400 leading-6">
                          {event.bracket && <span>档位 {bracketText(event.bracket)} </span>}
                          {event.old_bracket && <span>原档位 {bracketText(event.old_bracket)} </span>}
                          {event.new_bracket && <span>新档位 {bracketText(event.new_bracket)} </span>}
                          {typeof event.entry_price === 'number' && <span>入场 {event.entry_price.toFixed(3)} </span>}
                          {typeof event.exit_price === 'number' && <span>离场 {event.exit_price.toFixed(3)} </span>}
                          {typeof event.model_temp_c === 'number' && <span>模型温度 {event.model_temp_c.toFixed(1)}°C </span>}
                          {typeof event.actual_temp_c === 'number' && <span>实测 {event.actual_temp_c.toFixed(1)}°C </span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </div>
  )
}
