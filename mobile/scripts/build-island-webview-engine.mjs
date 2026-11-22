// Builds the committed ISLAND_WEBVIEW_HTML (not postinstall); rerun after editing src/island/scene.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as esbuild from 'esbuild'

const scriptDir = import.meta.dirname
const mobileRoot = path.resolve(scriptDir, '..')
const entryPath = path.join(mobileRoot, 'src', 'island', 'scene', 'island-scene.ts')
const outputPath = path.join(mobileRoot, 'src', 'island', 'island-webview-engine.generated.ts')
const target = 'safari16'

// The document loads nothing: every script and style is inline, and the policy refuses the rest.
const contentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

// Scene tokens and the .tag / .bubble styles from docs/mock/orca-pod.html.
const lightTokens = [
  '--phone-card: #ffffff',
  '--ink: #101a1c',
  '--muted: #5a6b6e',
  '--line: #d7dfe0',
  '--accent: #0b6e73',
  '--ok: #1f7a3d',
  '--warn: #a35a00',
  '--scene-sky: #cde0e1',
  '--scene-night: 0',
  'color-scheme: light'
]
const darkTokens = [
  '--phone-card: #151a1b',
  '--ink: #e5eeee',
  '--muted: #8fa1a3',
  '--line: #263132',
  '--accent: #4fb3b6',
  '--ok: #6cc489',
  '--warn: #e9a54c',
  '--scene-sky: #0b1719',
  '--scene-night: 1',
  'color-scheme: dark'
]
const block = (selector, declarations) => `${selector} { ${declarations.join('; ')}; }`

const css = [
  block(':root', [
    ...lightTokens,
    '--font-ui: -apple-system, "SF Pro Text", "Hiragino Sans", system-ui, sans-serif'
  ]),
  `@media (prefers-color-scheme: dark) { ${block(':root:not([data-theme="light"])', darkTokens)} }`,
  block(':root[data-theme="dark"]', darkTokens),
  '* { box-sizing: border-box; }',
  '[hidden] { display: none !important; }',
  block('html, body', [
    'margin: 0',
    'height: 100%',
    'overflow: hidden',
    'background: var(--scene-sky)',
    '-webkit-text-size-adjust: 100%',
    '-webkit-user-select: none',
    'user-select: none',
    '-webkit-touch-callout: none',
    '-webkit-tap-highlight-color: transparent'
  ]),
  '.island { position: fixed; inset: 0; overflow: hidden; }',
  '#scene { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }',
  '.labels { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; }',
  block('.tag', [
    'position: absolute',
    'left: 0',
    'top: 0',
    'pointer-events: auto',
    'display: flex',
    'align-items: center',
    'gap: 5px',
    'white-space: nowrap',
    'border: 0',
    'border-radius: 4px',
    'padding: 2px 7px',
    'background: var(--phone-card)',
    'color: var(--ink)',
    'font: 600 11px var(--font-ui)',
    'box-shadow: 0 1px 2px rgba(0,0,0,.18)'
  ]),
  '.tag i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }',
  '.tag[data-state="work"] i, .tag[data-state="read"] i { background: var(--accent); }',
  '.tag[data-state="talk"] i { background: var(--ok); }',
  '.tag[data-state="wait"] { color: var(--warn); }',
  '.tag[data-state="wait"] i { background: var(--warn); }',
  block('.bubble', [
    'position: absolute',
    'left: 0',
    'top: 0',
    'max-width: 170px',
    'width: max-content',
    'margin-top: -8px',
    'padding: 6px 9px',
    'border: 1px solid var(--line)',
    'border-radius: 8px',
    'background: var(--phone-card)',
    'color: var(--ink)',
    'font: 400 12px/1.4 var(--font-ui)',
    'pointer-events: none'
  ]),
  block('.bubble::after', [
    'content: ""',
    'position: absolute',
    'left: calc(50% + var(--tail, 0px))',
    'bottom: -5px',
    'width: 8px',
    'height: 8px',
    'background: var(--phone-card)',
    'border-right: 1px solid var(--line)',
    'border-bottom: 1px solid var(--line)',
    'transform: translateX(-50%) rotate(45deg)'
  ]),
  '.bubble .meta { display: block; font-size: 10px; color: var(--muted); margin-bottom: 1px; }',
  '.bubble .txt { display: block; overflow-wrap: anywhere; }',
  '.bubble.wait, .bubble.wait::after { border-color: var(--warn); }',
  '.bubble.wait .meta { color: var(--warn); }'
].join('\n')

function htmlText(value, closingTag) {
  return value.replace(new RegExp(`</${closingTag}`, 'gi'), `<\\/${closingTag}`)
}

// three has an XHTML namespace literal; `\/` keeps its runtime value without literal URL text.
function withoutLiteralUrls(js) {
  return js.replace(/(https?):\/\//g, '$1:\\/\\/')
}

async function buildSceneJs() {
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target,
    minify: true,
    // Keep three.js's MIT notice in the shipped document.
    legalComments: 'eof',
    write: false,
    logLevel: 'silent'
  })
  return result.outputFiles[0].text
}

function documentHtml(js) {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">',
    `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">`,
    `<style>\n${htmlText(css, 'style')}\n</style>`,
    '</head>',
    '<body>',
    '<div class="island" id="island">',
    '<canvas id="scene" aria-hidden="true"></canvas>',
    '<div class="labels" id="labels"></div>',
    '</div>',
    `<script>${htmlText(js, 'script')}</script>`,
    '</body>',
    '</html>',
    ''
  ].join('\n')
}

async function main() {
  const js = withoutLiteralUrls(await buildSceneJs())
  if (js.includes('<!--')) {
    throw new Error('The island scene bundle contains "<!--", which would break its inline script.')
  }
  const html = documentHtml(js)
  if (/https?:\/\//.test(html)) {
    throw new Error('The island document must not contain a literal http(s) URL.')
  }
  const contents = [
    '// Generated by scripts/build-island-webview-engine.mjs from src/island/scene (three.js r170,',
    `// vendored under src/island/scene/vendor). Target: ${target}. Do not edit by hand; rerun the script.`,
    // The file is committed; keep the repo formatter from re-quoting the 700 KB literal.
    '// oxfmt-ignore',
    `export const ISLAND_WEBVIEW_HTML = ${JSON.stringify(html)}`,
    ''
  ].join('\n')
  await writeFile(outputPath, contents)
  const kib = (Buffer.byteLength(contents) / 1024).toFixed(1)
  console.log(`Wrote ${path.relative(mobileRoot, outputPath)} (${kib} KiB)`)
}

await main()
