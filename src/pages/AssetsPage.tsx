import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useAssetStore } from '../store/assetStore'
import type { AssetType } from '../types'

const TYPE_LABELS: Record<AssetType, string> = {
  cash: '现金',
  stock: '股票',
  fund: '基金',
  crypto: '加密货币',
  property: '房产',
  other: '其他',
}

const TYPE_ORDER: AssetType[] = ['cash', 'stock', 'fund', 'crypto', 'property', 'other']

export default function AssetsPage() {
  const { assets, snapshots, addSnapshot } = useAssetStore()
  const totalNetWorth = assets.reduce((sum, a) => sum + a.amount * a.unit_price, 0)
  const [snapshotDone, setSnapshotDone] = useState(false)

  const grouped = TYPE_ORDER.reduce<Record<AssetType, typeof assets>>((acc, type) => {
    acc[type] = assets.filter((a) => a.type === type)
    return acc
  }, {} as Record<AssetType, typeof assets>)

  const handleSnapshot = () => {
    addSnapshot({
      id: crypto.randomUUID(),
      snapshot_date: new Date().toISOString().slice(0, 10),
      total_net_worth: totalNetWorth,
      created_at: new Date().toISOString(),
    })
    setSnapshotDone(true)
    setTimeout(() => setSnapshotDone(false), 2000)
  }

  const chartData = snapshots.map((s) => ({
    date: s.snapshot_date,
    value: s.total_net_worth,
  }))

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      {/* Total */}
      <div className="pixel-card flex justify-between items-center">
        <span className="text-gray-400 text-xs">总净值</span>
        <span className="pixel-text text-yellow-400 text-sm">
          ¥ {totalNetWorth.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* Asset groups */}
      {TYPE_ORDER.map((type) => {
        const group = grouped[type]
        if (group.length === 0) return null
        return (
          <div key={type} className="pixel-card space-y-2">
            <div className="text-green-400 text-xs border-b border-gray-700 pb-1">[{TYPE_LABELS[type]}]</div>
            {group.map((asset) => {
              const value = asset.amount * asset.unit_price
              const pct = totalNetWorth > 0 ? ((value / totalNetWorth) * 100).toFixed(1) : '0.0'
              return (
                <div key={asset.id} className="flex justify-between items-center text-xs">
                  <span className="text-gray-300">{asset.name}</span>
                  <span className="text-gray-400">
                    ¥{value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    <span className="text-gray-600 ml-2">{pct}%</span>
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}

      {assets.length === 0 && (
        <div className="pixel-card text-gray-600 text-xs text-center">暂无资产记录</div>
      )}

      {/* Snapshot button */}
      <button
        onClick={handleSnapshot}
        className="w-full py-2 border border-green-500 text-green-400 text-xs hover:bg-green-900 transition-colors"
      >
        {snapshotDone ? '✓ 已记录' : '[ 记录今日快照 ]'}
      </button>

      {/* Net worth chart */}
      {chartData.length > 1 && (
        <div className="pixel-card">
          <div className="text-gray-400 text-xs mb-3">净值走势</div>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 8, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 8, fill: '#6b7280' }} />
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid #22c55e', fontSize: 10 }}
              />
              <Line type="monotone" dataKey="value" stroke="#facc15" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
