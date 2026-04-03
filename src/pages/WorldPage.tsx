import { Link } from 'react-router-dom'

const WORLD_MODULES = [
  {
    title: 'Polymarket 市场',
    subtitle: '预测市场与外部运行面板',
    description: '查看子市场入口、测试观察位与后续的策略数据展示。',
    to: '/world/polymarket',
    icon: '◈',
    accentClassName: 'text-blue-400 border-blue-500 hover:bg-blue-900/20',
    cta: '[ 进入市场 ]',
  },
  {
    title: '更多世界入口',
    subtitle: '预留扩展位',
    description: '这里后续可以放新闻、宏观、实验看板或其他外部信息源。',
    to: '',
    icon: '◇',
    accentClassName: 'text-gray-500 border-gray-700',
    cta: '[ 即将开放 ]',
  },
] as const

export default function WorldPage() {
  return (
    <div className="p-4 md:p-8 max-w-lg md:max-w-4xl mx-auto space-y-6">
      <section className="pixel-card space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="pixel-text text-yellow-400">WORLD</div>
            <div className="text-gray-300 text-lg md:text-xl">世界</div>
          </div>
          <div className="text-right text-xs text-gray-500">
            外部情报
            <br />
            观察窗口
          </div>
        </div>
        <p className="text-sm text-gray-400">
          用来承接角色系统之外的外部世界信息。第一站先接入 Polymarket 市场。
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {WORLD_MODULES.map((module) => {
          const content = (
            <div className="pixel-card h-full flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-yellow-400 text-sm">{module.title}</div>
                  <div className="text-gray-500 text-xs mt-1">{module.subtitle}</div>
                </div>
                <span className="text-2xl text-gray-500">{module.icon}</span>
              </div>
              <p className="text-sm text-gray-400 flex-1">{module.description}</p>
              <div
                className={`px-3 py-2 text-xs border self-start transition-colors ${module.accentClassName}`}
              >
                {module.cta}
              </div>
            </div>
          )

          if (!module.to) {
            return (
              <div key={module.title} className="opacity-80">
                {content}
              </div>
            )
          }

          return (
            <Link key={module.title} to={module.to} className="block">
              {content}
            </Link>
          )
        })}
      </section>
    </div>
  )
}
