import { useState, useRef, useEffect } from 'react'
import { useQuestStore } from '../store/questStore'
import type { Quest, QuestType, QuestPriority, Subtask } from '../types'

const PRIORITY_COLOR: Record<QuestPriority, string> = {
  high:   'text-red-400 border-red-500',
  medium: 'text-yellow-400 border-yellow-500',
  low:    'text-gray-400 border-gray-500',
}

const COLUMNS: { type: QuestType; label: string }[] = [
  { type: 'daily',    label: '今日' },
  { type: 'weekly',   label: '本周' },
  { type: 'longterm', label: '长期' },
]

function QuestItem({ quest }: { quest: Quest }) {
  const { updateQuest, removeQuest } = useQuestStore()
  const [editing, setEditing]   = useState(false)
  const [draft, setDraft]       = useState(quest.title)
  const [showSubs, setShowSubs] = useState(false)
  const [subInput, setSubInput] = useState('')
  const inputRef    = useRef<HTMLInputElement>(null)
  const subInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (showSubs) subInputRef.current?.focus()
  }, [showSubs])

  const subtasks = quest.subtasks ?? []
  const doneSubs = subtasks.filter((s) => s.done).length

  const toggleStatus = () => {
    if (quest.status === 'done') {
      updateQuest(quest.id, { status: 'todo', completed_at: null })
    } else {
      updateQuest(quest.id, { status: 'done', completed_at: new Date().toISOString() })
    }
  }

  const commitEdit = () => {
    const title = draft.trim()
    if (title && title !== quest.title) updateQuest(quest.id, { title })
    else setDraft(quest.title)
    setEditing(false)
  }

  const cancelEdit = () => {
    setDraft(quest.title)
    setEditing(false)
  }

  const addSubtask = () => {
    const title = subInput.trim()
    if (!title) return
    const updated: Subtask[] = [...subtasks, { id: crypto.randomUUID(), title, done: false }]
    updateQuest(quest.id, { subtasks: updated })
    setSubInput('')
  }

  const toggleSubtask = (subId: string) => {
    const updated = subtasks.map((s) => s.id === subId ? { ...s, done: !s.done } : s)
    updateQuest(quest.id, { subtasks: updated })
  }

  const removeSubtask = (subId: string) => {
    const updated = subtasks.filter((s) => s.id !== subId)
    updateQuest(quest.id, { subtasks: updated })
  }

  return (
    <div className="border border-gray-700">
      {/* 主行 */}
      <div className="flex items-center gap-2">
        {/* 勾选框 — 44×44 触摸区 */}
        <button
          type="button"
          onClick={toggleStatus}
          className="flex items-center justify-center w-11 h-11 shrink-0 transition-colors"
          title={quest.status === 'done' ? '撤销完成' : '标记完成'}
        >
          <div className={`w-3 h-3 border transition-colors ${
            quest.status === 'done' ? 'bg-green-500 border-green-500' : 'border-gray-500'
          }`} />
        </button>

        {/* 标题 */}
        <div className="flex-1 min-w-0 py-2">
          {editing ? (
            <input
              ref={inputRef}
              className="w-full bg-gray-800 border border-green-500 text-gray-200 px-2 py-1 outline-none"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') cancelEdit()
              }}
              onBlur={commitEdit}
            />
          ) : (
            <div
              className={`text-sm leading-snug cursor-pointer select-none ${
                quest.status === 'done' ? 'line-through text-gray-500' : 'text-gray-200'
              }`}
              onClick={() => { setDraft(quest.title); setEditing(true) }}
              title="点击编辑"
            >
              {quest.title}
            </div>
          )}
        </div>

        {/* 优先级 */}
        <span className={`text-xs px-1 border shrink-0 ${PRIORITY_COLOR[quest.priority]}`}>
          {quest.priority[0].toUpperCase()}
        </span>

        {/* 子任务展开按钮 */}
        <button
          type="button"
          onClick={() => setShowSubs((v) => !v)}
          className={`flex items-center justify-center w-11 h-11 shrink-0 transition-colors text-xs gap-0.5 ${
            showSubs ? 'text-yellow-400' : subtasks.length > 0 ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
          }`}
          title="展开子任务"
        >
          <span>≡</span>
          {subtasks.length > 0 && (
            <span className={doneSubs === subtasks.length ? 'text-green-400' : ''}>
              {doneSubs}/{subtasks.length}
            </span>
          )}
        </button>

        {/* 删除 — 44×44 触摸区 */}
        <button
          type="button"
          onClick={() => removeQuest(quest.id)}
          className="flex items-center justify-center w-11 h-11 shrink-0 text-gray-600 hover:text-red-400 transition-colors"
          title="删除"
        >
          ×
        </button>
      </div>

      {/* 子任务面板 */}
      {showSubs && (
        <div className="px-3 pb-2 space-y-1" style={{ borderTop: '1px solid #374151' }}>
          {subtasks.length === 0 && (
            <div className="text-gray-600 text-xs pt-2">暂无子任务</div>
          )}
          {subtasks.map((sub) => (
            <div key={sub.id} className="flex items-center gap-2 pt-1.5">
              <button
                type="button"
                onClick={() => toggleSubtask(sub.id)}
                className="flex items-center justify-center w-8 h-8 shrink-0"
              >
                <div className={`w-2.5 h-2.5 border transition-colors ${
                  sub.done ? 'bg-green-500 border-green-500' : 'border-gray-600'
                }`} />
              </button>
              <span className={`flex-1 text-xs leading-snug ${
                sub.done ? 'line-through text-gray-600' : 'text-gray-400'
              }`}>
                {sub.title}
              </span>
              <button
                type="button"
                onClick={() => removeSubtask(sub.id)}
                className="flex items-center justify-center w-8 h-8 shrink-0 text-gray-700 hover:text-red-400 transition-colors"
              >
                ×
              </button>
            </div>
          ))}
          {/* 添加子任务 */}
          <div className="flex gap-1 pt-1.5">
            <input
              ref={subInputRef}
              className="flex-1 bg-gray-800 border border-gray-700 text-gray-300 px-2 py-1 text-xs outline-none focus:border-green-600"
              placeholder="添加子任务..."
              value={subInput}
              onChange={(e) => setSubInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
            />
            <button
              type="button"
              onClick={addSubtask}
              className="w-8 h-8 border border-green-700 text-green-500 text-sm hover:bg-green-900/30 transition-colors shrink-0"
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddQuestInput({ type }: { type: QuestType }) {
  const { addQuest } = useQuestStore()
  const [value, setValue] = useState('')
  const [priority, setPriority] = useState<QuestPriority>('medium')

  const submit = () => {
    if (!value.trim()) return
    addQuest({
      id: crypto.randomUUID(),
      title: value.trim(),
      description: '',
      type,
      status: 'todo',
      priority,
      due_date: null,
      created_at: new Date().toISOString(),
      completed_at: null,
      subtasks: [],
    })
    setValue('')
  }

  return (
    <div className="flex gap-1 mt-3">
      <input
        className="flex-1 bg-gray-800 border border-gray-700 text-gray-200 px-3 py-2 outline-none focus:border-green-500"
        placeholder="新任务..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <select
        className="shrink-0 bg-gray-800 border border-gray-700 text-gray-400 px-2"
        value={priority}
        onChange={(e) => setPriority(e.target.value as QuestPriority)}
      >
        <option value="high">高</option>
        <option value="medium">中</option>
        <option value="low">低</option>
      </select>
      <button
        type="button"
        onClick={submit}
        className="shrink-0 w-11 h-11 border border-green-700 text-green-400 text-lg hover:bg-green-900 transition-colors"
      >
        +
      </button>
    </div>
  )
}

export default function QuestsPage() {
  const { quests } = useQuestStore()
  // 每列独立控制「已完成」折叠状态
  const [showDone, setShowDone] = useState<Record<QuestType, boolean>>({
    daily: false, weekly: false, longterm: false,
  })

  return (
    <div className="p-4 md:p-8 max-w-2xl md:max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {COLUMNS.map(({ type, label }) => {
          const col      = quests.filter((q) => q.type === type)
          const active   = col.filter((q) => q.status !== 'done')
          const done     = col.filter((q) => q.status === 'done')
          const expanded = showDone[type]

          return (
            <div key={type} className="pixel-card space-y-2">
              {/* 列标题 */}
              <div className="text-yellow-400 font-bold border-b border-gray-700 pb-2 mb-3">
                [{label}]
                <span className="text-gray-500 font-normal text-sm ml-2">{active.length} 项</span>
              </div>

              {/* 进行中任务 */}
              <div className="space-y-2">
                {active.length === 0 && (
                  <div className="text-gray-600 text-sm text-center py-4">暂无任务</div>
                )}
                {active.map((q) => <QuestItem key={q.id} quest={q} />)}
              </div>

              {/* 已完成折叠区 */}
              {done.length > 0 && (
                <div className="pt-2" style={{ borderTop: '1px solid #6b4423' }}>
                  <button
                    type="button"
                    onClick={() => setShowDone((prev) => ({ ...prev, [type]: !expanded }))}
                    className="flex items-center gap-2 w-full text-gray-500 hover:text-gray-300 text-sm transition-colors py-1"
                  >
                    <span className="text-xs">{expanded ? '▼' : '▶'}</span>
                    已完成 ({done.length})
                  </button>
                  {expanded && (
                    <div className="space-y-2 mt-2">
                      {done.map((q) => <QuestItem key={q.id} quest={q} />)}
                    </div>
                  )}
                </div>
              )}

              <AddQuestInput type={type} />
            </div>
          )
        })}
      </div>
      <div className="mt-4 text-gray-600 text-xs text-center">点击任务标题可编辑</div>
    </div>
  )
}
