import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/character', label: '角色', icon: '◉' },
  { to: '/assets',    label: '资产', icon: '◆' },
  { to: '/world',     label: '世界', icon: '◈' },
  { to: '/quests',    label: '任务', icon: '◎' },
  { to: '/settings',  label: '设置', icon: '✦' },
]

const SIDEBAR_STYLE = { borderRight: '2px solid #6b4423', boxShadow: '2px 0 8px rgba(0,0,0,0.4)' }
const HEADER_STYLE  = { borderBottom: '2px solid #6b4423', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }
const BOTTOM_STYLE  = { borderTop: '2px solid #6b4423' }

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 flex flex-col md:flex-row">

      {/* ── 桌面侧边栏（md+） ── */}
      <aside className="hidden md:flex flex-col w-44 shrink-0 bg-gray-900" style={SIDEBAR_STYLE}>
        <div className="px-4 py-5" style={{ borderBottom: '1px solid #6b4423' }}>
          <div className="pixel-text text-yellow-400">✦ LIFE RPG</div>
          <div className="text-gray-600 text-xs mt-2">v0.2</div>
        </div>
        <nav className="flex-1 flex flex-col p-2 gap-1">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 transition-colors ${
                  isActive
                    ? 'text-yellow-400 bg-green-900/30 border-l-2 border-yellow-400'
                    : 'text-gray-500 hover:text-gray-300 border-l-2 border-transparent'
                }`
              }
            >
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* ── 移动端顶部 Header（< md） ── */}
      <header className="md:hidden px-4 py-3 flex items-center gap-3 shrink-0" style={HEADER_STYLE}>
        <span className="pixel-text text-yellow-400">✦ LIFE RPG ✦</span>
        <span className="text-gray-600 text-xs">v0.2</span>
      </header>

      {/* ── 页面内容 ── */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* ── 移动端底部导航（< md） ── */}
      <nav className="md:hidden flex shrink-0"
        style={{ ...BOTTOM_STYLE, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                isActive ? 'text-yellow-400 bg-green-900/30' : 'text-gray-500 hover:text-gray-300'
              }`
            }
          >
            <span className="text-base leading-none">{icon}</span>
            <span className="text-xs">{label}</span>
          </NavLink>
        ))}
      </nav>

    </div>
  )
}
