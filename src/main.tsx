import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 部署后旧 HTML 引用的 JS chunk 已不存在时，Vite 会触发 vite:preloadError。
// 此时强制重载一次拿到最新 HTML（带新 chunk 文件名），sessionStorage 防止无限循环。
window.addEventListener('vite:preloadError', () => {
  const key = 'life-rpg-chunk-recover'
  if (sessionStorage.getItem(key) === '1') return
  sessionStorage.setItem(key, '1')
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
