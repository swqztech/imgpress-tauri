import { useEffect, useState } from 'react'

type Props = {
  path: string
  className?: string
}

/** 本地图片缩略图（经主进程 sharp 生成） */
export default function ImageThumb({ path, className = '' }: Props) {
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setSrc('')
    setFailed(false)
    void window.api
      .thumb(path)
      .then((url) => {
        if (alive) setSrc(url)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [path])

  return (
    <span className={`thumb ${className}`.trim()} aria-hidden>
      {src ? (
        <img src={src} alt="" draggable={false} />
      ) : (
        <span className={`thumb-ph ${failed ? 'fail' : ''}`} />
      )}
    </span>
  )
}
