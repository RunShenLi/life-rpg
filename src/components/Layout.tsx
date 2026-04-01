import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/character', label: '角色' },
  { to: '/assets', label: '装备' },
  { to: '/quests', label: '任务' },
  { to: '/settings', label: '设置' },
]

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 flex flex-col">
      {/* Header */}
      <header className="border-b border-green-900 px-4 py-3 flex items-center gap-3">
        <span className="pixel-text text-green-400 text-xs">LIFE RPG</span>
        <span className="text-gray-700 text-xs">v0.1</span>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="border-t border-green-900 flex">
        {NAV_ITEMS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 py-3 text-center text-xs transition-colors ${
                isActive ? 'text-green-400 bg-green-900/20' : 'text-gray-500 hover:text-gray-300'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
