export interface Debuff {
  id: string
  character_id: string
  label: string
  color: string
  severity: 1 | 2 | 3
  buff_type: 'buff' | 'debuff'   // ▲ 正面 / ▼ 负面
  created_at: string
}

export interface ClassInfo {
  name: string
  level: number
}

export interface Character {
  id: string
  name: string
  classes: ClassInfo[]           // 多职业/身份，第一项为主职，各自独立等级
  avatar_url: string | null
  tags: string[]
  debuffs: Debuff[]
  created_at: string
}

export type AssetType = 'cash' | 'stock' | 'fund' | 'crypto' | 'property' | 'other'

export interface Asset {
  id: string
  name: string
  type: AssetType
  amount: number
  unit_price: number
  note: string
  updated_at: string
}

export interface AssetSnapshot {
  id: string
  snapshot_date: string
  total_net_worth: number
  created_at: string
}

export type QuestType = 'daily' | 'weekly' | 'longterm'
export type QuestStatus = 'todo' | 'done'
export type QuestPriority = 'low' | 'medium' | 'high'

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Quest {
  id: string
  title: string
  description: string
  type: QuestType
  status: QuestStatus
  priority: QuestPriority
  due_date: string | null
  created_at: string
  completed_at: string | null
  subtasks: Subtask[]
}
