// @vitest-environment happy-dom
import { runInThisContext } from 'node:vm'
import { parse } from 'acorn'
import { afterEach, describe, expect, it } from 'vitest'
import type { IslandSceneCommand, IslandSceneEvent } from './island-types'
import { ISLAND_WEBVIEW_HTML } from './island-webview-engine.generated'

type SceneWindow = {
  ReactNativeWebView?: { postMessage: (message: string) => void }
  __islandCommand?: (command: IslandSceneCommand) => void
}

function inlineScript(html: string): string {
  const open = html.indexOf('<script>')
  const close = html.lastIndexOf('</script>')
  return html.slice(open + '<script>'.length, close)
}

function sceneWindow(): SceneWindow {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the scene reads and writes only these two globals on window.
  return window as unknown as SceneWindow
}

describe('island WebView engine', () => {
  afterEach(() => {
    delete sceneWindow().ReactNativeWebView
    delete sceneWindow().__islandCommand
    document.body.innerHTML = ''
  })

  it('embeds a complete document with the scene and no external URLs', () => {
    expect(ISLAND_WEBVIEW_HTML.startsWith('<!doctype html>')).toBe(true)
    expect(/https?:\/\//.test(ISLAND_WEBVIEW_HTML)).toBe(false)
    expect(ISLAND_WEBVIEW_HTML.includes('__islandCommand')).toBe(true)
  })

  it('keeps the bundled scene inside one script element at the Safari 16 syntax floor', () => {
    expect(ISLAND_WEBVIEW_HTML.match(/<\/script/gi)).toHaveLength(1)
    expect(() => parse(inlineScript(ISLAND_WEBVIEW_HTML), { ecmaVersion: 2022 })).not.toThrow()
  })

  it('reports an error event instead of throwing when WebGL is unavailable', () => {
    const events: IslandSceneEvent[] = []
    sceneWindow().ReactNativeWebView = {
      postMessage: (message) => events.push(JSON.parse(message))
    }
    document.body.innerHTML = ISLAND_WEBVIEW_HTML.slice(
      ISLAND_WEBVIEW_HTML.indexOf('<body>') + '<body>'.length,
      ISLAND_WEBVIEW_HTML.indexOf('<script>')
    )

    runInThisContext(inlineScript(ISLAND_WEBVIEW_HTML))

    expect(events).toEqual([{ type: 'error', message: expect.any(String) }])
    expect(() => sceneWindow().__islandCommand?.({ type: 'pause' })).not.toThrow()
  })
})
