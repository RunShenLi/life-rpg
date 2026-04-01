import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Character, Debuff } from '../types'

interface CharacterState {
  character: Character | null
  setCharacter: (character: Character) => void
  updateCharacter: (fields: Partial<Omit<Character, 'id' | 'created_at'>>) => void
  addTag: (tag: string) => void
  removeTag: (tag: string) => void
  addDebuff: (debuff: Debuff) => void
  removeDebuff: (debuffId: string) => void
}

const defaultCharacter: Character = {
  id: 'local-character',
  name: '勇者',
  class: '未知职业',
  level: 1,
  exp: 0,
  avatar_url: null,
  tags: [],
  debuffs: [],
  created_at: new Date().toISOString(),
}

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set) => ({
      character: defaultCharacter,
      setCharacter: (character) => set({ character }),
      updateCharacter: (fields) =>
        set((state) => ({
          character: state.character ? { ...state.character, ...fields } : state.character,
        })),
      addTag: (tag) =>
        set((state) => ({
          character: state.character
            ? { ...state.character, tags: [...state.character.tags, tag] }
            : state.character,
        })),
      removeTag: (tag) =>
        set((state) => ({
          character: state.character
            ? { ...state.character, tags: state.character.tags.filter((t) => t !== tag) }
            : state.character,
        })),
      addDebuff: (debuff) =>
        set((state) => ({
          character: state.character
            ? { ...state.character, debuffs: [...state.character.debuffs, debuff] }
            : state.character,
        })),
      removeDebuff: (debuffId) =>
        set((state) => ({
          character: state.character
            ? { ...state.character, debuffs: state.character.debuffs.filter((d) => d.id !== debuffId) }
            : state.character,
        })),
    }),
    { name: 'life-rpg-character' }
  )
)
