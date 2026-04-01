import { useEffect, useState } from 'react'
import { useCharacterStore } from '../store/characterStore'
import { useAssetStore } from '../store/assetStore'
import { useQuestStore } from '../store/questStore'

export default function SettingsPage() {
  const { character, updateCharacter } = useCharacterStore()
  const { assets, snapshots } = useAssetStore()
  const { quests } = useQuestStore()

  const [name, setName] = useState(character?.name ?? '')
  const [level, setLevel] = useState(character?.level ?? 1)
  const [exp, setExp] = useState(character?.exp ?? 0)
  const [saved, setSaved] = useState(false)
  const [classInput, setClassInput] = useState('')

  useEffect(() => {
    if (!character) return
    setName(character.name)
    setLevel(character.level)
    setExp(character.exp)
  }, [character])

  if (!character) return null

  const handleSave = () => {
    updateCharacter({
      name: name.trim() || character.name,
      level: Math.max(1, level),
      exp: Math.max(0, exp),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const adjustExp = (delta: number) => setExp((c) => Math.max(0, c + delta))

  // 职业/身份管理（实时保存，不走 Save 按钮）
  const addClass = () => {
    const next = classInput.trim()
    if (!next || character.classes.includes(next)) return
    updateCharacter({ classes: [...character.classes, next] })
    setClassInput('')
  }

  const removeClass = (c: string) => {
    updateCharacter({ classes: character.classes.filter((x) => x !== c) })
  }

  const setMain = (c: string) => {
    updateCharacter({ classes: [c, ...character.classes.filter((x) => x !== c)] })
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

      {/* 职业 / 身份 */}
      <div className="pixel-card space-y-3">
        <div className="text-green-400 text-xs border-b border-gray-700 pb-1">[职业 / 身份]</div>
        <div className="text-gray-500 text-xs">第一项为主职，点击 [↑] 置顶</div>
        <div className="space-y-1">
          {character.classes.length === 0 && (
            <div className="text-gray-600 text-xs">暂无职业</div>
          )}
          {character.classes.map((c, i) => (
            <div key={c} className="flex items-center gap-2 text-xs">
              <span className={i === 0 ? 'text-yellow-500' : 'text-gray-600'}>
                {i === 0 ? '[主]' : '[副]'}
              </span>
              <span className="flex-1 text-gray-300">{c}</span>
              {i !== 0 && (
                <button type="button" onClick={() => setMain(c)}
                  className="text-gray-600 hover:text-yellow-400 transition-colors" title="设为主职">
                  ↑
                </button>
              )}
              <button type="button" onClick={() => removeClass(c)}
                className="text-gray-600 hover:text-red-400 transition-colors" title="删除">
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
            value={classInput}
            onChange={(e) => setClassInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addClass()}
            placeholder="添加职业/身份（如：创业者、工程师）"
          />
          <button type="button" onClick={addClass}
            className="shrink-0 px-3 border border-green-500 text-green-400 text-xs hover:bg-green-900 transition-colors">
            添加
          </button>
        </div>
      </div>

      {/* 角色基础信息 */}
      <div className="pixel-card space-y-3">
        <div className="text-green-400 text-xs border-b border-gray-700 pb-1">[角色设置]</div>
        <div className="space-y-2">
          <label className="block text-xs text-gray-400">
            名字
            <input
              className="mt-1 w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </label>
          <label className="block text-xs text-gray-400">
            等级
            <input type="number" min={1}
              className="mt-1 w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
              value={level}
              onChange={(e) => setLevel(Number(e.target.value) || 1)}
            />
          </label>
          <label className="block text-xs text-gray-400">
            EXP
            <input type="number" min={0}
              className="mt-1 w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1 outline-none focus:border-green-500"
              value={exp}
              onChange={(e) => setExp(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <div className="grid grid-cols-4 gap-2">
            {([-100, 100, 500] as const).map((d) => (
              <button key={d} type="button" onClick={() => adjustExp(d)}
                className={`py-1 text-xs border transition-colors ${
                  d < 0
                    ? 'border-gray-600 text-gray-400 hover:bg-gray-800'
                    : 'border-yellow-500 text-yellow-400 hover:bg-yellow-900/20'
                }`}>
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
            <button type="button" onClick={() => setExp(0)}
              className="py-1 border border-red-500 text-red-400 text-xs hover:bg-red-900/20 transition-colors">
              清零
            </button>
          </div>
        </div>
        <button onClick={handleSave}
          className="w-full py-2 border border-green-500 text-green-400 text-xs hover:bg-green-900 transition-colors">
          {saved ? '✓ 已保存' : '[ 保存 ]'}
        </button>
      </div>

      {/* 数据管理 */}
      <div className="pixel-card space-y-3">
        <div className="text-green-400 text-xs border-b border-gray-700 pb-1">[数据管理]</div>
        <button onClick={handleExport}
          className="w-full py-2 border border-blue-500 text-blue-400 text-xs hover:bg-blue-900 transition-colors">
          [ 导出 JSON ]
        </button>
      </div>

    </div>
  )
}
