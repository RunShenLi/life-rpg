import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Quest, QuestType } from '../types'
import { dbFetchQuests, dbInsertQuest, dbUpdateQuest, dbDeleteQuest } from '../lib/db'

interface QuestState {
  quests: Quest[]
  addQuest: (quest: Quest) => void
  updateQuest: (id: string, fields: Partial<Omit<Quest, 'id' | 'created_at'>>) => void
  removeQuest: (id: string) => void
  getByType: (type: QuestType) => Quest[]
  loadFromSupabase: () => Promise<void>
}

export const useQuestStore = create<QuestState>()(
  persist(
    (set, get) => ({
      quests: [],

      addQuest: (quest) => {
        set((state) => ({ quests: [...state.quests, quest] }))
        dbInsertQuest(quest).catch(() => {})
      },

      updateQuest: (id, fields) => {
        set((state) => ({
          quests: state.quests.map((q) => (q.id === id ? { ...q, ...fields } : q)),
        }))
        dbUpdateQuest(id, fields).catch(() => {})
      },

      removeQuest: (id) => {
        set((state) => ({ quests: state.quests.filter((q) => q.id !== id) }))
        dbDeleteQuest(id).catch(() => {})
      },

      getByType: (type) => get().quests.filter((q) => q.type === type),

      loadFromSupabase: async () => {
        try {
          const quests = await dbFetchQuests()
          set({ quests })
        } catch (e) {
          console.warn('[life-rpg] quests sync failed:', e)
        }
      },
    }),
    { name: 'life-rpg-quests' }
  )
)
