import { Link } from 'react-router-dom'

const MARKET_GROUPS = [
  {
    title: '天气市场',
    subtitle: 'Weather Market',
    description: '查看天气市场测试、持仓与监控数据的入口页。',
    to: '/world/polymarket/weather',
    icon: '☼',
  },
  {
    title: '更多子市场',
    subtitle: 'Coming Soon',
    description: '后续可扩展 BTC 5m、多结果事件、统一持仓总览与运行诊断。',
    to: '',
    icon: '☍',
  },
] as const

export default function PolymarketPage() {
  return (
    <div className="p-4 md:p-8 max-w-lg md:max-w-4xl mx-auto space-y-6">
      <section className="pixel-card space-y-3">
        <Link to="/world" className="inline-flex text-xs text-gray-500 hover:text-yellow-400 transition-colors">
          ← 返回世界
        </Link>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="pixel-text text-yellow-400">POLYMARKET</div>
            <div className="text-gray-300 text-lg md:text-xl">市场入口</div>
          </div>
          <div className="text-right text-xs text-gray-500">
            子市场
            <br />
            观察面板
          </div>
        </div>
        <p className="text-sm text-gray-400">
          这里先作为 Polymarket 的总入口。当前只开放天气市场，后续再扩展其他市场与统一诊断页。
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {MARKET_GROUPS.map((group) => {
          const card = (
            <div className="pixel-card h-full flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-green-400 text-sm">{group.title}</div>
                  <div className="text-gray-500 text-xs mt-1">{group.subtitle}</div>
                </div>
                <span className="text-2xl text-gray-500">{group.icon}</span>
              </div>
              <p className="text-sm text-gray-400 flex-1">{group.description}</p>
              <div
                className={`px-3 py-2 text-xs border self-start ${
                  group.to
                    ? 'text-green-400 border-green-500 hover:bg-green-900/20 transition-colors'
                    : 'text-gray-500 border-gray-700'
                }`}
              >
                {group.to ? '[ 打开子市场 ]' : '[ 即将开放 ]'}
              </div>
            </div>
          )

          if (!group.to) {
            return <div key={group.title}>{card}</div>
          }

          return (
            <Link key={group.title} to={group.to} className="block">
              {card}
            </Link>
          )
        })}
      </section>
    </div>
  )
}
