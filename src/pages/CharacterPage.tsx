import { useCharacterStore } from '../store/characterStore'
import { useAssetStore } from '../store/assetStore'

export default function CharacterPage() {
  const { character } = useCharacterStore()
  const { assets } = useAssetStore()
  const totalNetWorth = assets.reduce((sum, a) => sum + a.amount * a.unit_price, 0)

  if (!character) return null

  const expPercent = Math.min((character.exp % 1000) / 10, 100)

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      {/* Avatar + basic info */}
      <div className="pixel-card flex gap-4 items-center">
        <div className="w-20 h-20 bg-gray-700 border-2 border-green-400 flex items-center justify-center text-3xl pixel-border">
          {character.avatar_url ? (
            <img src={character.avatar_url} alt="avatar" className="w-full h-full object-cover pixelated" />
          ) : (
            '🧙'
          )}
        </div>
        <div className="flex-1 space-y-1">
          <div className="pixel-text text-green-400 text-sm">{character.name}</div>
          <div className="text-gray-400 text-xs">{character.class}</div>
          <div className="text-gray-400 text-xs">LV.{character.level}</div>
        </div>
      </div>

      {/* EXP bar */}
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

      {/* Net worth summary */}
      <div className="pixel-card">
        <div className="text-gray-400 text-xs mb-1">今日净值</div>
        <div className="pixel-text text-yellow-400">¥ {totalNetWorth.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
      </div>

      {/* Tags */}
      <div className="pixel-card space-y-2">
        <div className="text-gray-400 text-xs">标签</div>
        <div className="flex flex-wrap gap-2">
          {character.tags.length === 0 && <span className="text-gray-600 text-xs">暂无标签</span>}
          {character.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 bg-blue-900 border border-blue-500 text-blue-300 text-xs">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Debuffs */}
      <div className="pixel-card space-y-2">
        <div className="text-gray-400 text-xs">状态</div>
        <div className="flex flex-wrap gap-2">
          {character.debuffs.length === 0 && <span className="text-gray-600 text-xs">状态良好</span>}
          {character.debuffs.map((d) => (
            <span
              key={d.id}
              className="px-2 py-0.5 text-xs border"
              style={{ borderColor: d.color, color: d.color }}
            >
              {'▼'.repeat(d.severity)} {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
