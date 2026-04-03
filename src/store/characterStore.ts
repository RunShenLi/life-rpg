import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Character, ClassInfo, Debuff } from '../types'
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
  updateClassLevel: (className: string, newLevel: number) => void
  addTag: (tag: string) => void
  removeTag: (tag: string) => void
  addDebuff: (debuff: Debuff) => void
  removeDebuff: (debuffId: string) => void
  loadFromSupabase: () => Promise<void>
}

type LegacyCharacterShape = Partial<Character> & {
  class?: string
  level?: number
}

function normalizeDebuff(debuff: Partial<Debuff>): Debuff {
  return {
    id: debuff.id ?? crypto.randomUUID(),
    character_id: debuff.character_id ?? '',
    label: debuff.label ?? '未命名状态',
    color: debuff.color ?? '#f87171',
    severity: debuff.severity === 2 || debuff.severity === 3 ? debuff.severity : 1,
    buff_type: debuff.buff_type === 'buff' ? 'buff' : 'debuff',
    created_at: debuff.created_at ?? new Date().toISOString(),
  }
}

function normalizeCharacter(input?: LegacyCharacterShape | null): Character {
  const classes = Array.isArray(input?.classes) && input.classes.length > 0
    ? input.classes
        .filter((item): item is ClassInfo => Boolean(item && typeof item.name === 'string'))
        .map((item) => ({
          name: item.name,
          level: typeof item.level === 'number' && item.level > 0 ? item.level : 1,
        }))
    : [{
        name: input?.class?.trim() || '未知职业',
        level: typeof input?.level === 'number' && input.level > 0 ? input.level : 1,
      }]

  return {
    id: input?.id ?? crypto.randomUUID(),
    name: input?.name?.trim() || '勇者',
    classes,
    avatar_url: input?.avatar_url ?? null,
    tags: Array.isArray(input?.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    debuffs: Array.isArray(input?.debuffs) ? input.debuffs.map(normalizeDebuff) : [],
    created_at: input?.created_at ?? new Date().toISOString(),
  }
}

const defaultCharacter: Character = normalizeCharacter()

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set, get) => ({
      character: defaultCharacter,

      setCharacter: (character) => set({ character: normalizeCharacter(character) }),

      updateCharacter: (fields) => {
        set((state) => ({
          character: state.character ? { ...state.character, ...fields } : state.character,
        }))
        const id = get().character?.id
        if (id) dbUpdateCharacter(id, fields).catch(() => {})
      },

      updateClassLevel: (className, newLevel) => {
        set((state) => {
          if (!state.character) return state
          const classes = state.character.classes.map((c: ClassInfo) =>
            c.name === className ? { ...c, level: Math.max(1, newLevel) } : c
          )
          return { character: { ...state.character, classes } }
        })
        const char = get().character
        if (char) dbUpdateCharacter(char.id, { classes: char.classes }).catch(() => {})
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
            const local = get().character
            // 合并 debuffs：本地有但远端没有的（写入失败的）补回来
            const remoteIds = new Set(remote.debuffs.map((d) => d.id))
            const localOnly = (local?.debuffs ?? []).filter((d) => !remoteIds.has(d.id))
            // 尝试把本地多出的 debuffs 重新写入 Supabase
            for (const d of localOnly) dbInsertDebuff(d).catch(() => {})
            set({ character: normalizeCharacter({ ...remote, debuffs: [...remote.debuffs, ...localOnly] }) })
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
    {
      name: 'life-rpg-character',
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as { character?: LegacyCharacterShape } | undefined
        return {
          ...(state ?? {}),
          character: normalizeCharacter(state?.character),
        }
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<CharacterState> | undefined
        return {
          ...currentState,
          ...persisted,
          character: normalizeCharacter(persisted?.character as LegacyCharacterShape | undefined),
        }
      },
    }
  )
)
