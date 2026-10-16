/**
 * 将 release 目录下的 exe + dll 打成绿色版 zip（免安装）
 * 用法：npm run pack:portable
 *       npm run pack:portable:build  （先完整编译再打包）
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const RELEASE = join(root, 'src-tauri', 'target', 'release')
const EXE_NAME = 'imgpress_tauri.exe'
const DLL_NAME = 'imgpress_tauri_lib.dll'

function readMeta() {
  const confPath = join(root, 'src-tauri', 'tauri.conf.json')
  const raw = readFileSync(confPath, 'utf8')
  const productName = raw.match(/"productName"\s*:\s*"([^"]+)"/)?.[1] ?? 'App'
  const version = raw.match(/"version"\s*:\s*"([^"]+)"/)?.[1] ?? '0.0.0'
  return { productName, version }
}

function copyBinary(src, dest) {
  writeFileSync(dest, readFileSync(src))
}

function has7z() {
  const r = spawnSync('7z', ['-h'], { encoding: 'utf8', shell: true })
  return r.status === 0
}

function zipWith7z(outRoot, folderName, zipPath) {
  rmSync(zipPath, { force: true })
  const r = spawnSync('7z', ['a', '-tzip', zipPath, folderName], {
    cwd: outRoot,
    stdio: 'inherit',
    shell: true,
  })
  if (r.status !== 0) {
    throw new Error('7z 打包失败')
  }
}

function zipWithPowerShell(folderPath, zipPath) {
  rmSync(zipPath, { force: true })
  const ps = [
    '-NoProfile',
    '-Command',
    `Compress-Archive -LiteralPath '${folderPath.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
  ]
  const r = spawnSync('powershell', ps, { stdio: 'inherit', shell: false })
  if (r.status !== 0) {
    throw new Error(
      'Compress-Archive 失败（若绿色版目录里的 exe 正在运行，请先关闭再打包）',
    )
  }
}

function assertZipOk(zipPath) {
  if (!existsSync(zipPath) || statSync(zipPath).size < 1000) {
    throw new Error(`未生成有效 zip：${zipPath}`)
  }
}

function main() {
  const exe = join(RELEASE, EXE_NAME)
  const dll = join(RELEASE, DLL_NAME)

  if (!existsSync(exe) || !existsSync(dll)) {
    console.error('未找到编译产物，请先执行：npm run build:client')
    console.error(`  期望：${exe}`)
    console.error(`        ${dll}`)
    process.exit(1)
  }

  const { productName, version } = readMeta()
  const folderName = `${productName}-${version}-x64-portable`
  const outRoot = join(root, 'dist-portable')
  const stageDir = join(outRoot, folderName)
  const zipPath = join(outRoot, `${folderName}.zip`)

  rmSync(stageDir, { recursive: true, force: true })
  mkdirSync(stageDir, { recursive: true })

  copyBinary(exe, join(stageDir, EXE_NAME))
  copyBinary(dll, join(stageDir, DLL_NAME))

  const readme = `【${productName}】绿色版 v${version}（Windows x64）

使用：解压后双击 ${EXE_NAME}，无需安装。

说明：
1. 请保持本文件夹内 ${EXE_NAME} 与 ${DLL_NAME} 在同一目录。
2. 需要 Microsoft Edge WebView2 运行时（Windows 11 通常已自带；
   Windows 10 若无法启动，请安装 WebView2 再试）。
   https://developer.microsoft.com/microsoft-edge/webview2/

若双击无反应，请改用安装包（src-tauri\\target\\release\\bundle\\nsis\\*-setup.exe）。
`
  writeFileSync(join(stageDir, '使用说明.txt'), readme, 'utf8')

  try {
    if (has7z()) {
      zipWith7z(outRoot, folderName, zipPath)
    } else {
      zipWithPowerShell(stageDir, zipPath)
    }
    assertZipOk(zipPath)
  } catch (e) {
    console.error(e.message ?? e)
    process.exit(1)
  }

  console.log('')
  console.log(`绿色版目录：${stageDir}`)
  console.log(`绿色版 zip ：${zipPath}`)
}

main()
