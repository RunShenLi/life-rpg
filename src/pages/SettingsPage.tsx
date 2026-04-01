import { useState } from 'react'
import { useCharacterStore } from '../store/characterStore'
import { useAssetStore } from '../store/assetStore'
import { useQuestStore } from '../store/questStore'

export default function SettingsPage() {
  const { character, updateCharacter } = useCharacterStore()
  const { assets, snapshots } = useAssetStore()
  const { quests } = useQuestStore()

  const [name, setName] = useState(character?.name ?? '')
  const [charClass, setCharClass] = useState(character?.class ?? '')
  const [level, setLevel] = useState(character?.level ?? 1)
  const [saved, setSaved] = useState(false)

  if (!character) return null

  const handleSave = () => {
    updateCharacter({ name, class: charClass, level })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const handleExport = () => {
    const data = { character, assets, snapshots, quests, exported_at: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `life-rpg-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      {/* Character edit */}
      <div className="pixel-card space-y-3">
        <div className="text-green-400 text-xs border-b border-gray-700 pb-1">[角色设置]</div>
        <div className="space-y-2">
          <label className="block text-xs text-gray-400">
            名字
            <input
              className="mt-1 w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-xs text-gray-400">
            职业
            <input
              className="mt-1 w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
              value={charClass}
              onChange={(e) => setCharClass(e.target.value)}
            />
          </label>
          <label className="block text-xs text-gray-400">
            等级
            <input
              type="number"
              min={1}
              className="mt-1 w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          onClick={handleSave}
          className="w-full py-2 border border-green-500 text-green-400 text-xs hover:bg-green-900 transition-colors"
        >
          {saved ? '✓ 已保存' : '[ 保存 ]'}
        </button>
      </div>

      {/* Export */}
      <div className="pixel-card space-y-3">
        <div className="text-green-400 text-xs border-b border-gray-700 pb-1">[数据管理]</div>
        <button
          onClick={handleExport}
          className="w-full py-2 border border-blue-500 text-blue-400 text-xs hover:bg-blue-900 transition-colors"
        >
          [ 导出 JSON ]
        </button>
      </div>
    </div>
  )
}
