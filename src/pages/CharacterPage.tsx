import { useState, useRef } from 'react'
import defaultAvatar from '../assets/default-avatar.svg'
import { useCharacterStore } from '../store/characterStore'
import { useAssetStore } from '../store/assetStore'
import type { Debuff } from '../types'

const SEVERITY_OPTIONS = [
  { value: 1, label: '轻度' },
  { value: 2, label: '中度' },
  { value: 3, label: '重度' },
] as const

const DEFAULT_BUFF_COLOR   = '#7ab648'
const DEFAULT_DEBUFF_COLOR = '#f87171'

function effectIcon(d: Debuff) {
  return (d.buff_type === 'buff' ? '▲' : '▼').repeat(d.severity)
}

export default function CharacterPage() {
  const { character, addTag, removeTag, addDebuff, removeDebuff, updateCharacter } = useCharacterStore()
  const { assets, snapshots } = useAssetStore()

  const [tagInput, setTagInput]       = useState('')
  const [debuffLabel, setDebuffLabel] = useState('')
  const [debuffColor, setDebuffColor] = useState(DEFAULT_DEBUFF_COLOR)
  const [debuffSeverity, setDebuffSeverity] = useState<1 | 2 | 3>(1)
  const [buffType, setBuffTypeRaw]    = useState<'buff' | 'debuff'>('debuff')

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!character) return null

  // ── 净值 & 对比 ──────────────────────────────────────────────────
  const todayValue = assets.reduce((sum, a) => sum + a.amount * a.unit_price, 0)
  const today      = new Date().toISOString().split('T')[0]
  const prevSnap   = [...snapshots]
    .filter((s) => s.snapshot_date < today)
    .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0]
  const diff = prevSnap != null ? todayValue - prevSnap.total_net_worth : null

  const [primaryClass, ...subClasses] = character.classes

  const buffs   = character.debuffs.filter((d) => d.buff_type === 'buff')
  const debuffs = character.debuffs.filter((d) => d.buff_type === 'debuff')

  const handleSetBuffType = (type: 'buff' | 'debuff') => {
    setBuffTypeRaw(type)
    setDebuffColor(type === 'buff' ? DEFAULT_BUFF_COLOR : DEFAULT_DEBUFF_COLOR)
  }

  const handleAddTag = () => {
    const next = tagInput.trim()
    if (!next || character.tags.includes(next)) return
    addTag(next)
    setTagInput('')
  }

  const handleAddDebuff = () => {
    const label = debuffLabel.trim()
    if (!label) return
    addDebuff({
      id: crypto.randomUUID(),
      character_id: character.id,
      label,
      color: debuffColor,
      severity: debuffSeverity,
      buff_type: buffType,
      created_at: new Date().toISOString(),
    })
    setDebuffLabel('')
    setDebuffSeverity(1)
    setDebuffColor(buffType === 'buff' ? DEFAULT_BUFF_COLOR : DEFAULT_DEBUFF_COLOR)
  }

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const MAX = 256
      const scale = Math.min(MAX / img.width, MAX / img.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      updateCharacter({ avatar_url: canvas.toDataURL('image/jpeg', 0.8) })
      URL.revokeObjectURL(objectUrl)
    }
    img.src = objectUrl
    e.target.value = ''
  }

  return (
    <div className="p-4 md:p-8 max-w-lg md:max-w-2xl mx-auto space-y-4">

      {/* Avatar + 基本信息 */}
      <div className="pixel-card flex gap-4 items-center">
        <div className="shrink-0 flex flex-col items-center gap-2">
          <div className="w-24 h-24 bg-gray-800 flex items-center justify-center overflow-hidden"
            style={{ border: '2px solid #f5c542', boxShadow: '0 0 8px rgba(245,197,66,0.3)' }}>
            <img
              src={character.avatar_url || defaultAvatar}
              alt="avatar"
              className={`w-full h-full pixelated ${character.avatar_url ? 'object-cover' : 'object-contain sprite-idle'}`}
            />
          </div>
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="w-24 py-1 text-xs border border-gray-600 text-gray-400 hover:border-yellow-500 hover:text-yellow-400 transition-colors">
            上传头像
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="text-yellow-400 font-bold text-base truncate">{character.name}</div>
          {primaryClass && (
            <div className="flex items-center gap-2">
              <span className="text-yellow-500 text-xs">[主]</span>
              <span className="text-gray-200 text-sm">{primaryClass.name}</span>
              <span className="text-gray-500 text-xs">Lv.{primaryClass.level}</span>
            </div>
          )}
          {subClasses.map((c) => (
            <div key={c.name} className="flex items-center gap-2">
              <span className="text-gray-600 text-xs">[副]</span>
              <span className="text-gray-400 text-sm">{c.name}</span>
              <span className="text-gray-600 text-xs">Lv.{c.level}</span>
            </div>
          ))}
        </div>
      </div>


      {/* 净值 + 昨日对比 */}
      <div className="pixel-card">
        <div className="text-gray-400 text-sm mb-1">今日净值</div>
        <div className="pixel-text text-yellow-400">
          ¥ {todayValue.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </div>
        {diff !== null && (
          <div className={`flex items-center gap-1.5 mt-2 text-sm ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            <span className={diff >= 0 ? 'arrow-bounce-up' : 'arrow-bounce-down'}>
              {diff >= 0 ? '▲' : '▼'}
            </span>
            <span>
              {diff >= 0 ? '+' : ''}
              ¥{Math.abs(diff).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              <span className="text-gray-600 text-xs ml-1">vs {prevSnap!.snapshot_date}</span>
            </span>
          </div>
        )}
      </div>

      {/* 标签 */}
      <div className="pixel-card space-y-3">
        <div className="text-gray-400 text-sm font-bold">标签</div>
        <div className="flex flex-wrap gap-2">
          {character.tags.length === 0 && <span className="text-gray-600 text-sm">暂无标签</span>}
          {character.tags.map((tag) => (
            <button key={tag} type="button" onClick={() => removeTag(tag)}
              className="flex items-center gap-1 px-3 min-h-[44px] bg-blue-900 border border-blue-500 text-blue-300 text-sm"
              title="点击删除">
              {tag} ×
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 text-gray-200 px-3 py-2 outline-none focus:border-green-500"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
            placeholder="新增标签"
          />
          <button type="button" onClick={handleAddTag}
            className="shrink-0 px-4 min-h-[44px] border border-green-500 text-green-400 text-sm hover:bg-green-900 transition-colors">
            添加
          </button>
        </div>
      </div>

      {/* 状态（正面 / 负面分区） */}
      <div className="pixel-card space-y-4">
        <div className="text-gray-400 text-sm font-bold">状态</div>

        <div className="space-y-2">
          <div className="text-xs text-green-400">▲ 正面效果</div>
          <div className="flex flex-wrap gap-2">
            {buffs.length === 0 && <span className="text-gray-600 text-sm">无</span>}
            {buffs.map((d) => (
              <button key={d.id} type="button" onClick={() => removeDebuff(d.id)}
                className="flex items-center gap-1 px-3 min-h-[44px] text-sm border"
                style={{ borderColor: d.color, color: d.color, backgroundColor: d.color + '28' }}>
                {effectIcon(d)} {d.label} ×
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-red-400">▼ 负面效果</div>
          <div className="flex flex-wrap gap-2">
            {debuffs.length === 0 && <span className="text-gray-600 text-sm">无</span>}
            {debuffs.map((d) => (
              <button key={d.id} type="button" onClick={() => removeDebuff(d.id)}
                className="flex items-center gap-1 px-3 min-h-[44px] text-sm border"
                style={{ borderColor: d.color, color: d.color, backgroundColor: d.color + '28' }}>
                {effectIcon(d)} {d.label} ×
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-2" style={{ borderTop: '1px solid #6b4423' }}>
          <input
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 px-3 py-2 outline-none focus:border-green-500"
            value={debuffLabel}
            onChange={(e) => setDebuffLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddDebuff()}
            placeholder="状态名称"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="flex border border-gray-700 overflow-hidden">
              <button type="button" onClick={() => handleSetBuffType('buff')}
                className={`flex-1 min-h-[44px] text-sm transition-colors ${buffType === 'buff' ? 'bg-green-800 text-green-300' : 'text-gray-500 hover:bg-gray-800'}`}>
                ▲ 正面
              </button>
              <button type="button" onClick={() => handleSetBuffType('debuff')}
                className={`flex-1 min-h-[44px] text-sm transition-colors ${buffType === 'debuff' ? 'bg-red-900 text-red-300' : 'text-gray-500 hover:bg-gray-800'}`}>
                ▼ 负面
              </button>
            </div>
            <select className="bg-gray-800 border border-gray-700 text-gray-200 px-2 outline-none min-h-[44px]"
              value={debuffSeverity}
              onChange={(e) => setDebuffSeverity(Number(e.target.value) as 1 | 2 | 3)}>
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <input type="color"
              className="w-12 min-h-[44px] bg-gray-800 border border-gray-700 shrink-0 cursor-pointer"
              value={debuffColor} onChange={(e) => setDebuffColor(e.target.value)} />
            <button type="button" onClick={handleAddDebuff}
              className={`flex-1 min-h-[44px] text-sm border transition-colors ${
                buffType === 'buff'
                  ? 'border-green-500 text-green-400 hover:bg-green-900/30'
                  : 'border-red-500 text-red-400 hover:bg-red-900/30'
              }`}>
              + 添加状态
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
