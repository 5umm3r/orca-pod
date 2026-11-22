import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_EXECUTION_HOST_ID } from '../../../src/shared/execution-host/execution-host'
import type { HomeBotRow } from '../home/bots/home-bot-row-views'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import type { RpcResponse } from '../transport/rpc/rpc-wire-types'
import { useIslandFeed } from './use-island-feed'

const harness = vi.hoisted((): { clients: { hostId: string; client: unknown }[] } => ({
  clients: []
}))

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) }
}))

// The real module reaches native session code; the rows here all run on the paired computer itself.
vi.mock('../bots/use-open-bot-home', () => ({ botPlaceClient: (paired: unknown) => paired }))

vi.mock('../transport/connection/client-context', () => ({
  useRpcClientContext: () => ({ getAllClients: () => harness.clients })
}))

const ACTIVITY = {
  activity: { workers: [], inProgress: [], completed: [], automations: [], waits: [] }
}

function row(id: string): HomeBotRow {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Only the fields the feed reads are filled in.
  return {
    kind: 'bot',
    key: `key-${id}`,
    pairedHostId: 'host',
    executionHost: LOCAL_EXECUTION_HOST_ID,
    bot: { id },
    dot: null
  } as unknown as HomeBotRow
}

type Replies = Record<string, (params: unknown) => RpcResponse>

function fakeHost(replies: Replies = {}) {
  const calls: { method: string; params: unknown }[] = []
  let emit: (payload: unknown) => void = () => {}
  const client: RpcClient = {
    sendRequest: async (method: string, params?: unknown): Promise<RpcResponse> => {
      calls.push({ method, params })
      const reply = replies[method]
      if (reply) {
        return reply(params)
      }
      const result = method === 'bots.activity' ? ACTIVITY : { groups: [] }
      return { id: method, ok: true, result }
    },
    subscribe: (_method: string, _params: unknown, onData: (payload: unknown) => void) => {
      emit = onData
      return () => {}
    },
    updateTerminalSubscriptionViewport: () => {},
    getState: () => 'connected',
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => null,
    onStateChange: () => () => {},
    notifyForeground: () => {},
    close: () => {}
  }
  harness.clients = [{ hostId: 'host', client }]
  return {
    activityCalls: () => calls.filter((call) => call.method === 'bots.activity'),
    notify: () => emit({ type: 'botsChanged' }),
    ready: () => emit({ type: 'ready' })
  }
}

type Feed = { takeTalks: () => unknown[]; activity: ReadonlyMap<string, unknown> }

async function mount(rows: readonly HomeBotRow[], active: boolean) {
  const seen: { feed: Feed | null } = { feed: null }
  function Reader({ on }: { on: boolean }): null {
    seen.feed = useIslandFeed(rows, on)
    return null
  }
  let renderer: ReturnType<typeof create> | undefined
  await act(async () => {
    renderer = create(createElement(Reader, { on: active }))
  })
  return {
    seen,
    setActive: async (on: boolean) => {
      await act(async () => renderer?.update(createElement(Reader, { on })))
    },
    unmount: () => act(() => renderer?.unmount())
  }
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

describe('useIslandFeed', () => {
  afterEach(() => vi.useRealTimers())

  it("reads each online bot's activity once when it becomes active", async () => {
    vi.useFakeTimers()
    const host = fakeHost()
    const view = await mount([row('a'), row('b')], true)
    await advance(0)
    expect(host.activityCalls()).toHaveLength(2)
    expect(view.seen.feed?.activity.size).toBe(2)
    await view.unmount()
  })

  it('throttles a bot to one read per 2000ms', async () => {
    vi.useFakeTimers()
    const host = fakeHost()
    const view = await mount([row('a')], true)
    await advance(0)
    host.ready()
    const before = host.activityCalls().length
    for (let i = 0; i < 3; i++) {
      await advance(500)
      host.notify()
      await advance(0)
    }
    expect(host.activityCalls().length - before).toBeLessThanOrEqual(1)
    await view.unmount()
  })

  it('stops reading while inactive', async () => {
    vi.useFakeTimers()
    const host = fakeHost()
    const view = await mount([row('a')], true)
    await advance(0)
    host.ready()
    await view.setActive(false)
    const before = host.activityCalls().length
    await advance(5000)
    host.notify()
    await advance(5000)
    expect(host.activityCalls()).toHaveLength(before)
    await view.unmount()
  })

  it('gives up on a host that answers unavailable', async () => {
    vi.useFakeTimers()
    const host = fakeHost({
      'bots.activity': () => ({
        id: 'x',
        ok: false,
        error: { code: 'method_not_found', message: 'nope' }
      })
    })
    const view = await mount([row('a')], true)
    await advance(0)
    host.ready()
    expect(host.activityCalls()).toHaveLength(1)
    await advance(2500)
    host.notify()
    await advance(2500)
    host.notify()
    await advance(0)
    expect(host.activityCalls()).toHaveLength(1)
    await view.unmount()
  })

  it('queues new group talks once and drops ones already taken', async () => {
    vi.useFakeTimers()
    const group = {
      id: 'g',
      name: 'Room',
      hostId: 'local',
      revision: 1,
      folder: 'room',
      folderWorkspaceId: 'room-home',
      createdAt: 0,
      members: [],
      replyMode: { kind: 'all' }
    }
    const message = (sequence: number) => ({
      id: `m${sequence}`,
      groupId: 'g',
      sequence,
      author: { kind: 'bot', id: 'a', name: 'A' },
      requester: { id: 'b', name: 'B' },
      text: `reply ${sequence}`,
      createdAt: 0,
      turns: []
    })
    let messages = [message(1)]
    const host = fakeHost({
      'bots.groups.list': () => ({ id: 'l', ok: true, result: { groups: [group] } }),
      'bots.groups.read': () => ({
        id: 'r',
        ok: true,
        result: { group, messages, hasEarlier: false }
      })
    })
    const view = await mount([row('a'), row('b')], true)
    await advance(0)
    // The first read only records where the room stood; nothing from before the tab opened shows.
    expect(view.seen.feed?.takeTalks()).toEqual([])
    host.ready()
    messages = [message(1), message(2)]
    await advance(2500)
    await act(async () => host.notify())
    await advance(0)
    const first = view.seen.feed?.takeTalks()
    expect(first).toMatchObject([{ id: 'm2', fromKey: 'key-a', toKey: 'key-b' }])
    expect(view.seen.feed?.takeTalks()).toEqual([])
    await view.unmount()
  })
})
