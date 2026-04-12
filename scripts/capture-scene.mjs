import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

function parseArgs(argv) {
  const options = {
    preset: '',
    name: null,
    out: null,
    url: 'http://127.0.0.1:5173',
    showLayoutOverlays: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--preset') {
      options.preset = argv[++i] ?? ''
    } else if (arg === '--name') {
      options.name = argv[++i] ?? ''
    } else if (arg === '--out') {
      options.out = argv[++i] ?? ''
    } else if (arg === '--url') {
      options.url = argv[++i] ?? options.url
    } else if (arg === '--show-layout-overlays') {
      options.showLayoutOverlays = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function printHelp() {
  console.log('Usage: npm run capture:scene -- --preset <name> [--name <text>] [--out <path>] [--url <baseUrl>] [--show-layout-overlays]')
}

function normalizeOutBase(out, preset) {
  const fallback = path.join('artifacts', 'captures', preset)
  const raw = out && out.trim() ? out.trim() : fallback

  if (raw.endsWith('.layout.json')) return raw.slice(0, -'.layout.json'.length)
  if (raw.endsWith('.report.json')) return raw.slice(0, -'.report.json'.length)
  if (raw.endsWith('.png')) return raw.slice(0, -'.png'.length)
  return raw
}

function buildCaptureUrl(baseUrl, options) {
  const url = new URL(baseUrl)
  url.searchParams.set('captureMode', '1')
  url.searchParams.set('capturePreset', options.preset)

  if (options.name !== null) {
    url.searchParams.set('name', options.name)
  }

  if (options.showLayoutOverlays) {
    url.searchParams.set('showLayoutOverlays', '1')
  }

  return url.toString()
}

function intersectArea(a, b) {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)

  if (right <= left || bottom <= top) return 0
  return (right - left) * (bottom - top)
}

function analyzeSnapshot(snapshot) {
  const issues = []
  const width = snapshot?.gameSize?.width ?? 960
  const height = snapshot?.gameSize?.height ?? 540
  const elements = Array.isArray(snapshot?.elements) ? snapshot.elements : []

  for (const element of elements) {
    if (!element.visible) continue

    const offscreen = element.x < 0
      || element.y < 0
      || element.x + element.width > width
      || element.y + element.height > height

    if (offscreen) {
      issues.push({
        type: 'offscreen',
        key: element.key,
        kind: element.kind,
        bounds: {
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
        },
      })
    }
  }

  const collidable = elements.filter(element =>
    element.visible
    && element.width > 0
    && element.height > 0
    && ['text', 'button', 'card'].includes(element.kind)
  )

  for (let i = 0; i < collidable.length; i++) {
    for (let j = i + 1; j < collidable.length; j++) {
      const a = collidable[i]
      const b = collidable[j]
      if (intersectArea(a, b) <= 0) continue

      issues.push({
        type: 'collision',
        keys: [a.key, b.key],
        kinds: [a.kind, b.kind],
        bounds: [
          { x: a.x, y: a.y, width: a.width, height: a.height },
          { x: b.x, y: b.y, width: b.width, height: b.height },
        ],
      })
    }
  }

  return {
    scene: snapshot?.scene ?? null,
    gameSize: snapshot?.gameSize ?? { width, height },
    issueCount: issues.length,
    issues,
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  if (!options.preset) {
    throw new Error('Missing required --preset value')
  }

  const outBase = normalizeOutBase(options.out, options.preset)
  const pngPath = `${outBase}.png`
  const layoutPath = `${outBase}.layout.json`
  const reportPath = `${outBase}.report.json`
  const captureUrl = buildCaptureUrl(options.url, options)

  const browser = await chromium.launch({ headless: true })

  try {
    const page = await browser.newPage({
      viewport: { width: 960, height: 540 },
    })

    await page.goto(captureUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__HS_CAPTURE_READY__ === true, null, { timeout: 15000 })
    await page.waitForTimeout(50)

    const snapshot = await page.evaluate(() => {
      if (!window.LayoutEditor || typeof window.LayoutEditor.dumpSnapshot !== 'function') {
        throw new Error('LayoutEditor.dumpSnapshot() is not available')
      }

      return window.LayoutEditor.dumpSnapshot()
    })

    const report = analyzeSnapshot(snapshot)

    await mkdir(path.dirname(pngPath), { recursive: true })
    await page.screenshot({
      path: pngPath,
      animations: 'disabled',
      scale: 'css',
    })

    await writeJson(layoutPath, snapshot)
    await writeJson(reportPath, report)

    console.log(`[Capture] Scene: ${snapshot.scene}`)
    console.log(`[Capture] Screenshot: ${pngPath}`)
    console.log(`[Capture] Layout: ${layoutPath}`)
    console.log(`[Capture] Report: ${reportPath}`)
    console.log(`[Capture] Issues: ${report.issueCount}`)
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(`[Capture] Failed: ${error.message}`)
  process.exitCode = 1
})
