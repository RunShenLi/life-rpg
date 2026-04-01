import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Quest, QuestType } from '../types'

interface QuestState {
  quests: Quest[]
  addQuest: (quest: Quest) => void
  updateQuest: (id: string, fields: Partial<Omit<Quest, 'id' | 'created_at'>>) => void
  completeQuest: (id: string) => void
  removeQuest: (id: string) => void
  getByType: (type: QuestType) => Quest[]
}

export const useQuestStore = create<QuestState>()(
  persist(
    (set, get) => ({
      quests: [],
      addQuest: (quest) => set((state) => ({ quests: [...state.quests, quest] })),
      updateQuest: (id, fields) =>
        set((state) => ({
          quests: state.quests.map((q) => (q.id === id ? { ...q, ...fields } : q)),
        })),
      completeQuest: (id) =>
        set((state) => ({
          quests: state.quests.map((q) =>
            q.id === id
              ? { ...q, status: 'done', completed_at: new Date().toISOString() }
              : q
          ),
        })),
      removeQuest: (id) => set((state) => ({ quests: state.quests.filter((q) => q.id !== id) })),
      getByType: (type) => get().quests.filter((q) => q.type === type),
    }),
    { name: 'life-rpg-quests' }
  )
)
