import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Asset, AssetSnapshot } from '../types'

interface AssetState {
  assets: Asset[]
  snapshots: AssetSnapshot[]
  totalNetWorth: number
  addAsset: (asset: Asset) => void
  updateAsset: (id: string, fields: Partial<Omit<Asset, 'id'>>) => void
  removeAsset: (id: string) => void
  upsertSnapshot: (snapshot: AssetSnapshot) => void
}

export const useAssetStore = create<AssetState>()(
  persist(
    (set, get) => ({
      assets: [],
      snapshots: [],
      get totalNetWorth() {
        return get().assets.reduce((sum, a) => sum + a.amount * a.unit_price, 0)
      },
      addAsset: (asset) => set((state) => ({ assets: [...state.assets, asset] })),
      updateAsset: (id, fields) =>
        set((state) => ({
          assets: state.assets.map((a) =>
            a.id === id ? { ...a, ...fields, updated_at: new Date().toISOString() } : a
          ),
        })),
      removeAsset: (id) => set((state) => ({ assets: state.assets.filter((a) => a.id !== id) })),
      upsertSnapshot: (snapshot) =>
        set((state) => {
          const idx = state.snapshots.findIndex((s) => s.snapshot_date === snapshot.snapshot_date)
          if (idx >= 0) {
            const updated = [...state.snapshots]
            updated[idx] = snapshot
            return { snapshots: updated }
          }
          return { snapshots: [...state.snapshots, snapshot] }
        }),
    }),
    { name: 'life-rpg-assets' }
  )
)
