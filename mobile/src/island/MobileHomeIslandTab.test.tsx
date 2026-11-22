import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeBotRow } from '../home/bots/home-bot-row-views'
import type { MobileHomeData } from '../home/use-mobile-home-data'
import type { IslandSceneCommand, IslandSceneEvent, IslandTalk } from './island-types'

type FeedStub = {
  activity: Map<string, unknown>
  talks: readonly unknown[]
  takeTalks: () => unknown[]
}

const feed = vi.hoisted((): { current: FeedStub } => ({
  current: { activity: new Map(), talks: [], takeTalks: () => [] }
}))

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 }
}))
vi.mock('react-native-webview', () => ({ WebView: 'WebView' }))
vi.mock('./island-webview-engine.generated', () => ({ ISLAND_WEBVIEW_HTML: '<!doctype html>' }))
vi.mock('../i18n/use-mobile-translation', () => ({
  useMobileTranslation: () => (_key: string, fallback: string) => fallback
}))
vi.mock('../theme/use-mobile-color-scheme', () => ({ useMobileColorScheme: () => 'light' }))
vi.mock('../home/tabs/MobileHomeTabHeader', () => ({ MobileHomeTabHeader: 'Header' }))
vi.mock('./use-island-feed', () => ({ useIslandFeed: () => feed.current }))

import { MobileHomeIslandTab } from './MobileHomeIslandTab'

function botRow(key: string): HomeBotRow {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the island reads only these fields of a bot row.
  return {
    kind: 'bot',
    key,
    title: key,
    bot: { id: `bot-${key}` },
    dot: null,
    needsYou: 0
  } as unknown as HomeBotRow
}

function home(rows: HomeBotRow[]): MobileHomeData {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the tab reads only Home's bot rows and their Needs you count.
  return { bots: { rows, needsYou: 0 } } as unknown as MobileHomeData
}

const inject = vi.fn<(script: string) => void>()

type TabProps = { data: MobileHomeData; active: boolean; onOpenBot: (row: HomeBotRow) => void }

function tabElement(props: TabProps) {
  return createElement(MobileHomeIslandTab, {
    ...props,
    bottomInset: 0,
    fallback: createElement('BotsFallback')
  })
}

function render(props: TabProps): ReactTestRenderer {
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(tabElement(props), {
      createNodeMock: (element) =>
        element.type === 'WebView' ? { injectJavaScript: inject, reload: () => {} } : null
    })
  })
  return renderer
}

const webView = (tab: ReactTestRenderer) => tab.root.find((node) => String(node.type) === 'WebView')

function sceneSays(tab: ReactTestRenderer, event: IslandSceneEvent): void {
  act(() => {
    webView(tab).props.onMessage({ nativeEvent: { data: JSON.stringify(event) } })
  })
}

const PREFIX = 'window.__islandCommand('
const SUFFIX = ');true;'

function sent(): IslandSceneCommand[] {
  return inject.mock.calls.map(([script]) => {
    expect(script.startsWith(PREFIX) && script.endsWith(SUFFIX)).toBe(true)
    return JSON.parse(script.slice(PREFIX.length, -SUFFIX.length))
  })
}

const hasFallback = (tab: ReactTestRenderer) =>
  tab.root.findAll((node) => String(node.type) === 'BotsFallback').length > 0

describe('Island tab', () => {
  beforeEach(() => {
    inject.mockClear()
    feed.current = { activity: new Map(), talks: [], takeTalks: () => [] }
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends a state command with island bots and overflow', () => {
    const tab = render({
      data: home([botRow('k1'), botRow('k2')]),
      active: true,
      onOpenBot: vi.fn()
    })
    expect(inject).not.toHaveBeenCalled()

    sceneSays(tab, { type: 'ready' })

    const last = sent().at(-1)
    expect(last).toMatchObject({ type: 'state', overflow: 0 })
    expect(last?.type === 'state' ? last.bots.map((bot) => bot.key) : null).toEqual(['k1', 'k2'])
  })

  it("opens the tapped bot's row", () => {
    const rows = [botRow('k1'), botRow('k2')]
    const onOpenBot = vi.fn()
    const tab = render({ data: home(rows), active: true, onOpenBot })

    sceneSays(tab, { type: 'tap', key: 'k1' })

    expect(onOpenBot).toHaveBeenCalledTimes(1)
    expect(onOpenBot).toHaveBeenCalledWith(rows[0])
  })

  it('ignores a tap on a key no longer listed', () => {
    const onOpenBot = vi.fn()
    const tab = render({ data: home([botRow('k1')]), active: true, onOpenBot })
    act(() => tab.update(tabElement({ data: home([botRow('k2')]), active: true, onOpenBot })))

    sceneSays(tab, { type: 'tap', key: 'k1' })

    expect(onOpenBot).not.toHaveBeenCalled()
  })

  it('pauses the scene when the tab is hidden', () => {
    const data = home([botRow('k1')])
    const tab = render({ data, active: true, onOpenBot: vi.fn() })
    sceneSays(tab, { type: 'ready' })

    act(() => tab.update(tabElement({ data, active: false, onOpenBot: vi.fn() })))

    expect(sent().at(-1)).toEqual({ type: 'pause' })
  })

  it('shows the bots list fallback after a scene error', () => {
    const tab = render({ data: home([botRow('k1')]), active: true, onOpenBot: vi.fn() })
    expect(hasFallback(tab)).toBe(false)

    sceneSays(tab, { type: 'error', message: 'no webgl' })

    expect(hasFallback(tab)).toBe(true)
    expect(tab.root.findAll((node) => String(node.type) === 'WebView')).toHaveLength(0)
  })

  it('shows the bots list fallback when the scene is not ready 8000ms after the page loads', () => {
    vi.useFakeTimers()
    const tab = render({ data: home([botRow('k1')]), active: true, onOpenBot: vi.fn() })
    act(() => {
      webView(tab).props.onLoad()
    })

    act(() => {
      vi.advanceTimersByTime(7999)
    })
    expect(hasFallback(tab)).toBe(false)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(hasFallback(tab)).toBe(true)
  })

  it('sends queued talks from the feed one command each', () => {
    const talks: IslandTalk[] = [
      { id: 'm1', fromKey: 'k1', toKey: 'k2', text: 'Build is green', meta: 'Dev · group' },
      { id: 'm2', fromKey: 'k2', toKey: 'k1', text: 'Shipping it', meta: 'Dev · group' }
    ]
    const takeTalks = vi.fn((): unknown[] => []).mockReturnValueOnce(talks)
    feed.current = { activity: new Map(), talks, takeTalks }
    const tab = render({
      data: home([botRow('k1'), botRow('k2')]),
      active: true,
      onOpenBot: vi.fn()
    })

    sceneSays(tab, { type: 'ready' })

    expect(sent().filter((command) => command.type === 'talk')).toEqual([
      { type: 'talk', talk: talks[0] },
      { type: 'talk', talk: talks[1] }
    ])
  })
})
