import { supabase } from './supabase'
import type { Character, ClassInfo, Debuff, Asset, AssetSnapshot, Quest } from '../types'

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

  const safeDebuffs = (debuffs ?? []).map((d: Debuff) => ({
    ...d,
    buff_type: d.buff_type ?? 'debuff',
  }))

  // class_data（jsonb）优先；fallback 到旧 classes text[]（migration 前的数据）
  const classData = char.class_data as ClassInfo[] | null
  const oldClasses = char.classes as string[] | null
  const classes: ClassInfo[] =
    classData && classData.length > 0
      ? classData.map((c: ClassInfo) => ({ name: c.name, level: c.level ?? 1 }))
      : (oldClasses ?? []).map((name: string) => ({ name, level: 1 }))

  return {
    ...char,
    classes: classes.length > 0 ? classes : [{ name: '未知职业', level: 1 }],
    debuffs: safeDebuffs,
  }
}

export async function dbInsertCharacter(character: Omit<Character, 'debuffs'>) {
  const { classes, ...rest } = character
  await supabase.from('characters').insert({
    ...rest,
    class_data: classes,
    classes: [],   // 保持旧列兼容
    level: 1,
    exp: 0,
  })
}

export async function dbUpdateCharacter(id: string, fields: Partial<Omit<Character, 'id' | 'created_at' | 'debuffs'>>) {
  const { classes, ...rest } = fields
  const dbFields: Record<string, unknown> = { ...rest }
  if (classes !== undefined) dbFields.class_data = classes
  await supabase.from('characters').update(dbFields).eq('id', id)
}

export async function dbInsertDebuff(debuff: Debuff) {
  const { error } = await supabase.from('debuffs').insert(debuff)
  if (error) console.error('[life-rpg] dbInsertDebuff failed:', error.message, debuff)
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
  return (data ?? []).map((q) => ({
    ...q,
    subtasks: Array.isArray(q.subtasks) ? q.subtasks : [],
  }))
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
