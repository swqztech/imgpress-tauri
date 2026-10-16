export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export function fileName(p: string) {
  return p.replace(/\\/g, '/').split('/').pop() || p
}

export function collectDroppedImages(files: FileList | File[]) {
  return [...files]
    .map((f) => {
      try {
        return window.api.getPathForFile(f)
      } catch {
        return ''
      }
    })
    .filter((p) => p && /\.(png|jpe?g|webp)$/i.test(p))
}
