import { useEffect, useMemo, useState } from 'react'
import ImageThumb from './ImageThumb'
import { collectDroppedImages, fileName, formatBytes } from './utils'

type OutputFormat = 'keep' | 'jpeg' | 'png' | 'webp'

type CompressResult = {
  sourcePath: string
  outputPath: string
  beforeBytes: number
  afterBytes: number
  width: number
  height: number
  format: string
  savedRatio: number
}

export default function CompressPanel() {
  const [files, setFiles] = useState<string[]>([])
  const [quality, setQuality] = useState(80)
  const [maxEdge, setMaxEdge] = useState(0)
  const [format, setFormat] = useState<OutputFormat>('keep')
  const [outputDir, setOutputDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<CompressResult[]>([])
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([])
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    return window.api.onProgress((p) => {
      setProgress({ done: p.done, total: p.total })
    })
  }, [])

  const stats = useMemo(() => {
    const before = results.reduce((n, r) => n + r.beforeBytes, 0)
    const after = results.reduce((n, r) => n + r.afterBytes, 0)
    const saved = before > 0 ? (before - after) / before : 0
    return { before, after, saved }
  }, [results])

  const addFiles = (paths: string[]) => {
    setFiles((prev) => [...new Set([...prev, ...paths])])
    setResults([])
    setErrors([])
  }

  const run = async () => {
    if (!files.length || busy) return
    setBusy(true)
    setResults([])
    setErrors([])
    setProgress({ done: 0, total: files.length })
    try {
      const res = await window.api.compress(files, {
        quality,
        maxEdge,
        format,
        outputDir: outputDir || undefined
      })
      setResults(res.results)
      setErrors(res.errors)
    } catch (err) {
      setErrors([{ path: '', message: err instanceof Error ? err.message : String(err) }])
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
        <p>拖拽图片到这里</p>
        <button
          type="button"
          className="primary"
          onClick={() => void window.api.pickImages().then((p) => p.length && addFiles(p))}
        >
          选择图片
        </button>
        {files.length > 0 && <p className="count">已选 {files.length} 张</p>}
      </section>

      <section className="panel">
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
        <label>
          <span>最长边（0 = 不缩放）{maxEdge || '不限制'}</span>
          <input
            type="range"
            min={0}
            max={4096}
            step={64}
            value={maxEdge}
            onChange={(e) => setMaxEdge(Number(e.target.value))}
          />
        </label>
        <div className="formats">
          {(
            [
              ['keep', '保持原格式'],
              ['jpeg', 'JPEG'],
              ['png', 'PNG'],
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
        <div className="out-row">
          <div className="out-path mono">{outputDir || '默认：源文件旁 /compressed'}</div>
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
            disabled={!files.length || busy}
            onClick={() => void run()}
          >
            {busy
              ? `压缩中 ${progress.done}/${progress.total || files.length}`
              : `开始压缩（${files.length}）`}
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
          <h2>待处理</h2>
          <ul>
            {files.map((f) => (
              <li key={f}>
                <div className="file-main">
                  <ImageThumb path={f} />
                  <span className="mono">{fileName(f)}</span>
                </div>
                <button
                  type="button"
                  className="mini"
                  disabled={busy}
                  onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.length > 0 && (
        <section className="results">
          <div className="saved-hero">
            <strong>{Math.round(stats.saved * 100)}%</strong>
            <span>
              共节省 {formatBytes(Math.max(0, stats.before - stats.after))}
              <br />
              {formatBytes(stats.before)} → {formatBytes(stats.after)}
            </span>
          </div>
          <ul>
            {results.map((r) => (
              <li key={r.outputPath}>
                <div>
                  <p className="mono name">{fileName(r.outputPath)}</p>
                  <p className="dim">
                    {formatBytes(r.beforeBytes)} → {formatBytes(r.afterBytes)} · 省{' '}
                    {Math.round(r.savedRatio * 100)}% · {r.width}×{r.height}
                  </p>
                </div>
                <button
                  type="button"
                  className="mini"
                  onClick={() => void window.api.showItem(r.outputPath)}
                >
                  打开位置
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {errors.length > 0 && (
        <section className="errors">
          {errors.map((e, i) => (
            <p key={`${e.path}-${i}`}>
              {e.path ? `${fileName(e.path)}：` : ''}
              {e.message}
            </p>
          ))}
        </section>
      )}
    </>
  )
}
