import { useEffect, useState } from 'react'
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
  const [exp, setExp] = useState(character?.exp ?? 0)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!character) return
    setName(character.name)
    setCharClass(character.class)
    setLevel(character.level)
    setExp(character.exp)
  }, [character])

  if (!character) return null

  const handleSave = () => {
    updateCharacter({
      name: name.trim() || character.name,
      class: charClass.trim() || character.class,
      level: Math.max(1, level),
      exp: Math.max(0, exp),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const adjustExp = (delta: number) => {
    setExp((current) => Math.max(0, current + delta))
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
              onChange={(e) => setLevel(Number(e.target.value) || 1)}
            />
          </label>
          <label className="block text-xs text-gray-400">
            EXP
            <input
              type="number"
              min={0}
              className="mt-1 w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
              value={exp}
              onChange={(e) => setExp(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => adjustExp(-100)}
              className="py-1 border border-gray-600 text-gray-400 text-xs hover:bg-gray-800 transition-colors"
            >
              -100
            </button>
            <button
              type="button"
              onClick={() => adjustExp(100)}
              className="py-1 border border-yellow-500 text-yellow-400 text-xs hover:bg-yellow-900/20 transition-colors"
            >
              +100
            </button>
            <button
              type="button"
              onClick={() => adjustExp(500)}
              className="py-1 border border-yellow-500 text-yellow-400 text-xs hover:bg-yellow-900/20 transition-colors"
            >
              +500
            </button>
            <button
              type="button"
              onClick={() => setExp(0)}
              className="py-1 border border-red-500 text-red-400 text-xs hover:bg-red-900/20 transition-colors"
            >
              清零
            </button>
          </div>
        </div>
        <button
          onClick={handleSave}
          className="w-full py-2 border border-green-500 text-green-400 text-xs hover:bg-green-900 transition-colors"
        >
          {saved ? '✓ 已保存' : '[ 保存 ]'}
        </button>
      </div>

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
