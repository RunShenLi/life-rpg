import { useState } from 'react'
import { useQuestStore } from '../store/questStore'
import type { Quest, QuestType, QuestPriority } from '../types'

const PRIORITY_COLOR: Record<QuestPriority, string> = {
  high: 'text-red-400 border-red-500',
  medium: 'text-yellow-400 border-yellow-500',
  low: 'text-gray-400 border-gray-500',
}

const COLUMNS: { type: QuestType; label: string }[] = [
  { type: 'daily', label: '今日' },
  { type: 'weekly', label: '本周' },
  { type: 'longterm', label: '长期' },
]

function QuestItem({ quest }: { quest: Quest }) {
  const { completeQuest, removeQuest } = useQuestStore()
  return (
    <div className={`flex items-start gap-2 p-2 border border-gray-700 ${quest.status === 'done' ? 'opacity-40' : ''}`}>
      <button
        onClick={() => completeQuest(quest.id)}
        className={`mt-0.5 w-3 h-3 border flex-shrink-0 ${quest.status === 'done' ? 'bg-green-500 border-green-500' : 'border-gray-500'}`}
      />
      <div className="flex-1 min-w-0">
        <div className={`text-xs leading-snug ${quest.status === 'done' ? 'line-through' : 'text-gray-200'}`}>
          {quest.title}
        </div>
      </div>
      <span className={`text-xs px-1 border ${PRIORITY_COLOR[quest.priority]} flex-shrink-0`}>
        {quest.priority[0].toUpperCase()}
      </span>
      <button
        onClick={() => removeQuest(quest.id)}
        className="text-gray-600 hover:text-red-400 text-xs flex-shrink-0"
      >
        ×
      </button>
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
    })
    setValue('')
  }

  return (
    <div className="flex gap-1 mt-2">
      <input
        className="flex-1 bg-gray-900 border border-gray-700 text-xs text-gray-200 px-2 py-1 outline-none focus:border-green-500"
        placeholder="新任务..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <select
        className="bg-gray-900 border border-gray-700 text-xs text-gray-400 px-1"
        value={priority}
        onChange={(e) => setPriority(e.target.value as QuestPriority)}
      >
        <option value="high">H</option>
        <option value="medium">M</option>
        <option value="low">L</option>
      </select>
      <button
        onClick={submit}
        className="border border-green-700 text-green-400 text-xs px-2 hover:bg-green-900"
      >
        +
      </button>
    </div>
  )
}

export default function QuestsPage() {
  const { quests } = useQuestStore()

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map(({ type, label }) => {
          const col = quests.filter((q) => q.type === type)
          return (
            <div key={type} className="pixel-card space-y-2">
              <div className="text-green-400 text-xs border-b border-gray-700 pb-1">
                [{label}] <span className="text-gray-500">{col.filter((q) => q.status === 'todo').length}</span>
              </div>
              <div className="space-y-1">
                {col.map((q) => (
                  <QuestItem key={q.id} quest={q} />
                ))}
              </div>
              <AddQuestInput type={type} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
