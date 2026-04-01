import { supabase } from './supabase'
import type { Character, Debuff, Asset, AssetSnapshot, Quest } from '../types'

// ── Character ─────────────────────────────────────────────────────────────────

export async function dbFetchCharacter(): Promise<Character | null> {
  const { data: chars, error } = await supabase
    .from('characters')
    .select('*')
    .limit(1)
  if (error || !chars?.length) return null

  const char = chars[0]
  const { data: debuffs } = await supabase
    .from('debuffs')
    .select('*')
    .eq('character_id', char.id)
    .order('created_at', { ascending: true })

  return { ...char, debuffs: debuffs ?? [] }
}

export async function dbInsertCharacter(character: Omit<Character, 'debuffs'>) {
  await supabase.from('characters').insert(character)
}

export async function dbUpdateCharacter(id: string, fields: Partial<Omit<Character, 'id' | 'created_at' | 'debuffs'>>) {
  await supabase.from('characters').update(fields).eq('id', id)
}

export async function dbInsertDebuff(debuff: Debuff) {
  await supabase.from('debuffs').insert(debuff)
}

export async function dbDeleteDebuff(id: string) {
  await supabase.from('debuffs').delete().eq('id', id)
}

// ── Assets ────────────────────────────────────────────────────────────────────

export async function dbFetchAssets(): Promise<Asset[]> {
  const { data } = await supabase
    .from('assets')
    .select('*')
    .order('updated_at', { ascending: false })
  return data ?? []
}

export async function dbInsertAsset(asset: Asset) {
  await supabase.from('assets').insert(asset)
}

export async function dbUpdateAsset(id: string, fields: Partial<Omit<Asset, 'id'>>) {
  await supabase.from('assets').update(fields).eq('id', id)
}

export async function dbDeleteAsset(id: string) {
  await supabase.from('assets').delete().eq('id', id)
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

export async function dbFetchSnapshots(): Promise<AssetSnapshot[]> {
  const { data } = await supabase
    .from('asset_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: true })
  return data ?? []
}

export async function dbUpsertSnapshot(snapshot: AssetSnapshot) {
  await supabase
    .from('asset_snapshots')
    .upsert(snapshot, { onConflict: 'snapshot_date' })
}

// ── Quests ────────────────────────────────────────────────────────────────────

export async function dbFetchQuests(): Promise<Quest[]> {
  const { data } = await supabase
    .from('quests')
    .select('*')
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function dbInsertQuest(quest: Quest) {
  await supabase.from('quests').insert(quest)
}

export async function dbUpdateQuest(id: string, fields: Partial<Omit<Quest, 'id' | 'created_at'>>) {
  await supabase.from('quests').update(fields).eq('id', id)
}

export async function dbDeleteQuest(id: string) {
  await supabase.from('quests').delete().eq('id', id)
}
