import { useCallback, useEffect, useRef } from 'react'
import { StyleSheet } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import type { IslandSceneCommand, IslandSceneEvent } from './island-types'
import { ISLAND_WEBVIEW_HTML } from './island-webview-engine.generated'

/** A scene that has not said ready this long after its page loaded is treated as failed. */
export const ISLAND_READY_TIMEOUT_MS = 8000

const READY_TIMEOUT = 'island scene sent no ready event'

const SOURCE = { html: ISLAND_WEBVIEW_HTML }

function commandScript(command: IslandSceneCommand): string {
  return 'window.__islandCommand(' + JSON.stringify(command) + ');true;'
}

function sceneEvent(data: string): IslandSceneEvent | null {
  let value: unknown
  try {
    value = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return null
  }
  if (value.type === 'ready') {
    return { type: 'ready' }
  }
  if (value.type === 'tap') {
    return 'key' in value && typeof value.key === 'string' ? { type: 'tap', key: value.key } : null
  }
  if (value.type === 'error') {
    const detail = 'message' in value && typeof value.message === 'string' ? value.message : ''
    return { type: 'error', message: detail }
  }
  return null
}

/** Holds commands until the scene is ready, then sends each command object once. */
export function IslandWebView(props: {
  commands: readonly IslandSceneCommand[]
  onEvent: (event: IslandSceneEvent) => void
}) {
  const webView = useRef<WebView>(null)
  const ready = useRef(false)
  const sent = useRef(new WeakSet<IslandSceneCommand>())
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commands = useRef(props.commands)
  commands.current = props.commands
  const onEvent = useRef(props.onEvent)
  onEvent.current = props.onEvent

  const flush = useCallback(() => {
    if (!ready.current) {
      return
    }
    for (const command of commands.current) {
      if (!sent.current.has(command)) {
        sent.current.add(command)
        webView.current?.injectJavaScript(commandScript(command))
      }
    }
  }, [])

  useEffect(flush, [flush, props.commands])

  const stopReadyTimer = useCallback(() => {
    if (readyTimer.current !== null) {
      clearTimeout(readyTimer.current)
      readyTimer.current = null
    }
  }, [])

  useEffect(() => stopReadyTimer, [stopReadyTimer])

  const handleLoadStart = useCallback(() => {
    stopReadyTimer()
    ready.current = false
    // A new document starts blank: it gets the current theme, bots and run state again, not past talk.
    sent.current = new WeakSet(commands.current.filter((command) => command.type === 'talk'))
  }, [stopReadyTimer])

  // A scene that never boots would otherwise leave a blank island with no error.
  const handleLoad = useCallback(() => {
    if (ready.current || readyTimer.current !== null) {
      return
    }
    readyTimer.current = setTimeout(() => {
      readyTimer.current = null
      onEvent.current({ type: 'error', message: READY_TIMEOUT })
    }, ISLAND_READY_TIMEOUT_MS)
  }, [])

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const scene = sceneEvent(event.nativeEvent.data)
      if (scene === null) {
        return
      }
      if (scene.type === 'ready') {
        ready.current = true
        stopReadyTimer()
        flush()
      }
      onEvent.current(scene)
    },
    [flush, stopReadyTimer]
  )

  return (
    <WebView
      ref={webView}
      source={SOURCE}
      style={styles.webView}
      originWhitelist={['*']}
      javaScriptEnabled
      scrollEnabled={false}
      bounces={false}
      onLoadStart={handleLoadStart}
      onLoad={handleLoad}
      onMessage={handleMessage}
      onError={(event) =>
        onEvent.current({ type: 'error', message: event.nativeEvent.description })
      }
      // iOS can drop the page's process under memory pressure; a reload boots the scene again.
      onContentProcessDidTerminate={() => webView.current?.reload()}
    />
  )
}

const styles = StyleSheet.create({
  webView: { flex: 1, backgroundColor: 'transparent' }
})
