import { useState } from 'react'
import ImageThumb from './ImageThumb'
import { collectDroppedImages, fileName, formatBytes } from './utils'

type MergeDirection = 'horizontal' | 'vertical' | 'grid'
type MergeFormat = 'jpeg' | 'png' | 'webp'

type MergeResult = {
  outputPath: string
  bytes: number
  width: number
  height: number
  count: number
  format: string
}

export default function MergePanel() {
  const [files, setFiles] = useState<string[]>([])
  const [direction, setDirection] = useState<MergeDirection>('horizontal')
  const [columns, setColumns] = useState(2)
  const [gap, setGap] = useState(16)
  const [cellMaxEdge, setCellMaxEdge] = useState(1200)
  const [background, setBackground] = useState('#ffffff')
  const [format, setFormat] = useState<MergeFormat>('png')
  const [quality, setQuality] = useState(90)
  const [outputDir, setOutputDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MergeResult | null>(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const addFiles = (paths: string[]) => {
    setFiles((prev) => [...new Set([...prev, ...paths])])
    setResult(null)
    setError('')
  }

  const move = (index: number, delta: number) => {
    setFiles((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      const tmp = next[index]!
      next[index] = next[target]!
      next[target] = tmp
      return next
    })
  }

  const run = async () => {
    if (files.length < 2 || busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await window.api.merge(files, {
        direction,
        columns,
        gap,
        cellMaxEdge,
        background,
        format,
        quality,
        outputDir: outputDir || undefined
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section
        className={`drop ${dragOver ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const paths = collectDroppedImages(e.dataTransfer.files)
          if (paths.length) addFiles(paths)
        }}
      >
        <p>拖入多张图，合成一张长图 / 拼图</p>
        <button
          type="button"
          className="primary"
          onClick={() => void window.api.pickImages().then((p) => p.length && addFiles(p))}
        >
          选择图片
        </button>
        {files.length > 0 && <p className="count">已选 {files.length} 张（至少 2 张）</p>}
      </section>

      <section className="panel">
        <div className="formats">
          {(
            [
              ['horizontal', '横向拼接'],
              ['vertical', '纵向拼接'],
              ['grid', '网格拼图']
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`chip ${direction === key ? 'on' : ''}`}
              onClick={() => setDirection(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {direction === 'grid' && (
          <label>
            <span>列数 {columns}</span>
            <input
              type="range"
              min={1}
              max={8}
              value={columns}
              onChange={(e) => setColumns(Number(e.target.value))}
            />
          </label>
        )}

        <label>
          <span>间距 {gap}px</span>
          <input
            type="range"
            min={0}
            max={80}
            value={gap}
            onChange={(e) => setGap(Number(e.target.value))}
          />
        </label>
        <label>
          <span>单图最长边 {cellMaxEdge}px</span>
          <input
            type="range"
            min={200}
            max={4096}
            step={50}
            value={cellMaxEdge}
            onChange={(e) => setCellMaxEdge(Number(e.target.value))}
          />
        </label>
        <label>
          <span>质量 {quality}</span>
          <input
            type="range"
            min={40}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
          />
        </label>

        <div className="formats">
          {(
            [
              ['png', 'PNG'],
              ['jpeg', 'JPEG'],
              ['webp', 'WebP']
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`chip ${format === key ? 'on' : ''}`}
              onClick={() => setFormat(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="bg-row">
          <span>背景色</span>
          <div className="bg-controls">
            <input
              type="color"
              value={background === 'transparent' ? '#ffffff' : background}
              onChange={(e) => setBackground(e.target.value)}
            />
            <button
              type="button"
              className={`chip ${background === 'transparent' ? 'on' : ''}`}
              onClick={() => setBackground('transparent')}
            >
              透明（PNG/WebP）
            </button>
          </div>
        </label>

        <div className="out-row">
          <div className="out-path mono">{outputDir || '默认：首张图旁 /merged'}</div>
          <button
            type="button"
            className="ghost"
            onClick={() =>
              void window.api.pickOutputDir().then((d) => d && setOutputDir(d))
            }
          >
            输出目录
          </button>
          {outputDir && (
            <button type="button" className="ghost" onClick={() => setOutputDir('')}>
              清除
            </button>
          )}
        </div>

        <div className="actions">
          <button
            type="button"
            className="primary lg"
            disabled={files.length < 2 || busy}
            onClick={() => void run()}
          >
            {busy ? '合成中…' : `合成一张（${files.length}）`}
          </button>
          {files.length > 0 && (
            <button type="button" className="ghost" disabled={busy} onClick={() => setFiles([])}>
              清空列表
            </button>
          )}
        </div>
      </section>

      {files.length > 0 && (
        <section className="list">
          <h2>顺序（可上下调整）</h2>
          <ul>
            {files.map((f, index) => (
              <li key={`${f}-${index}`}>
                <div className="file-main">
                  <ImageThumb path={f} />
                  <span className="mono">
                    {index + 1}. {fileName(f)}
                  </span>
                </div>
                <div className="row-ops">
                  <button
                    type="button"
                    className="mini"
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    上移
                  </button>
                  <button
                    type="button"
                    className="mini"
                    disabled={busy || index === files.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    下移
                  </button>
                  <button
                    type="button"
                    className="mini"
                    disabled={busy}
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                  >
                    移除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && (
        <section className="results">
          <div className="saved-hero">
            <strong>{result.count}</strong>
            <span>
              张图 → 1 张
              <br />
              {result.width}×{result.height} · {formatBytes(result.bytes)} · {result.format}
            </span>
          </div>
          <ul>
            <li>
              <div className="file-main">
                <ImageThumb path={result.outputPath} className="thumb-lg" />
                <div>
                  <p className="mono name">{fileName(result.outputPath)}</p>
                  <p className="dim">{result.outputPath}</p>
                </div>
              </div>
              <button
                type="button"
                className="mini"
                onClick={() => void window.api.showItem(result.outputPath)}
              >
                打开位置
              </button>
            </li>
          </ul>
        </section>
      )}

      {error && (
        <section className="errors">
          <p>{error}</p>
        </section>
      )}
    </>
  )
}
