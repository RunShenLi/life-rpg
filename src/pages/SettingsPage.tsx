import { useEffect, useState } from 'react'
import { useCharacterStore } from '../store/characterStore'
import { useAssetStore } from '../store/assetStore'
import { useQuestStore } from '../store/questStore'
import type { ClassInfo } from '../types'

export default function SettingsPage() {
  const { character, updateCharacter, updateClassLevel } = useCharacterStore()
  const { assets, snapshots } = useAssetStore()
  const { quests } = useQuestStore()

  const [name, setName]             = useState(character?.name ?? '')
  const [saved, setSaved]           = useState(false)
  const [classInput, setClassInput] = useState('')

  useEffect(() => {
    if (!character) return
    setName(character.name)
  }, [character])

  if (!character) return null

  const handleSave = () => {
    updateCharacter({ name: name.trim() || character.name })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const addClass = () => {
    const next = classInput.trim()
    if (!next || character.classes.some((c) => c.name === next)) return
    const newClass: ClassInfo = { name: next, level: 1 }
    updateCharacter({ classes: [...character.classes, newClass] })
    setClassInput('')
  }

  const removeClass = (name: string) => {
    updateCharacter({ classes: character.classes.filter((c) => c.name !== name) })
  }

  const setMain = (name: string) => {
    const cls = character.classes.find((c) => c.name === name)!
    updateCharacter({ classes: [cls, ...character.classes.filter((c) => c.name !== name)] })
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
    <div className="p-4 md:p-8 max-w-lg md:max-w-2xl mx-auto space-y-6">

      {/* 职业 / 身份 */}
      <div className="pixel-card space-y-3">
        <div className="text-yellow-400 font-bold border-b border-gray-700 pb-2">[职业 / 身份]</div>
        <div className="text-gray-500 text-sm">第一项为主职 · 点击 [↑] 置顶</div>
        <div className="space-y-2">
          {character.classes.length === 0 && (
            <div className="text-gray-600 text-sm">暂无职业</div>
          )}
          {character.classes.map((c, i) => (
            <div key={c.name} className="flex items-center gap-2">
              <span className={`text-sm shrink-0 w-8 ${i === 0 ? 'text-yellow-500' : 'text-gray-600'}`}>
                {i === 0 ? '[主]' : '[副]'}
              </span>
              <span className="flex-1 text-gray-200 text-sm truncate">{c.name}</span>

              {/* 等级 -/+ */}
              <div className="flex items-center gap-1 shrink-0">
                <button type="button"
                  onClick={() => updateClassLevel(c.name, c.level - 1)}
                  className="w-8 h-8 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-500 transition-colors text-sm">
                  −
                </button>
                <span className="text-yellow-400 text-sm w-12 text-center">Lv.{c.level}</span>
                <button type="button"
                  onClick={() => updateClassLevel(c.name, c.level + 1)}
                  className="w-8 h-8 border border-gray-700 text-gray-400 hover:text-green-400 hover:border-green-500 transition-colors text-sm">
                  +
                </button>
              </div>

              {i !== 0 && (
                <button type="button" onClick={() => setMain(c.name)}
                  className="flex items-center justify-center w-11 h-11 text-gray-600 hover:text-yellow-400 transition-colors shrink-0"
                  title="设为主职">↑</button>
              )}
              <button type="button" onClick={() => removeClass(c.name)}
                className="flex items-center justify-center w-11 h-11 text-gray-600 hover:text-red-400 transition-colors shrink-0"
                title="删除">×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 text-gray-200 px-3 py-2 outline-none focus:border-green-500"
            value={classInput}
            onChange={(e) => setClassInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addClass()}
            placeholder="添加职业/身份（如：创业者、工程师）"
          />
          <button type="button" onClick={addClass}
            className="shrink-0 px-4 min-h-[44px] border border-green-500 text-green-400 text-sm hover:bg-green-900 transition-colors">
            添加
          </button>
        </div>
      </div>

      {/* 角色名 */}
      <div className="pixel-card space-y-3">
        <div className="text-yellow-400 font-bold border-b border-gray-700 pb-2">[角色设置]</div>
        <label className="block text-sm text-gray-400">
          名字
          <input
            className="mt-1 w-full bg-gray-800 border border-gray-700 text-gray-200 px-3 py-2 outline-none focus:border-green-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </label>
        <button onClick={handleSave}
          className="w-full min-h-[44px] border border-green-500 text-green-400 text-sm hover:bg-green-900 transition-colors">
          {saved ? '✓ 已保存' : '[ 保存 ]'}
        </button>
      </div>

      {/* 数据管理 */}
      <div className="pixel-card space-y-3">
        <div className="text-yellow-400 font-bold border-b border-gray-700 pb-2">[数据管理]</div>
        <button onClick={handleExport}
          className="w-full min-h-[44px] border border-blue-500 text-blue-400 text-sm hover:bg-blue-900 transition-colors">
          [ 导出 JSON ]
        </button>
      </div>

    </div>
  )
}
