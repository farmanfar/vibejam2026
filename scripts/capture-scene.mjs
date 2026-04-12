import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const CAPTURE_ROOT = path.resolve(process.cwd(), 'artifacts', 'captures')
const USAGE = 'Usage: npm run capture:scene -- --preset <name> [--name <text>] [--out <path>] [--url <baseUrl>] [--show-layout-overlays]'
const EXAMPLE = 'Example: npm run capture:scene -- --preset menu --name Farman --out nested/menu'
const SUPPORTED_FLAGS = ['--preset', '--name', '--view', '--out', '--url', '--show-layout-overlays', '--help', '-h']

function parseArgs(argv) {
  const options = {
    preset: '',
    name: null,
    view: null,
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
    } else if (arg === '--view') {
      options.view = argv[++i] ?? ''
    } else if (arg === '--out') {
      options.out = argv[++i] ?? ''
    } else if (arg === '--url') {
      options.url = argv[++i] ?? options.url
    } else if (arg === '--show-layout-overlays') {
      options.showLayoutOverlays = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`[Capture] Unknown argument "${arg}". Supported flags: ${SUPPORTED_FLAGS.join(', ')}\n${USAGE}`)
    }
  }

  return options
}

function printHelp() {
  console.log(USAGE)
  console.log('Required:')
  console.log('  --preset <name>               Capture preset to open')
  console.log('Optional:')
  console.log('  --name <text>                 Player name for menu preset')
  console.log('  --view <viewId>               Widget viewpoint to jump to (center|left|right|previewClose|featuredClose — legacy: leftWall|rightWall|tvClose also accepted)')
  console.log('  --out <path>                  Output base name under artifacts/captures')
  console.log('  --url <baseUrl>               App URL to open')
  console.log('  --show-layout-overlays        Render LayoutEditor labels in capture')
  console.log('  --help, -h                    Show this help')
  console.log(EXAMPLE)
}

function stripOutputSuffix(raw) {
  if (raw.endsWith('.layout.json')) return raw.slice(0, -'.layout.json'.length)
  if (raw.endsWith('.report.json')) return raw.slice(0, -'.report.json'.length)
  if (raw.endsWith('.png')) return raw.slice(0, -'.png'.length)
  return raw
}

function resolveOutBase(out, preset) {
  const fallback = preset
  const raw = out && out.trim() ? out.trim() : fallback
  const stripped = stripOutputSuffix(raw)
  const normalized = path.normalize(stripped)
  const rootPrefix = path.relative(process.cwd(), CAPTURE_ROOT)

  let relativeOut = normalized
  if (relativeOut === rootPrefix || relativeOut.startsWith(`${rootPrefix}${path.sep}`)) {
    relativeOut = path.relative(rootPrefix, relativeOut)
  }

  if (!relativeOut || relativeOut === '.' || relativeOut === path.sep) {
    relativeOut = fallback
  }

  const resolved = path.resolve(CAPTURE_ROOT, relativeOut)
  const relativeToRoot = path.relative(CAPTURE_ROOT, resolved)
  const escaped = relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)
  if (escaped) {
    throw new Error(`[Capture] Rejected output path "${out}". Output must stay within ${CAPTURE_ROOT}`)
  }

  return resolved
}

function buildCaptureUrl(baseUrl, options) {
  const url = new URL(baseUrl)
  url.searchParams.set('captureMode', '1')
  url.searchParams.set('capturePreset', options.preset)

  if (options.name !== null) {
    url.searchParams.set('name', options.name)
  }

  if (options.view !== null) {
    url.searchParams.set('commanderView', options.view)
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

async function tryGetSceneHint(page) {
  if (!page) return null

  try {
    return await page.evaluate(() => window.__HS_CAPTURE_SCENE__ ?? null)
  } catch (_) {
    return null
  }
}

async function buildStepError(step, error, options, captureUrl, page) {
  const sceneHint = await tryGetSceneHint(page)
  const sceneText = sceneHint ? ` active scene="${sceneHint}".` : ''
  return new Error(`[Capture] ${step} failed for preset "${options.preset}" at ${captureUrl}.${sceneText} ${error.message}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  if (!options.preset) {
    throw new Error(`[Capture] Missing required --preset value.\n${USAGE}`)
  }

  const outBase = resolveOutBase(options.out, options.preset)
  const pngPath = `${outBase}.png`
  const layoutPath = `${outBase}.layout.json`
  const reportPath = `${outBase}.report.json`
  const captureUrl = buildCaptureUrl(options.url, options)

  let browser = null
  let page = null

  try {
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage({
      viewport: { width: 960, height: 540 },
    })

    try {
      await page.goto(captureUrl, { waitUntil: 'domcontentloaded' })
    } catch (error) {
      throw await buildStepError('Page load', error, options, captureUrl, page)
    }

    try {
      await page.waitForFunction(() => window.__HS_CAPTURE_READY__ === true, null, { timeout: 15000 })
      await page.waitForTimeout(50)
    } catch (error) {
      const step = error.name === 'TimeoutError' ? 'Ready timeout' : 'Ready wait'
      throw await buildStepError(step, error, options, captureUrl, page)
    }

    let snapshot
    try {
      snapshot = await page.evaluate(() => {
        if (!window.LayoutEditor || typeof window.LayoutEditor.dumpSnapshot !== 'function') {
          throw new Error('LayoutEditor.dumpSnapshot() is not available')
        }

        return window.LayoutEditor.dumpSnapshot()
      })
    } catch (error) {
      const step = error.message.includes('dumpSnapshot')
        ? 'Snapshot export'
        : 'Page evaluation'
      throw await buildStepError(step, error, options, captureUrl, page)
    }

    const report = analyzeSnapshot(snapshot)

    try {
      await mkdir(path.dirname(pngPath), { recursive: true })
      await page.screenshot({
        path: pngPath,
        animations: 'disabled',
        scale: 'css',
      })
      await writeJson(layoutPath, snapshot)
      await writeJson(reportPath, report)
    } catch (error) {
      throw await buildStepError('Artifact write', error, options, captureUrl, page)
    }

    console.log(`[Capture] Scene: ${snapshot.scene}`)
    console.log(`[Capture] Screenshot: ${pngPath}`)
    console.log(`[Capture] Layout: ${layoutPath}`)
    console.log(`[Capture] Report: ${reportPath}`)
    console.log(`[Capture] Issues: ${report.issueCount}`)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
