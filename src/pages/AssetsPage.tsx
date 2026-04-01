import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useAssetStore } from '../store/assetStore'
import type { Asset, AssetType } from '../types'

const TYPE_LABELS: Record<AssetType, string> = {
  cash: '现金',
  stock: '股票',
  fund: '基金',
  crypto: '加密货币',
  property: '房产',
  other: '其他',
}

const TYPE_ORDER: AssetType[] = ['cash', 'stock', 'fund', 'crypto', 'property', 'other']

type AssetDraft = {
  name: string
  type: AssetType
  amount: string
  unit_price: string
  note: string
}

const EMPTY_DRAFT: AssetDraft = {
  name: '',
  type: 'cash',
  amount: '',
  unit_price: '',
  note: '',
}

function toDraft(asset: Asset): AssetDraft {
  return {
    name: asset.name,
    type: asset.type,
    amount: String(asset.amount),
    unit_price: String(asset.unit_price),
    note: asset.note,
  }
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export default function AssetsPage() {
  const { assets, snapshots, addAsset, updateAsset, removeAsset, upsertSnapshot } = useAssetStore()
  const totalNetWorth = assets.reduce((sum, a) => sum + a.amount * a.unit_price, 0)
  const [snapshotDone, setSnapshotDone] = useState(false)
  const [newAsset, setNewAsset] = useState<AssetDraft>(EMPTY_DRAFT)
  const [newAssetError, setNewAssetError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState<AssetDraft>(EMPTY_DRAFT)

  const grouped = TYPE_ORDER.reduce<Record<AssetType, typeof assets>>((acc, type) => {
    acc[type] = assets.filter((a) => a.type === type)
    return acc
  }, {} as Record<AssetType, typeof assets>)

  const updateDraftField = (
    setter: React.Dispatch<React.SetStateAction<AssetDraft>>,
    field: keyof AssetDraft,
    value: string
  ) => {
    setter((draft) => ({ ...draft, [field]: value }))
  }

  const handleSnapshot = () => {
    upsertSnapshot({
      id: crypto.randomUUID(),
      snapshot_date: new Date().toISOString().slice(0, 10),
      total_net_worth: totalNetWorth,
      created_at: new Date().toISOString(),
    })
    setSnapshotDone(true)
    setTimeout(() => setSnapshotDone(false), 2000)
  }

  const handleCreateAsset = () => {
    const name = newAsset.name.trim()
    const amount = parsePositiveNumber(newAsset.amount)
    const unitPrice = parsePositiveNumber(newAsset.unit_price)
    if (!name) { setNewAssetError('请填写资产名称'); return }
    if (amount === null) { setNewAssetError('数量必须为非负数'); return }
    if (unitPrice === null) { setNewAssetError('单价必须为非负数'); return }
    setNewAssetError(null)

    addAsset({
      id: crypto.randomUUID(),
      name,
      type: newAsset.type,
      amount,
      unit_price: unitPrice,
      note: newAsset.note.trim(),
      updated_at: new Date().toISOString(),
    })
    setNewAsset(EMPTY_DRAFT)
    setNewAssetError(null)
  }

  const startEditing = (asset: Asset) => {
    setEditingId(asset.id)
    setEditingDraft(toDraft(asset))
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingDraft(EMPTY_DRAFT)
  }

  const saveEditing = (assetId: string) => {
    const name = editingDraft.name.trim()
    const amount = parsePositiveNumber(editingDraft.amount)
    const unitPrice = parsePositiveNumber(editingDraft.unit_price)
    if (!name || amount === null || unitPrice === null) return

    updateAsset(assetId, {
      name,
      type: editingDraft.type,
      amount,
      unit_price: unitPrice,
      note: editingDraft.note.trim(),
    })
    cancelEditing()
  }

  const chartData = [...snapshots]
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
    .map((s) => ({
      date: s.snapshot_date.slice(5),  // MM-DD
      fullDate: s.snapshot_date,
      value: s.total_net_worth,
    }))

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <div className="pixel-card flex justify-between items-center">
        <span className="text-gray-400 text-xs">总净值</span>
        <span className="pixel-text text-yellow-400 text-sm">
          ¥ {totalNetWorth.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </span>
      </div>

      <div className="pixel-card space-y-3">
        <div className="text-green-400 text-xs border-b border-gray-700 pb-1">[新增资产]</div>
        <input
          className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
          value={newAsset.name}
          onChange={(e) => updateDraftField(setNewAsset, 'name', e.target.value)}
          placeholder="名称"
        />
        <div className="grid grid-cols-3 gap-2">
          <select
            className="bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
            value={newAsset.type}
            onChange={(e) => updateDraftField(setNewAsset, 'type', e.target.value)}
          >
            {TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="any"
            className="bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
            value={newAsset.amount}
            onChange={(e) => updateDraftField(setNewAsset, 'amount', e.target.value)}
            placeholder="数量"
          />
          <input
            type="number"
            min="0"
            step="any"
            className="bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
            value={newAsset.unit_price}
            onChange={(e) => updateDraftField(setNewAsset, 'unit_price', e.target.value)}
            placeholder="单价"
          />
        </div>
        <input
          className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
          value={newAsset.note}
          onChange={(e) => updateDraftField(setNewAsset, 'note', e.target.value)}
          placeholder="备注（可选）"
        />
        {newAssetError && (
          <div className="text-red-400 text-xs border border-red-500 px-2 py-1">{newAssetError}</div>
        )}
        <button
          type="button"
          onClick={handleCreateAsset}
          className="w-full py-2 border border-green-500 text-green-400 text-xs hover:bg-green-900 transition-colors"
        >
          [ 保存资产 ]
        </button>
      </div>

      {TYPE_ORDER.map((type) => {
        const group = grouped[type]
        if (group.length === 0) return null
        return (
          <div key={type} className="pixel-card space-y-3">
            <div className="text-green-400 text-xs border-b border-gray-700 pb-1">[{TYPE_LABELS[type]}]</div>
            {group.map((asset) => {
              const isEditing = editingId === asset.id
              const current = isEditing ? editingDraft : toDraft(asset)
              const value = asset.amount * asset.unit_price
              const pct = totalNetWorth > 0 ? ((value / totalNetWorth) * 100).toFixed(1) : '0.0'

              return (
                <div key={asset.id} className="border border-gray-800 p-2 space-y-2">
                  {isEditing ? (
                    <>
                      <input
                        className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
                        value={current.name}
                        onChange={(e) => updateDraftField(setEditingDraft, 'name', e.target.value)}
                        placeholder="名称"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          className="bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
                          value={current.type}
                          onChange={(e) => updateDraftField(setEditingDraft, 'type', e.target.value)}
                        >
                          {TYPE_ORDER.map((option) => (
                            <option key={option} value={option}>
                              {TYPE_LABELS[option]}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className="bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
                          value={current.amount}
                          onChange={(e) => updateDraftField(setEditingDraft, 'amount', e.target.value)}
                          placeholder="数量"
                        />
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className="bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
                          value={current.unit_price}
                          onChange={(e) => updateDraftField(setEditingDraft, 'unit_price', e.target.value)}
                          placeholder="单价"
                        />
                      </div>
                      <input
                        className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
                        value={current.note}
                        onChange={(e) => updateDraftField(setEditingDraft, 'note', e.target.value)}
                        placeholder="备注"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => saveEditing(asset.id)}
                          className="flex-1 py-1 border border-green-500 text-green-400 text-xs hover:bg-green-900 transition-colors"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="flex-1 py-1 border border-gray-600 text-gray-400 text-xs hover:bg-gray-800 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between items-start gap-3 text-xs">
                        <div className="space-y-1">
                          <div className="text-gray-300">{asset.name}</div>
                          <div className="text-gray-500">
                            {asset.amount} × ¥{asset.unit_price.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                          </div>
                          {asset.note && <div className="text-gray-600">{asset.note}</div>}
                        </div>
                        <div className="text-right">
                          <div className="text-gray-400">
                            ¥{value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-gray-600">{pct}%</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditing(asset)}
                          className="flex-1 py-1 border border-blue-500 text-blue-400 text-xs hover:bg-blue-900/30 transition-colors"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAsset(asset.id)}
                          className="flex-1 py-1 border border-red-500 text-red-400 text-xs hover:bg-red-900/30 transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {assets.length === 0 && <div className="pixel-card text-gray-600 text-xs text-center">暂无资产记录</div>}

      <button
        onClick={handleSnapshot}
        className="w-full py-2 border border-green-500 text-green-400 text-xs hover:bg-green-900 transition-colors"
      >
        {snapshotDone ? '✓ 已记录' : '[ 记录今日快照 ]'}
      </button>

      {chartData.length > 0 && (
        <div className="pixel-card">
          <div className="text-gray-400 text-xs mb-3">
            净值走势 <span className="text-gray-600">({chartData.length} 条记录)</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 8, fill: '#6b7280' }} tickLine={false} />
              <YAxis
                tick={{ fontSize: 8, fill: '#6b7280' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `¥${(v / 10000).toFixed(1)}w`}
                width={48}
              />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #22c55e', fontSize: 10, fontFamily: 'monospace' }}
                formatter={(v) => [`¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`, '净值']}
                labelFormatter={(label) => `日期：${label}`}
              />
              <Line type="monotone" dataKey="value" stroke="#facc15" dot={{ r: 2, fill: '#facc15' }} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
