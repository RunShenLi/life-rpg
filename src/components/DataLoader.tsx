import { useEffect } from 'react'
import { useCharacterStore } from '../store/characterStore'
import { useAssetStore } from '../store/assetStore'
import { useQuestStore } from '../store/questStore'

/**
 * 挂载时从 Supabase 拉取数据覆盖本地缓存。
 * 不渲染任何内容，纯副作用组件。
 */
export default function DataLoader() {
  const loadCharacter = useCharacterStore((s) => s.loadFromSupabase)
  const loadAssets = useAssetStore((s) => s.loadFromSupabase)
  const loadQuests = useQuestStore((s) => s.loadFromSupabase)

  useEffect(() => {
    Promise.all([loadCharacter(), loadAssets(), loadQuests()])
  }, [loadCharacter, loadAssets, loadQuests])

  return null
}
