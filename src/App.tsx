import { useState } from 'react'
import CompressPanel from './CompressPanel'
import MergePanel from './MergePanel'

/** 后续加功能时在此注册新 tab 即可 */
const TABS = [
  { id: 'compress', label: '压缩', blurb: '把体积压下去，把细节留住' },
  { id: 'merge', label: '拼接', blurb: '多张图合成一张长图或拼图' }
] as const

type TabId = (typeof TABS)[number]['id']

export default function App() {
  const [tab, setTab] = useState<TabId>('compress')
  const current = TABS.find((t) => t.id === tab) ?? TABS[0]

  return (
    <div className="app">
      <header className="hero">
        <p className="brand">轻图</p>
        <h1>{current.blurb}</h1>
        <p className="lead">PNG · JPG · WebP · 本地处理，结果写到文件夹</p>
        <nav className="tabs" aria-label="功能">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab ${tab === t.id ? 'on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'compress' && <CompressPanel />}
      {tab === 'merge' && <MergePanel />}
    </div>
  )
}
