import { useState } from 'react'
import defaultAvatar from '../assets/default-avatar.svg'
import { useCharacterStore } from '../store/characterStore'
import { useAssetStore } from '../store/assetStore'

const SEVERITY_OPTIONS = [
  { value: 1, label: '轻度' },
  { value: 2, label: '中度' },
  { value: 3, label: '重度' },
] as const

export default function CharacterPage() {
  const { character, addTag, removeTag, addDebuff, removeDebuff } = useCharacterStore()
  const { assets } = useAssetStore()
  const [tagInput, setTagInput] = useState('')
  const [debuffLabel, setDebuffLabel] = useState('')
  const [debuffColor, setDebuffColor] = useState('#f87171')
  const [debuffSeverity, setDebuffSeverity] = useState<1 | 2 | 3>(1)
  const totalNetWorth = assets.reduce((sum, a) => sum + a.amount * a.unit_price, 0)

  if (!character) return null

  const expPercent = Math.min((character.exp % 1000) / 10, 100)

  const handleAddTag = () => {
    const nextTag = tagInput.trim()
    if (!nextTag || character.tags.includes(nextTag)) return
    addTag(nextTag)
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
      created_at: new Date().toISOString(),
    })
    setDebuffLabel('')
    setDebuffColor('#f87171')
    setDebuffSeverity(1)
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <div className="pixel-card flex gap-4 items-center">
        <div className="w-20 h-20 bg-gray-800 border-2 border-green-400 flex items-center justify-center overflow-hidden">
          <img
            src={character.avatar_url || defaultAvatar}
            alt="avatar"
            className="w-full h-full object-contain pixelated sprite-idle"
          />
        </div>
        <div className="flex-1 space-y-1">
          <div className="pixel-text text-green-400 text-sm">{character.name}</div>
          <div className="text-gray-400 text-xs">{character.class}</div>
          <div className="text-gray-400 text-xs">LV.{character.level}</div>
        </div>
      </div>

      <div className="pixel-card space-y-2">
        <div className="flex justify-between text-xs text-gray-400">
          <span>EXP</span>
          <span>{character.exp % 1000} / 1000</span>
        </div>
        <div className="w-full bg-gray-700 h-3 border border-gray-600">
          <div
            className="h-full bg-yellow-400 transition-all"
            style={{ width: `${expPercent}%` }}
          />
        </div>
      </div>

      <div className="pixel-card">
        <div className="text-gray-400 text-xs mb-1">今日净值</div>
        <div className="pixel-text text-yellow-400">
          ¥ {totalNetWorth.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </div>
      </div>

      <div className="pixel-card space-y-3">
        <div className="text-gray-400 text-xs">标签</div>
        <div className="flex flex-wrap gap-2">
          {character.tags.length === 0 && <span className="text-gray-600 text-xs">暂无标签</span>}
          {character.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => removeTag(tag)}
              className="px-2 py-0.5 bg-blue-900 border border-blue-500 text-blue-300 text-xs"
              title="删除标签"
            >
              {tag} ×
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddTag()
            }}
            placeholder="新增标签"
          />
          <button
            type="button"
            onClick={handleAddTag}
            className="px-3 border border-green-500 text-green-400 text-xs hover:bg-green-900 transition-colors"
          >
            添加
          </button>
        </div>
      </div>

      <div className="pixel-card space-y-3">
        <div className="text-gray-400 text-xs">状态</div>
        <div className="flex flex-wrap gap-2">
          {character.debuffs.length === 0 && <span className="text-gray-600 text-xs">状态良好</span>}
          {character.debuffs.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => removeDebuff(d.id)}
              className="px-2 py-0.5 text-xs border"
              style={{ borderColor: d.color, color: d.color }}
              title="移除状态"
            >
              {'▼'.repeat(d.severity)} {d.label} ×
            </button>
          ))}
        </div>
        <input
          className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
          value={debuffLabel}
          onChange={(e) => setDebuffLabel(e.target.value)}
          placeholder="状态名称"
        />
        <div className="grid grid-cols-3 gap-2">
          <select
            className="bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
            value={debuffSeverity}
            onChange={(e) => setDebuffSeverity(Number(e.target.value) as 1 | 2 | 3)}
          >
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="color"
            className="w-full h-8 bg-gray-900 border border-gray-700"
            value={debuffColor}
            onChange={(e) => setDebuffColor(e.target.value)}
            aria-label="状态颜色"
          />
          <button
            type="button"
            onClick={handleAddDebuff}
            className="border border-red-500 text-red-400 text-xs hover:bg-red-900/30 transition-colors"
          >
            添加状态
          </button>
        </div>
      </div>
    </div>
  )
}
