/**
 * GET /api/weather-market-brief?positionId=<id>
 *
 * 为前端 WX BOT 卡片提供 AI 播报文本。
 * 从 Supabase 拉取最新快照 → 找到对应仓位 → 组 prompt → 调 Gemini 3.1 Pro → 返回 brief。
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

// ── 类型定义（与前端快照结构对齐）─────────────────────────────────────────
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

// ── highlights（纯数据，不依赖 AI）────────────────────────────────────────

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

function buildPrompt(pos: Position, h: Highlights): string {
  const rr = pos.roundRule

  // 当前模型预报（与入场时对比 delta）
  const modelLines = (pos.currentModelDetails ?? pos.modelDetails).map(cur => {
    const entry = pos.modelDetails.find(m => m.name === cur.name)
    const delta = entry ? cur.value - entry.value : null
    const deltaStr = delta !== null ? ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}°C vs 入场)` : ''
    return `  ${modelLabel(cur.name)}: ${tempToBracketDisplay(cur.value, rr)}${deltaStr}`
  }).join('\n')

  // 盘口前5档
  const bidLines = pos.topBidMarkets.slice(0, 5).map(
    m => `  ${m.tempLabel}: Bid ${m.bestBid.toFixed(3)}`
  ).join('\n')

  const pnlSign = h.pnlUsdc >= 0 ? '+' : ''
  const status = pos.viewStatus === 'history' ? '历史仓位（已结算）' : '当前持仓（开放中）'

  return `你是一位专业天气市场播报员。根据以下实时数据，用中文写一段 80 字以内的播报文案，直接给出结论，语气简洁像气象主播，不要任何解释或前缀。

【基本信息】
城市：${pos.city}（${pos.icao}）· ${pos.targetDate} · 持 ${pos.side} ${pos.bracket}
状态：${status}
入场价：${pos.entryPrice.toFixed(3)} → 当前价：${pos.currentPrice.toFixed(3)}，净盈亏：${pnlSign}${h.pnlUsdc.toFixed(2)} USDC

【实测气温】
METAR 实时：${h.metarActualTempC !== null ? h.metarActualTempC.toFixed(1) + '°C' : '暂无'}（今日峰值：${h.metarRunningMaxC !== null ? h.metarRunningMaxC.toFixed(1) + '°C' : '暂无'}）
WU 汇报最高温：${pos.wuReportedHighTemp !== null ? pos.wuReportedHighTemp.toFixed(1) + '°C' : '暂无'}

【各模型当前预报】
${modelLines}

【市场盘口（Bid 最高档位）】
${bidLines}

现在直接输出播报文案：`
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

  // 1. 拉快照
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

  // 2. 组装 highlights（不依赖 AI，始终有值）
  const highlights = buildHighlights(pos)

  // 3. 调 Gemini 3.1 Pro 生成播报文案，失败时降级到模板
  let brief: string
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
    const result = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: buildPrompt(pos, highlights),
    })
    const text = result.text?.trim() ?? ''
    // 空响应或异常长度也走兜底
    brief = text.length > 0 && text.length < 500 ? text : buildFallbackBrief(pos, highlights)
  } catch {
    // API Key 未配置、网络失败等均静默降级，不影响前端展示
    brief = buildFallbackBrief(pos, highlights)
  }

  return res.status(200).json({
    ok: true,
    generatedAt: new Date().toISOString(),
    version: 'v1',
    brief,
    highlights,
  })
}
