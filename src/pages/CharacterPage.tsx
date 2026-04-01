import { useState } from 'react'
import defaultAvatar from '../assets/default-avatar.svg'
import { useCharacterStore } from '../store/characterStore'
import { useAssetStore } from '../store/assetStore'
import type { Debuff } from '../types'

const SEVERITY_OPTIONS = [
  { value: 1, label: '轻度' },
  { value: 2, label: '中度' },
  { value: 3, label: '重度' },
] as const

function effectIcon(d: Debuff) {
  const arrow = d.buff_type === 'buff' ? '▲' : '▼'
  return arrow.repeat(d.severity)
}

export default function CharacterPage() {
  const { character, addTag, removeTag, addDebuff, removeDebuff } = useCharacterStore()
  const { assets } = useAssetStore()

  const [tagInput, setTagInput] = useState('')
  const [debuffLabel, setDebuffLabel] = useState('')
  const [debuffColor, setDebuffColor] = useState('#f87171')
  const [debuffSeverity, setDebuffSeverity] = useState<1 | 2 | 3>(1)
  const [debuffBuffType, setDebuffBuffType] = useState<'buff' | 'debuff'>('debuff')

  const totalNetWorth = assets.reduce((sum, a) => sum + a.amount * a.unit_price, 0)

  if (!character) return null

  const expPercent = Math.min((character.exp % 1000) / 10, 100)
  const [primaryClass, ...subClasses] = character.classes ?? []

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
      buff_type: debuffBuffType,
      created_at: new Date().toISOString(),
    })
    setDebuffLabel('')
    setDebuffColor('#f87171')
    setDebuffSeverity(1)
    setDebuffBuffType('debuff')
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">

      {/* Avatar + 基本信息 */}
      <div className="pixel-card flex gap-4 items-center">
        <div className="w-20 h-20 bg-gray-800 border-2 border-green-400 flex items-center justify-center overflow-hidden shrink-0">
          <img
            src={character.avatar_url || defaultAvatar}
            alt="avatar"
            className="w-full h-full object-contain pixelated sprite-idle"
          />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="pixel-text text-green-400 text-sm truncate">{character.name}</div>
          {/* 主职业 */}
          {primaryClass && (
            <div className="flex items-center gap-1">
              <span className="text-yellow-500 text-xs">[主]</span>
              <span className="text-gray-300 text-xs">{primaryClass}</span>
            </div>
          )}
          {/* 副职业 */}
          {subClasses.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {subClasses.map((c) => (
                <span key={c} className="text-gray-500 text-xs">[副]{c}</span>
              ))}
            </div>
          )}
          <div className="text-gray-600 text-xs">LV.{character.level}</div>
        </div>
      </div>

      {/* EXP 条 */}
      <div className="pixel-card space-y-2">
        <div className="flex justify-between text-xs text-gray-400">
          <span>EXP</span>
          <span>{character.exp % 1000} / 1000</span>
        </div>
        <div className="w-full bg-gray-700 h-3 border border-gray-600">
          <div className="h-full bg-yellow-400 transition-all" style={{ width: `${expPercent}%` }} />
        </div>
      </div>

      {/* 净值 */}
      <div className="pixel-card">
        <div className="text-gray-400 text-xs mb-1">今日净值</div>
        <div className="pixel-text text-yellow-400">
          ¥ {totalNetWorth.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </div>
      </div>

      {/* 标签 */}
      <div className="pixel-card space-y-3">
        <div className="text-gray-400 text-xs">标签</div>
        <div className="flex flex-wrap gap-2">
          {character.tags.length === 0 && <span className="text-gray-600 text-xs">暂无标签</span>}
          {character.tags.map((tag) => (
            <button key={tag} type="button" onClick={() => removeTag(tag)}
              className="px-2 py-0.5 bg-blue-900 border border-blue-500 text-blue-300 text-xs" title="删除">
              {tag} ×
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
            placeholder="新增标签"
          />
          <button type="button" onClick={handleAddTag}
            className="shrink-0 px-3 border border-green-500 text-green-400 text-xs hover:bg-green-900 transition-colors">
            添加
          </button>
        </div>
      </div>

      {/* 状态（BUFF / DEBUFF） */}
      <div className="pixel-card space-y-3">
        <div className="text-gray-400 text-xs">状态</div>
        <div className="flex flex-wrap gap-2">
          {character.debuffs.length === 0 && <span className="text-gray-600 text-xs">状态良好</span>}
          {character.debuffs.map((d) => (
            <button key={d.id} type="button" onClick={() => removeDebuff(d.id)}
              className="px-2 py-0.5 text-xs border" style={{ borderColor: d.color, color: d.color }}
              title="移除状态">
              {effectIcon(d)} {d.label} ×
            </button>
          ))}
        </div>

        {/* 添加状态表单 */}
        <input
          className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
          value={debuffLabel}
          onChange={(e) => setDebuffLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddDebuff()}
          placeholder="状态名称"
        />
        <div className="grid grid-cols-2 gap-2">
          {/* BUFF / DEBUFF 切换 */}
          <div className="flex border border-gray-700 text-xs overflow-hidden">
            <button type="button"
              onClick={() => setDebuffBuffType('buff')}
              className={`flex-1 py-1 transition-colors ${debuffBuffType === 'buff' ? 'bg-green-800 text-green-300' : 'text-gray-500 hover:bg-gray-800'}`}>
              ▲ 正面
            </button>
            <button type="button"
              onClick={() => setDebuffBuffType('debuff')}
              className={`flex-1 py-1 transition-colors ${debuffBuffType === 'debuff' ? 'bg-red-900 text-red-300' : 'text-gray-500 hover:bg-gray-800'}`}>
              ▼ 负面
            </button>
          </div>
          {/* 严重度 */}
          <select
            className="bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none"
            value={debuffSeverity}
            onChange={(e) => setDebuffSeverity(Number(e.target.value) as 1 | 2 | 3)}>
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <input type="color"
            className="w-10 h-8 bg-gray-900 border border-gray-700 shrink-0"
            value={debuffColor}
            onChange={(e) => setDebuffColor(e.target.value)}
            aria-label="颜色" />
          <button type="button" onClick={handleAddDebuff}
            className={`flex-1 py-1 text-xs border transition-colors ${
              debuffBuffType === 'buff'
                ? 'border-green-500 text-green-400 hover:bg-green-900/30'
                : 'border-red-500 text-red-400 hover:bg-red-900/30'
            }`}>
            + 添加状态
          </button>
        </div>
      </div>

    </div>
  )
}
