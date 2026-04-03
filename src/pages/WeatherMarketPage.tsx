import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type WeatherTab = 'overview' | 'positions' | 'history' | 'watchlist'
type PositionSortKey = 'profit' | 'targetDate'
type SortDirection = 'asc' | 'desc'

const SNAPSHOT_REFRESH_MS = 30_000
const SNAPSHOT_HIDDEN_REFRESH_MS = 120_000

type SnapshotOverview = {
  openPositions: number
  cityCount: number
  totalExposureUsdc: number
  totalRealizedPnlUsdc: number
  settledWins: number
  watchCount: number
  opportunityCount: number
  alertCount: number
  mode: string
}

type ChartPoint = {
  time: string
  pnl: number
  singlePnl: number
  icao: string
}

type PositionRow = {
  id: string
  eventSlug: string
  marketSlug: string
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
  metarActualTemp: number | null
  metarObservedAt: string
  metarRunningMax: number | null
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
}

type WatchRow = {
  id: string
  city: string
  icao: string
  targetDate: string
  bracket: string
  reason: string
  status: string
  runningMax: number | null
}

type OpportunityRow = {
  id: string
  city: string
  targetDate: string
  bracket: string
  predictedTemp: string
  edgeBps: number
  signalSource: string
}

type WeatherSnapshot = {
  generatedAt: string
  dataSources: {
    positionsSavedAt: string
    weatherScanAt: string
    monitorAt: string
  }
  overview: SnapshotOverview
  chart: ChartPoint[]
  positions: PositionRow[]
  historyPositions: PositionRow[]
  watchlist: WatchRow[]
  opportunities: OpportunityRow[]
}

