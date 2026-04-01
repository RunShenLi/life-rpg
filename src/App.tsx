import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import CharacterPage from './pages/CharacterPage'
import AssetsPage from './pages/AssetsPage'
import QuestsPage from './pages/QuestsPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/character" replace />} />
          <Route path="character" element={<CharacterPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="quests" element={<QuestsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
