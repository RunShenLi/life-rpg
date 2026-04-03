import { useEffect, useEffectEvent, useState } from 'react'
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
  daysAhead: number
  signalSource: string
  enteredAt: string
  notes: string
  signalDetailReason: string
  modelUsed: string
  signalTemperature: number | null
  modelDetails: Array<{
    name: string
    value: number
  }>
  currentModelDetails: Array<{
    name: string
    value: number
  }> | null
  metarActualTemp: number | null
  metarObservedAt: string
  metarRunningMax: number | null
  metarSpeciCount: number
  metarSpeciMax: number | null
  metarRunningMaxFromSpeci: boolean
  boundaryWarning: boolean
  wuReportedHighTemp: number | null
  wuObservedAt: string
  wuDataSource: string
  topBidMarkets: Array<{
    slug: string
    bestBid: number
    bestAsk: number
    tempLabel: string
  }>
  viewStatus?: 'open' | 'history'
  settledAt?: string
  totalRealizedPnl?: number
  heldPositionCount?: number
  heldBrackets?: string[]
  historyStatus?: 'settled_win' | 'settled_loss' | 'closed_no_reentry'
  timeline: Array<{
    ts: string
    event_type?: string
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
    days_ahead?: number
    reason?: string
    won?: boolean
    size_usdc?: number
    entry_fee_usdc?: number
    token_id?: string
  }>
}

type WeatherSnapshot = {
  generatedAt: string
  positions: PositionDetail[]
  historyPositions: PositionDetail[]
}

const SNAPSHOT_REFRESH_MS = 30_000
const SNAPSHOT_HIDDEN_REFRESH_MS = 120_000

