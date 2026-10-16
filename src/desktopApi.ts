import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { UnlistenFn } from '@tauri-apps/api/event'

export type OutputFormat = 'keep' | 'jpeg' | 'png' | 'webp'

export type CompressOptions = {
  quality: number
  maxEdge: number
  format: OutputFormat
  outputDir?: string
}

export type CompressResult = {
  sourcePath: string
  outputPath: string
  beforeBytes: number
  afterBytes: number
  width: number
  height: number
  format: string
  savedRatio: number
}

export type CompressBatchResult = {
  results: CompressResult[]
  errors: { path: string; message: string }[]
}

export type ProgressPayload = {
  done: number
  total: number
  current: string
}

export type MergeDirection = 'horizontal' | 'vertical' | 'grid'

export type MergeOptions = {
  direction: MergeDirection
  columns?: number
  gap: number
  cellMaxEdge: number
  background: string
  format: 'jpeg' | 'png' | 'webp'
  quality: number
  outputDir?: string
  fileName?: string
}

export type MergeResult = {
  outputPath: string
  bytes: number
  width: number
  height: number
  count: number
  format: string
}

/** 最近一次拖放文件的路径（按文件名匹配） */
const dropPathByName = new Map<string, string>()

let dragDropReady = false

async function ensureDragDropPaths() {
  if (dragDropReady) return
  dragDropReady = true
  try {
    const webview = getCurrentWebview()
    await webview.onDragDropEvent((event) => {
      if (event.payload.type === 'drop' && event.payload.paths?.length) {
        for (const p of event.payload.paths) {
          const name = p.replace(/\\/g, '/').split('/').pop() || p
          dropPathByName.set(name, p)
        }
      }
    })
  } catch {
    // 非 Tauri 环境忽略
  }
}

export const desktopApi = {
  pickImages: (): Promise<string[]> => invoke('dialog_pick_images'),
  pickOutputDir: (): Promise<string | null> => invoke('dialog_pick_output_dir'),
  compress: (paths: string[], options: CompressOptions): Promise<CompressBatchResult> =>
    invoke('compress_run', { paths, options }),
  merge: (paths: string[], options: MergeOptions): Promise<MergeResult> =>
    invoke('merge_run', { paths, options }),
  showItem: (filePath: string): Promise<boolean> =>
    invoke('show_item_in_folder', { path: filePath }).then(() => true),
  thumb: (filePath: string): Promise<string> => invoke('image_thumb', { filePath }),
  getPathForFile: (file: File): string => {
    void ensureDragDropPaths()
    return dropPathByName.get(file.name) || ''
  },
  onProgress: (cb: (payload: ProgressPayload) => void): (() => void) => {
    let unlisten: UnlistenFn | null = null
    void listen<ProgressPayload>('compress:progress', (e) => cb(e.payload)).then((fn) => {
      unlisten = fn
    })
    return () => {
      void unlisten?.()
    }
  }
}

declare global {
  interface Window {
    api: typeof desktopApi
  }
}

export function installDesktopApi() {
  window.api = desktopApi
  void ensureDragDropPaths()
}
