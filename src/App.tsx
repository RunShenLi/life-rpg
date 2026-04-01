import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import DataLoader from './components/DataLoader'

const CharacterPage = lazy(() => import('./pages/CharacterPage'))
const AssetsPage = lazy(() => import('./pages/AssetsPage'))
const QuestsPage = lazy(() => import('./pages/QuestsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function PageLoader() {
  return <div className="p-8 text-center text-gray-600 text-xs">Loading...</div>
}

export default function App() {
  return (
    <BrowserRouter>
      <DataLoader />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/character" replace />} />
            <Route path="character" element={<CharacterPage />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route path="quests" element={<QuestsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