function formatSigned(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
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

function formatModelSummary(row: Pick<PositionRow, 'modelUsed' | 'signalDetailReason'>) {
  const bestModel = extractBestModel(row.signalDetailReason)
  const bestLabel = formatSignalSource(bestModel || '--')
  const usedLabel = formatSignalSource(row.modelUsed || '--')

  if (!bestModel || bestModel === row.modelUsed) {
    return `最佳模型 ${usedLabel}`
  }

  return `最佳模型 ${bestLabel} · 执行模型 ${usedLabel}`
}

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

function computeUnrealizedPnl(row: PositionRow) {
  if (row.entryPrice <= 0) return 0
  return row.currentPrice * (row.sizeUsdc / row.entryPrice) - row.sizeUsdc - row.entryFeeUsdc
}

function computeCurrentBalance(row: PositionRow) {
  if (row.entryPrice <= 0) return 0
  return row.currentPrice * (row.sizeUsdc / row.entryPrice) - row.entryFeeUsdc
}

function formatHistoryStatus(status?: PositionRow['historyStatus']) {
  const map = {
    settled_win: '已结算胜利',
    settled_loss: '已结算失败',
    closed_no_reentry: '中途平仓后未再接力',
  } as const
  return map[status ?? 'closed_no_reentry']
}

function historyStatusClass(status?: PositionRow['historyStatus']) {
  if (status === 'settled_win') return 'text-green-400 border-green-500'
  if (status === 'settled_loss') return 'text-red-400 border-red-500'
  return 'text-yellow-400 border-yellow-500'
}

export default function WeatherMarketPage() {
  const [activeTab, setActiveTab] = useState<WeatherTab>('overview')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [expandedSignals, setExpandedSignals] = useState<Record<string, boolean>>({})
  const [positionSortKey, setPositionSortKey] = useState<PositionSortKey>('profit')
  const [positionSortDirection, setPositionSortDirection] = useState<SortDirection>('desc')
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState('')
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
      setSnapshot(snapshot)
      setError(null)
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
  }, [])

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

  const overview = snapshot?.overview
  const chartData = useMemo(() => snapshot?.chart ?? [], [snapshot])
  const latestPoint = chartData.at(-1)?.pnl ?? 0
  const positions = snapshot?.positions ?? []
  const historyPositions = snapshot?.historyPositions ?? []
  const watchlist = snapshot?.watchlist ?? []
  const opportunities = snapshot?.opportunities ?? []
  const sortedPositions = useMemo(() => {
    const rows = [...positions]
    rows.sort((left, right) => {
      const order = positionSortDirection === 'asc' ? 1 : -1

      if (positionSortKey === 'profit') {
        const leftValue = computeUnrealizedPnl(left)
        const rightValue = computeUnrealizedPnl(right)
        if (leftValue !== rightValue) {
          return (leftValue - rightValue) * order
        }
      } else {
        const byTargetDate = left.targetDate.localeCompare(right.targetDate)
        if (byTargetDate !== 0) {
          return byTargetDate * order
        }
        const byEnteredAt = left.enteredAt.localeCompare(right.enteredAt)
        if (byEnteredAt !== 0) {
          return byEnteredAt * order
        }
        const byDaysAhead = left.daysAhead - right.daysAhead
        if (byDaysAhead !== 0) {
          return byDaysAhead * order
        }
      }
      return left.city.localeCompare(right.city)
    })
    return rows
  }, [positionSortDirection, positionSortKey, positions])
  const unrealizedPnl = positions.reduce((sum, row) => sum + computeUnrealizedPnl(row), 0)
  const unrealizedPositiveCount = positions.filter((row) => computeUnrealizedPnl(row) > 0).length
  const unrealizedChartData = [...positions]
    .map((row) => ({
      city: row.city,
      icao: row.icao,
      pnl: Number(computeUnrealizedPnl(row).toFixed(4)),
    }))
    .sort((a, b) => b.pnl - a.pnl)

  const toggleSignalDetails = (id: string) => {
    setExpandedSignals((current) => ({
      ...current,
      [id]: !current[id],
    }))
  }

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
          <span className="text-gray-400">天气市场</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <div className="pixel-text text-yellow-400">WEATHER MARKET</div>
            <div className="text-gray-300 text-lg md:text-xl">天气市场观测站</div>
            <p className="text-sm text-gray-400 mt-2">
              当前页面展示的是部署时从 quant_strategy 导出的真实运行快照。
            </p>
          </div>
          <div className="text-xs text-right text-gray-500 leading-6">
            运行模式：{overview?.mode ?? '--'}
            <br />
            快照时间
            <br />
            {formatDateTime(snapshot?.generatedAt ?? '')}
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
      </section>

      <section className="pixel-card space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`shrink-0 px-4 min-h-[44px] text-sm border transition-colors ${
              activeTab === 'overview'
                ? 'border-yellow-400 text-yellow-400 bg-green-900/20'
                : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
            }`}
          >
            总览
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('positions')}
            className={`shrink-0 px-4 min-h-[44px] text-sm border transition-colors ${
              activeTab === 'positions'
                ? 'border-yellow-400 text-yellow-400 bg-green-900/20'
                : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
            }`}
          >
            当前持仓
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`shrink-0 px-4 min-h-[44px] text-sm border transition-colors ${
              activeTab === 'history'
                ? 'border-yellow-400 text-yellow-400 bg-green-900/20'
                : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
            }`}
          >
            历史持仓
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('watchlist')}
            className={`shrink-0 px-4 min-h-[44px] text-sm border transition-colors ${
              activeTab === 'watchlist'
                ? 'border-yellow-400 text-yellow-400 bg-green-900/20'
                : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
            }`}
          >
            已扫描未购入
          </button>
        </div>
      </section>

      {loading ? (
        <section className="pixel-card text-sm text-gray-400">正在载入天气市场快照...</section>
      ) : error ? (
        <section className="pixel-card text-sm text-red-400">
          天气市场快照读取失败：{error}
        </section>
      ) : activeTab === 'overview' ? (
        <section className="pixel-card space-y-4">
          <div className="border border-gray-700 bg-gray-950/40 p-4 space-y-3">
            <div className="text-yellow-400 text-sm">观测总览</div>
            <div className="grid gap-2 md:grid-cols-2 text-sm">
              <div className="text-gray-400">
                当前持仓：<span className="text-yellow-400">{overview?.openPositions ?? 0}</span>
              </div>
              <div className="text-gray-400">
                覆盖城市：<span className="text-blue-400">{overview?.cityCount ?? 0}</span>
              </div>
              <div className="text-gray-400">
                持仓敞口：<span className="text-blue-400">{(overview?.totalExposureUsdc ?? 0).toFixed(1)} USDC</span>
              </div>
              <div className="text-gray-400">
                累计已实现盈亏：
                <span className={(overview?.totalRealizedPnlUsdc ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {' '}{formatSigned(overview?.totalRealizedPnlUsdc ?? 0)} USDC
                </span>
              </div>
              <div className="text-gray-400">
                当前浮动盈亏：
                <span className={unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {' '}{formatSigned(unrealizedPnl)} USDC
                </span>
              </div>
              <div className="text-gray-400">
                已结算盈利仓位：<span className="text-green-400">{overview?.settledWins ?? 0}</span>
              </div>
              <div className="text-gray-400">
                当前浮盈仓位：<span className="text-green-400">{unrealizedPositiveCount}</span>
              </div>
              <div className="text-gray-400">
                已扫描未购入：<span className="text-yellow-400">{overview?.watchCount ?? 0}</span>
              </div>
              <div className="text-gray-400">
                扫描机会：<span className="text-yellow-400">{overview?.opportunityCount ?? 0}</span>
              </div>
              <div className="text-gray-400">
                监控告警：<span className="text-red-400">{overview?.alertCount ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="border border-gray-700 bg-gray-950/50 p-3 md:p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
              <div>
                <div className="text-green-400 text-sm">已实现收益曲线</div>
                <div className="text-xs text-gray-500">只统计最近 8 笔已结算仓位，不包含当前持仓浮盈浮亏</div>
              </div>
              <div className={`text-sm ${latestPoint >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                最新累计 {formatSigned(latestPoint)} USDC
              </div>
            </div>
            <div className="h-64 md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="weatherPnl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7ab648" stopOpacity={0.55} />
                      <stop offset="95%" stopColor="#7ab648" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#6b4423" strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fill: '#c9a87c', fontSize: 12 }} axisLine={{ stroke: '#8b5e35' }} tickLine={false} />
                  <YAxis
                    tick={{ fill: '#c9a87c', fontSize: 12 }}
                    axisLine={{ stroke: '#8b5e35' }}
                    tickLine={false}
                    width={52}
                    tickFormatter={(value) => `${value}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e1005',
                      border: '1px solid #6b4423',
                      color: '#f5e6c8',
                      fontSize: '12px',
                    }}
                    formatter={(value, _name, item) => {
                      const numeric = typeof value === 'number' ? value : Number(value ?? 0)
                      const singlePnl = Number(item?.payload?.singlePnl ?? 0)
                      return [
                        `累计 ${formatSigned(numeric)} USDC / 单笔 ${formatSigned(singlePnl)} USDC`,
                        item?.payload?.icao ?? '收益',
                      ]
                    }}
                    labelFormatter={(label) => `结算时间 ${label}`}
                  />
                  <Area type="monotone" dataKey="pnl" stroke="#f5c542" strokeWidth={3} fill="url(#weatherPnl)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border border-gray-700 bg-gray-950/50 p-3 md:p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
              <div>
                <div className="text-blue-400 text-sm">当前持仓浮盈曲线</div>
                <div className="text-xs text-gray-500">按当前 open positions 的浮动盈亏排序展示，不代表时间序列</div>
              </div>
              <div className={`text-sm ${unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                当前合计 {formatSigned(unrealizedPnl)} USDC
              </div>
            </div>
            <div className="h-64 md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={unrealizedChartData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#6b4423" strokeDasharray="3 3" />
                  <XAxis dataKey="icao" tick={{ fill: '#c9a87c', fontSize: 12 }} axisLine={{ stroke: '#8b5e35' }} tickLine={false} />
                  <YAxis
                    tick={{ fill: '#c9a87c', fontSize: 12 }}
                    axisLine={{ stroke: '#8b5e35' }}
                    tickLine={false}
                    width={52}
                    tickFormatter={(value) => `${value}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e1005',
                      border: '1px solid #6b4423',
                      color: '#f5e6c8',
                      fontSize: '12px',
                    }}
                    formatter={(value, _name, item) => {
                      const numeric = typeof value === 'number' ? value : Number(value ?? 0)
                      return [`浮动 ${formatSigned(numeric)} USDC`, item?.payload?.city ?? '持仓']
                    }}
                    labelFormatter={(label) => `城市 ${label}`}
                  />
                  <Line type="monotone" dataKey="pnl" stroke="#6bc7ff" strokeWidth={3} dot={{ r: 3, fill: '#6bc7ff' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      ) : activeTab === 'positions' ? (
        <section className="pixel-card space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <div className="text-yellow-400 text-sm">持仓总况</div>
              <div className="text-xs text-gray-500">
                当前展示真实 open positions。行情市价快照还未接入，所以这里先看结构和入场信息。
              </div>
            </div>
            <div className="flex flex-wrap gap-2 self-start">
              <select
                value={positionSortKey}
                onChange={(event) => setPositionSortKey(event.target.value as PositionSortKey)}
                className="px-3 min-h-[44px] text-sm border border-gray-700 bg-gray-950/40 text-gray-300 outline-none hover:border-yellow-400 focus:border-yellow-400"
                aria-label="持仓排序字段"
              >
                <option value="profit">盈利排序</option>
                <option value="targetDate">市场日期排序</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setPositionSortDirection((value) => (value === 'desc' ? 'asc' : 'desc'))
                }
                className="px-4 min-h-[44px] text-sm border border-gray-700 text-gray-300 hover:border-yellow-400 hover:text-yellow-400 transition-colors"
              >
                {positionSortDirection === 'desc' ? '倒排' : '正排'}
              </button>
              <button
                type="button"
                onClick={() => setDetailsOpen((value) => !value)}
                className="px-4 min-h-[44px] text-sm border border-gray-700 text-gray-300 hover:border-yellow-400 hover:text-yellow-400 transition-colors"
              >
                {detailsOpen ? '收起持仓明细' : '展开持仓明细'}
              </button>
            </div>
          </div>

          <div className="border border-gray-700 bg-gray-950/40 p-4 text-sm text-gray-300 space-y-2">
            <div className="text-yellow-400 text-sm">持仓汇总</div>
            <div className="text-gray-400 leading-7">
              当前共持有 <span className="text-yellow-400">{overview?.openPositions ?? 0}</span> 个仓位，
              覆盖 <span className="text-blue-400">{overview?.cityCount ?? 0}</span> 个城市，
              总敞口 <span className="text-blue-400">{(overview?.totalExposureUsdc ?? 0).toFixed(1)} USDC</span>。
            </div>
          </div>

          {detailsOpen && (
            <div className="space-y-3">
              {positions.length === 0 && (
                <div className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-500">
                  当前没有 open positions。
                </div>
              )}
              {sortedPositions.map((row) => (
                <div key={row.id} className="border border-gray-700 bg-gray-950/40 p-3 space-y-2">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <Link
                        to={`/world/polymarket/weather/${row.id}`}
                        className={`text-sm hover:text-yellow-400 transition-colors ${
                          computeUnrealizedPnl(row) > 0
                            ? 'text-green-400'
                            : computeUnrealizedPnl(row) < 0
                              ? 'text-red-400'
                              : 'text-blue-400'
                        }`}
                      >
                        {row.city}
                      </Link>
                      <div className="text-xs text-gray-500">
                        {row.icao} · {row.targetDate} · {row.side}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      入场时间 {formatDateTime(row.enteredAt)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                    <div className="border border-gray-800 px-2 py-2 text-gray-400">温度区间<br /><span className="text-gray-200">{row.bracket}</span></div>
                    <div className="border border-gray-800 px-2 py-2 text-gray-400">入场价格<br /><span className="text-gray-200">{row.entryPrice.toFixed(3)}</span></div>
                    <div className="border border-gray-800 px-2 py-2 text-gray-400">当前价格<br /><span className="text-gray-200">{row.currentPrice.toFixed(3)}</span></div>
                    <div className="border border-gray-800 px-2 py-2 text-gray-400">当前余额<br /><span className="text-gray-200">{computeCurrentBalance(row).toFixed(2)} USDC</span></div>
                    <div className="border border-gray-800 px-2 py-2 text-gray-400">提前天数<br /><span className="text-gray-200">D+{row.daysAhead}</span></div>
                    <div className="border border-gray-800 px-2 py-2 text-gray-400">信号源<br /><span className="text-gray-200">{formatSignalSource(row.signalSource)}</span></div>
                  </div>
                  {row.entryFeeUsdc > 0 && (
                    <div className="text-xs text-gray-500">
                      已计入买入手续费 {row.entryFeeUsdc.toFixed(4)} USDC
                    </div>
                  )}
                  <div className="border border-gray-800 px-3 py-2 text-xs text-gray-400 flex flex-col md:flex-row md:items-center md:justify-between gap-1">
                    <span>
                      METAR 实温 <span className="text-gray-200">{formatMarketTempWithReference(row.metarActualTemp, row.roundRule)}</span>
                    </span>
                    <span>
                      WU 最高温 <span className="text-gray-200">{formatMarketTempWithReference(row.wuReportedHighTemp, row.roundRule)}</span>
                    </span>
                  </div>
                  <div className="border border-gray-800 bg-gray-950/50">
                    <button
                      type="button"
                      onClick={() => toggleSignalDetails(row.id)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-400 hover:text-yellow-400 transition-colors"
                    >
                      <span>
                        {expandedSignals[row.id] ? '▼' : '▶'} 信号源温度明细
                      </span>
                      <span className="text-gray-500">
                        {formatModelSummary(row)}
                        {row.signalTemperature !== null ? ` · ${formatMarketTempWithReference(row.signalTemperature, row.roundRule)}` : ''}
                      </span>
                    </button>
                    {expandedSignals[row.id] && (
                      <div className="px-3 pb-3 space-y-2 border-t border-gray-800">
                        {row.signalDetailReason && (
                          <div className="text-xs text-gray-500 pt-2">
                            判定依据：{row.signalDetailReason}
                          </div>
                        )}
                        {row.modelDetails.length > 0 ? (
                          <div className="grid gap-2 md:grid-cols-2">
                            {row.modelDetails.map((detail) => (
                              <div
                                key={`${row.id}-${detail.name}`}
                                className="border border-gray-800 px-2 py-2 text-xs text-gray-400"
                              >
                                {formatSignalSource(detail.name)}
                                <br />
                                <span className="text-gray-200">{formatMarketTempWithReference(detail.value, row.roundRule)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-600 pt-2">当前仓位没有可用的信号源明细。</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : activeTab === 'history' ? (
        <section className="pixel-card space-y-4">
          <div>
            <div className="text-yellow-400 text-sm">历史持仓</div>
            <div className="text-xs text-gray-500">
              从 2026-04-03 开始统计。只要曾经买入过该市场，并且该市场当前已结算或已无 open 仓，就会进入这里。
            </div>
          </div>

          {historyPositions.length === 0 ? (
            <div className="border border-gray-700 bg-gray-950/40 p-3 text-sm text-gray-500">
              暂无历史持仓。
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {[...historyPositions]
                .sort((left, right) => {
                  const byDate = right.targetDate.localeCompare(left.targetDate)
                  if (byDate !== 0) return byDate
                  return String(right.settledAt || '').localeCompare(String(left.settledAt || ''))
                })
                .map((row) => (
                  <Link
                    key={row.id}
                    to={`/world/polymarket/weather/${row.id}`}
                    className="border border-gray-700 bg-gray-950/40 p-3 space-y-2 hover:border-yellow-400 transition-colors block"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-yellow-400 text-sm">{row.city}</div>
                        <div className="text-xs text-gray-500">
                          {row.icao} · {row.targetDate} · {row.side}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className={`text-sm ${(row.totalRealizedPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatSigned(row.totalRealizedPnl ?? 0)} USDC
                        </div>
                        <div className={`px-2 py-1 border text-xs ${historyStatusClass(row.historyStatus)}`}>
                          {formatHistoryStatus(row.historyStatus)}
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 text-xs">
                      <div className="border border-gray-800 px-2 py-2 text-gray-400">
                        持有过的档位
                        <br />
                        <span className="text-gray-200">{row.heldBrackets?.join(' → ') || row.bracket}</span>
                      </div>
                      <div className="border border-gray-800 px-2 py-2 text-gray-400">
                        结算/结束时间
                        <br />
                        <span className="text-gray-200">{formatDateTime(row.settledAt || '')}</span>
                      </div>
                      <div className="border border-gray-800 px-2 py-2 text-gray-400">
                        累计持仓段数
                        <br />
                        <span className="text-gray-200">{row.heldPositionCount ?? 1}</span>
                      </div>
                    </div>
                  </Link>
                ))}
            </div>
          )}
        </section>
      ) : (
        <section className="pixel-card space-y-4">
          <div>
            <div className="text-yellow-400 text-sm">扫描但未购入</div>
            <div className="text-xs text-gray-500">
              这一页基于监控跳过记录和最近扫描机会，重点解释“为什么看到了但没有买”。
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {watchlist.map((row) => (
              <div key={row.id} className="border border-gray-700 bg-gray-950/40 p-3 space-y-2">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <div className="text-blue-400 text-sm">{row.city}</div>
                    <div className="text-xs text-gray-500">
                      {row.icao} · {row.targetDate}
                    </div>
                  </div>
                  <div className="text-sm text-yellow-400">{row.status}</div>
                </div>
                <div className="grid gap-2 text-xs">
                  <div className="border border-gray-800 px-2 py-2 text-gray-400">目标区间<br /><span className="text-gray-200">{row.bracket}</span></div>
                  {row.runningMax !== null && (
                    <div className="border border-gray-800 px-2 py-2 text-gray-400">当前最高温<br /><span className="text-gray-200">{row.runningMax}</span></div>
                  )}
                  <div className="border border-gray-800 px-2 py-2 text-gray-400">未购入原因<br /><span className="text-gray-200">{row.reason}</span></div>
                </div>
              </div>
            ))}
          </div>

          {opportunities.length > 0 && (
            <div className="space-y-3">
              <div className="text-green-400 text-sm">最近扫描机会</div>
              <div className="grid gap-3 md:grid-cols-2">
                {opportunities.map((row) => (
                  <div key={row.id} className="border border-gray-700 bg-gray-950/40 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-blue-400 text-sm">{row.city}</div>
                        <div className="text-xs text-gray-500">{row.targetDate}</div>
                      </div>
                      <div className="text-sm text-green-400">{row.edgeBps.toFixed(0)} bps</div>
                    </div>
                    <div className="grid gap-2 text-xs">
                      <div className="border border-gray-800 px-2 py-2 text-gray-400">预测温度<br /><span className="text-gray-200">{row.predictedTemp}</span></div>
                      <div className="border border-gray-800 px-2 py-2 text-gray-400">目标区间<br /><span className="text-gray-200">{row.bracket}</span></div>
                      <div className="border border-gray-800 px-2 py-2 text-gray-400">信号来源<br /><span className="text-gray-200">{row.signalSource}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