function formatDateTime(value: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatTimeInZone(value: string, timeZone: string) {
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

function formatDualZoneTime(value: string, marketTimeZone: string) {
  if (!value) return '暂无时间'
  return `北京 ${formatTimeInZone(value, 'Asia/Shanghai')} / 当地 ${formatTimeInZone(value, marketTimeZone)}`
}

function formatSignalSource(name: string) {
  const map: Record<string, string> = {
    nwp_poller: 'NWP 轮询',
    wu_forecast: 'Wunderground',
    gfs_seamless: 'GFS Seamless',
    icon_seamless: 'ICON Seamless',
    ecmwf_ifs025: 'ECMWF IFS',
    yr_no: 'YR',
    ukmo_seamless: 'UKMO Seamless',
    jma_seamless: 'JMA Seamless',
    cma_grapes_global: 'CMA Grapes',
    gfs_graphcast025: 'GFS Graphcast',
    gem_seamless: 'GEM Seamless',
  }
  return map[name] ?? name
}

function extractBestModel(signalDetailReason: string) {
  const match = signalDetailReason.match(/best_model_[^:]*:([a-z0-9_]+)/i)
  return match?.[1] ?? ''
}

function formatModelSummary(position: Pick<PositionDetail, 'modelUsed' | 'signalDetailReason'>) {
  const bestModel = extractBestModel(position.signalDetailReason)
  const bestLabel = formatSignalSource(bestModel || '--')
  const usedLabel = formatSignalSource(position.modelUsed || '--')

  if (!bestModel || bestModel === position.modelUsed) {
    return `最佳模型 ${usedLabel}`
  }

  return `最佳模型 ${bestLabel} · 执行模型 ${usedLabel}`
}

function formatActualSource(name: string) {
  const map: Record<string, string> = {
    wunderground: 'Wunderground',
    polymarket_settlement: 'Polymarket 结算',
    weather_oracle: 'Weather Oracle',
    metar_awc_settlement: 'METAR AWC',
  }
  return map[name] ?? name ?? '--'
}

function formatRebalanceReason(reason?: string) {
  const map: Record<string, string> = {
    bracket_shifted_no_bid: '目标档位已经变化，原档位也没有合适买盘，所以先按当前价格离场',
    bracket_shifted: '目标档位发生变化，按换仓规则离场',
    no_depth: '盘口深度不足，无法继续持有原仓位',
    risk_blocked: '触发风险控制，主动平掉原仓位',
    strategy_adjustment: '策略调整，切换到新的仓位结构',
  }
  return map[reason ?? ''] ?? reason ?? '策略调整'
}

function roundHalfUp(value: number) {
  return Math.floor(value + 0.5)
}

function tempToBracket(value: number, roundRule: string) {
  if (roundRule === 'fahrenheit') {
    return roundHalfUp(value * 9 / 5 + 32)
  }
  const fRounded = roundHalfUp(value * 9 / 5 + 32)
  return roundHalfUp((fRounded - 32) * 5 / 9)
}

function formatMarketTempWithReference(value: number | null, roundRule: string) {
  if (value === null) return '--'
  if (roundRule === 'fahrenheit') {
    return `${tempToBracket(value, roundRule)}°F (${value.toFixed(1)}°C)`
  }
  return `${tempToBracket(value, roundRule)}°C (${value.toFixed(1)}°C 原始)`
}

function computeCurrentBalance(position: Pick<PositionDetail, 'entryPrice' | 'currentPrice' | 'sizeUsdc' | 'entryFeeUsdc'>) {
  if (position.entryPrice <= 0) return 0
  return position.currentPrice * (position.sizeUsdc / position.entryPrice) - position.entryFeeUsdc
}

function computeCurrentNetPnl(position: Pick<PositionDetail, 'entryPrice' | 'currentPrice' | 'sizeUsdc' | 'entryFeeUsdc'>) {
  return computeCurrentBalance(position) - position.sizeUsdc
}

function formatHistoryStatus(status?: PositionDetail['historyStatus']) {
  const map = {
    settled_win: '已结算胜利',
    settled_loss: '已结算失败',
    closed_no_reentry: '中途平仓后未再接力',
  } as const
  return map[status ?? 'closed_no_reentry']
}

function historyStatusClass(status?: PositionDetail['historyStatus']) {
  if (status === 'settled_win') return 'text-green-400 border-green-500'
  if (status === 'settled_loss') return 'text-red-400 border-red-500'
  return 'text-yellow-400 border-yellow-500'
}

function findMatchingPosition(rows: PositionDetail[], positionId: string | undefined) {
  if (!positionId) return null
  const exact = rows.find((row) => row.id === positionId)
  if (exact) return exact
  return rows.find((row) => row.timeline.some((event) => String(event.token_id || '') === positionId)) ?? null
}

function computeLatestNetProfit(position: PositionDetail) {
  if (position.viewStatus === 'history' && position.totalRealizedPnl != null) {
    return position.totalRealizedPnl
  }

  const realizedChainPnl = position.timeline.reduce((sum, event) => {
    if (typeof event.realized_pnl === 'number') return sum + event.realized_pnl
    if (typeof event.final_pnl_usdc === 'number') return sum + event.final_pnl_usdc
    return sum
  }, 0)

  return realizedChainPnl + computeCurrentNetPnl(position)
}

export default function WeatherMarketDetailPage() {
  const { positionId } = useParams()
  const [position, setPosition] = useState<PositionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState('')
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [isPageVisible, setIsPageVisible] = useState(document.visibilityState === 'visible')

  const fetchSnapshot = useEffectEvent(async () => {
    const { data, error: supabaseError } = await supabase
      .from('weather_snapshots')
      .select('data')
      .eq('id', 1)
      .single()

    if (!supabaseError && data?.data) {
      return data.data as WeatherSnapshot
    }

    const response = await fetch(`/data/weather-market-snapshot.json?t=${Date.now()}`, {
      cache: 'no-store',
    })
    if (!response.ok) {
      const reason = supabaseError?.message || `snapshot_load_failed:${response.status}`
      throw new Error(reason)
    }
    return (await response.json()) as WeatherSnapshot
  })

  const loadSnapshot = useEffectEvent(async (background = false) => {
    try {
      if (background) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      const snapshot = await fetchSnapshot()
      const matched = findMatchingPosition(
        [...(snapshot.positions ?? []), ...(snapshot.historyPositions ?? [])],
        positionId
      )
      setPosition(matched)
      setError(matched ? null : 'market_not_found')
      setLastSyncAt(new Date().toISOString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown_error')
    } finally {
      if (background) {
        setRefreshing(false)
      } else {
        setLoading(false)
      }
    }
  })

  useEffect(() => {
    void loadSnapshot(false)
  }, [positionId])

  useEffect(() => {
    let timer = 0

    const scheduleRefresh = () => {
      window.clearInterval(timer)
      const nextInterval = document.visibilityState === 'visible'
        ? SNAPSHOT_REFRESH_MS
        : SNAPSHOT_HIDDEN_REFRESH_MS
      timer = window.setInterval(() => {
        void loadSnapshot(true)
      }, nextInterval)
    }

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible'
      setIsPageVisible(visible)
      scheduleRefresh()
      if (visible) {
        void loadSnapshot(true)
      }
    }

    const handleWindowFocus = () => {
      setIsPageVisible(true)
      void loadSnapshot(true)
    }

    const handleOnline = () => {
      void loadSnapshot(true)
    }

    scheduleRefresh()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener('online', handleOnline)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  function eventTone(event: PositionDetail['timeline'][number]) {
    const pnl = event.realized_pnl ?? event.final_pnl_usdc
    if (typeof pnl === 'number') {
      return pnl >= 0 ? 'border-green-700 text-green-300' : 'border-red-700 text-red-300'
    }
    if (typeof event.won === 'boolean') {
      return event.won ? 'border-green-700 text-green-300' : 'border-red-700 text-red-300'
    }
    return 'border-gray-700 text-gray-300'
  }

  function eventLabel(event: PositionDetail['timeline'][number]) {
    const map: Record<string, string> = {
      ENTRY: '初次出手',
      REBAL_OUT: '旧仓退场',
      REBAL_IN: '新仓接力',
      REBAL_SKIP: '观察后按兵不动',
      FORECAST_SHIFT: '预测风向变化',
      SETTLEMENT: '市场结算',
    }
    return map[event.eventType] ?? event.eventType
  }

  function bracketText(value?: number[]) {
    if (!value || value.length === 0) return '--'
    if (value[0] === value[1]) return String(value[0])
    return `${value[0]} ~ ${value[1]}`
  }

  function eventDescription(event: PositionDetail['timeline'][number], roundRule: string) {
    switch (event.eventType) {
      case 'ENTRY':
      case 'REBAL_IN':
        return `在 ${bracketText(event.bracket)} 档位进场，成交价 ${event.entry_price?.toFixed(3) ?? '--'}，投入 ${event.size_usdc?.toFixed(1) ?? '--'} USDC${(event.entry_fee_usdc ?? 0) > 0 ? `，买入手续费 ${(event.entry_fee_usdc ?? 0).toFixed(4)} USDC` : ''}。主判断来自 ${formatSignalSource(event.model || '--')}，给出的温度是 ${formatMarketTempWithReference(event.model_temp_c ?? null, roundRule)}。`
      case 'REBAL_OUT':
        return `原持仓 ${bracketText(event.bracket)} 档位离场，成交价 ${event.exit_price?.toFixed(3) ?? '--'}。这一步${typeof event.realized_pnl === 'number' ? `已实现 ${event.realized_pnl >= 0 ? '+' : ''}${event.realized_pnl.toFixed(2)} USDC` : '未记录盈亏'}，原因是 ${formatRebalanceReason(event.reason)}。`
      case 'REBAL_SKIP':
        return `模型判断从 ${bracketText(event.old_bracket)} 漂到 ${bracketText(event.new_bracket)}，但这次没有换仓。参考模型是 ${formatSignalSource(event.model || '--')}，对应温度 ${formatMarketTempWithReference(event.model_temp_c ?? null, roundRule)}。`
      case 'FORECAST_SHIFT':
        return `预报风向出现变化：从 ${bracketText(event.old_bracket)} 转到 ${bracketText(event.new_bracket)}。${formatSignalSource(event.model || '--')} 的温度判断由 ${formatMarketTempWithReference(event.old_temp_c ?? null, roundRule)} 变成了 ${formatMarketTempWithReference(event.new_temp_c ?? null, roundRule)}。`
      case 'SETTLEMENT':
        return `市场最终按 ${event.actual_bracket ?? '--'} 档位结算，实际温度记录为 ${formatMarketTempWithReference(event.actual_temp_c ?? null, roundRule)}。本局${event.won ? '收下胜利' : '遗憾失手'}${typeof event.final_pnl_usdc === 'number' ? `，最终盈亏 ${event.final_pnl_usdc >= 0 ? '+' : ''}${event.final_pnl_usdc.toFixed(2)} USDC` : '。'}`
      default:
        return '暂无说明'
    }
  }

  const isHistory = position?.viewStatus === 'history'
  const latestNetProfit = position ? computeLatestNetProfit(position) : 0

  return (
    <div className="p-4 md:p-8 max-w-lg md:max-w-5xl mx-auto space-y-6">
      <section className="pixel-card space-y-3">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <Link to="/world" className="hover:text-yellow-400 transition-colors">
            世界
          </Link>
          <span>/</span>
          <Link to="/world/polymarket" className="hover:text-yellow-400 transition-colors">
            Polymarket
          </Link>
          <span>/</span>
          <Link to="/world/polymarket/weather" className="hover:text-yellow-400 transition-colors">
            天气市场
          </Link>
          <span>/</span>
          <span className="text-gray-400">市场详情</span>
        </div>

        {loading ? (
          <div className="text-sm text-gray-400">正在载入市场详情...</div>
        ) : error || !position ? (
          <div className="text-sm text-red-400">市场详情读取失败：{error ?? 'unknown_error'}</div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <div className="pixel-text text-yellow-400">市场详情</div>
                <div className="text-gray-300 text-lg md:text-xl">{position.city}</div>
                <div className="text-xs text-gray-500 mt-2">
                  {position.icao} · {position.targetDate} · {position.side}
                </div>
                {isHistory && (
                  <div className={`inline-flex mt-2 px-2 py-1 border text-xs ${historyStatusClass(position.historyStatus)}`}>
                    {formatHistoryStatus(position.historyStatus)}
                  </div>
                )}
              </div>
              <div className="text-xs text-right text-gray-500 leading-6">
                {isHistory ? '结束时间' : '入场时间'}
                <br />
                {formatDualZoneTime(
                  isHistory ? position.settledAt || '' : position.enteredAt,
                  position.timeZone
                )}
                <br />
                自动刷新
                <br />
                {isPageVisible ? '前台 30 秒' : '后台 2 分钟'}
                {lastSyncAt ? ` · 上次同步 ${formatDateTime(lastSyncAt)}` : ''}
                <br />
                当前状态
                <br />
                {refreshing ? '同步中' : '已监听'}
              </div>
            </div>

            {position.boundaryWarning && (
              <div className="border border-yellow-600 bg-yellow-950/30 px-3 py-2 text-xs text-yellow-400">
                ⚠ 临界区警告：当前温度处于档位边界附近（±0.5°C 内跨越档位），预测结果对小幅误差敏感
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <div className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-400">
                {isHistory ? '最终净利润' : '最新净利润'}
                <br />
                <span className={latestNetProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {latestNetProfit >= 0 ? '+' : ''}{latestNetProfit.toFixed(2)} USDC
                </span>
              </div>
              <div className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-400">
                {isHistory ? '最后持仓温度区间' : '当前持仓温度区间'}
                <br />
                <span className="text-gray-200">{position.bracket}</span>
              </div>
              <div className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-400">
                入场价格
                <br />
                <span className="text-gray-200">{position.entryPrice.toFixed(3)}</span>
              </div>
              <div className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-400">
                {isHistory ? '结束价格' : '当前价格'}
                <br />
                <span className="text-gray-200">{position.currentPrice.toFixed(3)}</span>
              </div>
              <div className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-400">
                {isHistory ? '结束余额' : '当前余额'}
                <br />
                <span className="text-gray-200">{computeCurrentBalance(position).toFixed(2)} USDC</span>
              </div>
              {position.entryFeeUsdc > 0 && (
                <div className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-400">
                  买入手续费
                  <br />
                  <span className="text-gray-200">{position.entryFeeUsdc.toFixed(4)} USDC</span>
                </div>
              )}
              {isHistory && (
                <div className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-400">
                  累计已实现盈亏
                  <br />
                  <span className={(position.totalRealizedPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {position.totalRealizedPnl != null ? `${position.totalRealizedPnl >= 0 ? '+' : ''}${position.totalRealizedPnl.toFixed(2)} USDC` : '--'}
                  </span>
                </div>
              )}
              {isHistory && (
                <div className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-400">
                  持有过的档位
                  <br />
                  <span className="text-gray-200">{position.heldBrackets?.join(' → ') || position.bracket}</span>
                </div>
              )}
              <div className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-400">
                提前天数
                <br />
                <span className="text-gray-200">D+{position.daysAhead}</span>
              </div>
              <div className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-400">
                当前盘口
                <br />
                <span className="text-gray-200">
                  Bid {position.bestBid.toFixed(3)} / Ask {position.bestAsk.toFixed(3)}
                </span>
              </div>
              <div className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-400">
                <span>METAR 实时温度</span>
                {position.metarRunningMaxFromSpeci && (
                  <span className="ml-2 border border-orange-700 px-1 text-xs text-orange-400">SPECI</span>
                )}
                <br />
                <span className="text-gray-200">
                  {formatMarketTempWithReference(position.metarActualTemp, position.roundRule)}
                </span>
                {position.metarRunningMax != null && (
                  <div className="mt-1 text-xs text-gray-400">
                    今日最高 {formatMarketTempWithReference(position.metarRunningMax, position.roundRule)}
                  </div>
                )}
                <div className="mt-2 text-xs text-gray-500">
                  {position.metarObservedAt
                    ? `观测于 ${formatDualZoneTime(position.metarObservedAt, position.timeZone)}`
                    : '暂无实时观测'}
                  {position.metarSpeciCount > 0 && (
                    <div className="mt-1 text-orange-500/80">
                      今日收到 {position.metarSpeciCount} 条 SPECI 特殊报
                      {position.metarRunningMaxFromSpeci && '，最高温来自特殊报'}
                    </div>
                  )}
                </div>
              </div>
              <div className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-400">
                WU 汇报最高温
                <br />
                <span className="text-gray-200">
                  {formatMarketTempWithReference(position.wuReportedHighTemp, position.roundRule)}
                </span>
                <div className="mt-2 text-xs text-gray-500">
                  {position.wuObservedAt
                    ? `${formatActualSource(position.wuDataSource)} · ${formatDualZoneTime(position.wuObservedAt, position.timeZone)}`
                    : '目标日期暂无 WU 最高温'}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {!loading && position && (
        <>
          <section className="pixel-card space-y-4">
            <div className="border border-gray-800 bg-gray-950/50">
              <button
                type="button"
                onClick={() => setTimelineOpen((value) => !value)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
              >
                <span>{timelineOpen ? '▼' : '▶'} 详细动作</span>
                <span className="text-xs text-gray-500">{position.timeline.length} 条</span>
              </button>
              {timelineOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-gray-800">
                  {position.timeline.length === 0 ? (
                    <div className="text-xs text-gray-500 pt-2">当前市场暂无动作记录。</div>
                  ) : (
                    position.timeline.map((event, index) => (
                      <div
                        key={`${event.ts}-${event.eventType}-${index}`}
                        className={`border bg-gray-950/40 p-3 text-sm ${eventTone(event)}`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>{eventLabel(event)}</div>
                          <div className="text-xs text-gray-500">
                            {formatDualZoneTime(event.ts, position.timeZone)}
                          </div>
                        </div>
                        <div className="mt-2 text-xs leading-6">{eventDescription(event, position.roundRule)}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

          </section>

          <section className="pixel-card space-y-4">
            <div className="text-yellow-400 text-sm">NWP 预报对比</div>
            <div className="text-xs text-gray-500">
              {formatModelSummary(position)}
              {position.signalTemperature !== null ? ` · ${formatMarketTempWithReference(position.signalTemperature, position.roundRule)}` : ''}
            </div>
            {position.signalDetailReason && (
              <div className="text-xs text-gray-500 border border-gray-800 px-3 py-2">
                判定依据：{position.signalDetailReason}
              </div>
            )}
            {/* 表头 */}
            <div className="grid grid-cols-3 text-xs text-gray-600 px-1">
              <span>模型</span>
              <span>入场预报</span>
              <span>当前预报</span>
            </div>
            {/* 每行一个模型 */}
            {position.modelDetails.map((detail) => {
              const current = position.currentModelDetails?.find((c) => c.name === detail.name)
              const delta = current != null ? current.value - detail.value : null
              const deltaText = delta != null ? ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1)})` : ''
              const currentColor = delta != null && delta <= -0.5
                ? 'text-red-400'
                : delta != null && delta >= 0.5
                  ? 'text-green-400'
                  : 'text-gray-200'
              return (
                <div key={detail.name} className="grid grid-cols-3 border border-gray-700 bg-gray-950/40 px-3 py-2 text-sm items-center">
                  <span className="text-gray-400 text-xs">{formatSignalSource(detail.name)}</span>
                  <span className="text-gray-200">{formatMarketTempWithReference(detail.value, position.roundRule)}</span>
                  <span className={currentColor}>
                    {current != null ? formatMarketTempWithReference(current.value, position.roundRule) : '—'}
                    <span className="text-xs text-gray-500">{deltaText}</span>
                  </span>
                </div>
              )
            })}
          </section>

          <section className="pixel-card space-y-4">
            <div className="text-yellow-400 text-sm">该市场 BID 最高前三温度区间</div>
            <div className="grid gap-3 md:grid-cols-3">
              {position.topBidMarkets.map((market, index) => (
                <div key={market.slug} className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-400">
                  第 {index + 1} 位
                  <br />
                  <span className="text-gray-200">{market.tempLabel}</span>
                  <div className="mt-2 text-xs text-gray-500">
                    最高 Bid：{market.bestBid.toFixed(3)}
                    <br />
                    最低 Ask：{market.bestAsk.toFixed(3)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {position.notes && (
            <section className="pixel-card text-xs text-gray-500">
              备注：{position.notes}
            </section>
          )}
        </>
      )}
    </div>
  )
}
