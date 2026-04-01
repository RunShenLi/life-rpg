import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Character, Debuff } from '../types'
import {
  dbFetchCharacter,
  dbInsertCharacter,
  dbUpdateCharacter,
  dbInsertDebuff,
  dbDeleteDebuff,
} from '../lib/db'

interface CharacterState {
  character: Character | null
  setCharacter: (character: Character) => void
  updateCharacter: (fields: Partial<Omit<Character, 'id' | 'created_at' | 'debuffs'>>) => void
  addTag: (tag: string) => void
  removeTag: (tag: string) => void
  addDebuff: (debuff: Debuff) => void
  removeDebuff: (debuffId: string) => void
  loadFromSupabase: () => Promise<void>
}

const defaultCharacter: Character = {
  id: crypto.randomUUID(),
  name: '勇者',
  classes: ['未知职业'],
  level: 1,
  exp: 0,
  avatar_url: null,
  tags: [],
  debuffs: [],
  created_at: new Date().toISOString(),
}

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set, get) => ({
      character: defaultCharacter,

      setCharacter: (character) => set({ character }),

      updateCharacter: (fields) => {
        set((state) => ({
          character: state.character ? { ...state.character, ...fields } : state.character,
        }))
        const id = get().character?.id
        if (id) dbUpdateCharacter(id, fields).catch(() => {})
      },

      addTag: (tag) => {
        set((state) => ({
          character: state.character
            ? { ...state.character, tags: [...state.character.tags, tag] }
            : state.character,
        }))
        const char = get().character
        if (char) dbUpdateCharacter(char.id, { tags: char.tags }).catch(() => {})
      },

      removeTag: (tag) => {
        set((state) => ({
          character: state.character
            ? { ...state.character, tags: state.character.tags.filter((t) => t !== tag) }
            : state.character,
        }))
        const char = get().character
        if (char) dbUpdateCharacter(char.id, { tags: char.tags }).catch(() => {})
      },

      addDebuff: (debuff) => {
        set((state) => ({
          character: state.character
            ? { ...state.character, debuffs: [...state.character.debuffs, debuff] }
            : state.character,
        }))
        dbInsertDebuff(debuff).catch(() => {})
      },

      removeDebuff: (debuffId) => {
        set((state) => ({
          character: state.character
            ? { ...state.character, debuffs: state.character.debuffs.filter((d) => d.id !== debuffId) }
            : state.character,
        }))
        dbDeleteDebuff(debuffId).catch(() => {})
      },

      loadFromSupabase: async () => {
        try {
          const remote = await dbFetchCharacter()
          if (remote) {
            set({ character: remote })
          } else {
            // 首次运行：把本地默认角色推到 Supabase
            const local = get().character
            if (local) {
              const { debuffs, ...fields } = local
              await dbInsertCharacter(fields)
              for (const d of debuffs) await dbInsertDebuff(d)
            }
          }
        } catch (e) {
          console.warn('[life-rpg] character sync failed:', e)
        }
      },
    }),
    { name: 'life-rpg-character' }
  )
)
