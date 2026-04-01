import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Asset, AssetSnapshot } from '../types'
import {
  dbFetchAssets,
  dbFetchSnapshots,
  dbInsertAsset,
  dbUpdateAsset,
  dbDeleteAsset,
  dbUpsertSnapshot,
} from '../lib/db'

interface AssetState {
  assets: Asset[]
  snapshots: AssetSnapshot[]
  totalNetWorth: number
  addAsset: (asset: Asset) => void
  updateAsset: (id: string, fields: Partial<Omit<Asset, 'id'>>) => void
  removeAsset: (id: string) => void
  upsertSnapshot: (snapshot: AssetSnapshot) => void
  loadFromSupabase: () => Promise<void>
}

export const useAssetStore = create<AssetState>()(
  persist(
    (set, get) => ({
      assets: [],
      snapshots: [],
      get totalNetWorth() {
        return get().assets.reduce((sum, a) => sum + a.amount * a.unit_price, 0)
      },

      addAsset: (asset) => {
        set((state) => ({ assets: [...state.assets, asset] }))
        dbInsertAsset(asset).catch(() => {})
      },

      updateAsset: (id, fields) => {
        set((state) => ({
          assets: state.assets.map((a) =>
            a.id === id ? { ...a, ...fields, updated_at: new Date().toISOString() } : a
          ),
        }))
        dbUpdateAsset(id, { ...fields, updated_at: new Date().toISOString() }).catch(() => {})
      },

      removeAsset: (id) => {
        set((state) => ({ assets: state.assets.filter((a) => a.id !== id) }))
        dbDeleteAsset(id).catch(() => {})
      },

      upsertSnapshot: (snapshot) => {
        set((state) => {
          const idx = state.snapshots.findIndex((s) => s.snapshot_date === snapshot.snapshot_date)
          if (idx >= 0) {
            const updated = [...state.snapshots]
            updated[idx] = snapshot
            return { snapshots: updated }
          }
          return { snapshots: [...state.snapshots, snapshot] }
        })
        dbUpsertSnapshot(snapshot).catch(() => {})
      },

      loadFromSupabase: async () => {
        try {
          const [assets, snapshots] = await Promise.all([
            dbFetchAssets(),
            dbFetchSnapshots(),
          ])
          set({ assets, snapshots })
        } catch (e) {
          console.warn('[life-rpg] assets sync failed:', e)
        }
      },
    }),
    { name: 'life-rpg-assets' }
  )
)
