import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { botActivityRead, type SheetActivity } from '../bots/bot-sheet-operations'
import { groupList, groupRead } from '../bots/bot-group-operations'
import { startHostBotRefresh } from '../bots/host-bot-refresh'
import { botPlaceClient } from '../bots/use-open-bot-home'
import type { HomeBotRow } from '../home/bots/home-bot-row-views'
import { readHostMethodReply } from '../host-screen/sidebar-feed/host-sidebar-feed-operations'
import { useRpcClientContext } from '../transport/connection/client-context'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { islandTalksFrom } from './island-talks'
import type { IslandTalk } from './island-types'

/** The same bot is never re-read more often than this. */
export const ISLAND_ACTIVITY_MIN_MS = 2000

type BotRow = Extract<HomeBotRow, { kind: 'bot' }>

function onlineBotRows(rows: readonly HomeBotRow[]): BotRow[] {
  return rows.filter((row): row is BotRow => row.kind === 'bot' && !row.offline)
}

function placeOf(row: BotRow): string {
  return `${row.pairedHostId}\n${row.executionHost}`
}

/** Reads the activity of the island's bots and the new bot-to-bot talk in their rooms, only while the tab is shown. */
export function useIslandFeed(
  rows: readonly HomeBotRow[],
  active: boolean
): {
  activity: ReadonlyMap<string, SheetActivity>
  talks: readonly IslandTalk[]
  takeTalks: () => IslandTalk[]
} {
  const clients = useRpcClientContext()
  const [activity, setActivity] = useState<ReadonlyMap<string, SheetActivity>>(new Map())
  const [talks, setTalks] = useState<readonly IslandTalk[]>([])
  const queue = useRef<IslandTalk[]>([])
  const lastRead = useRef(new Map<string, number>())
  const unavailable = useRef(new Set<string>())
  const seenSequence = useRef(new Map<string, number>())
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  // The effect restarts only when the set of places or bots changes, not on every row update.
  const botsKey = onlineBotRows(rows)
    .map((row) => `${placeOf(row)}\n${row.key}\n${row.bot.id}`)
    // Hermes on this React Native has no Array.prototype.toSorted; map() already made a fresh array.
    .sort()
    .join('\u0000')

  useEffect(() => {
    if (!active) {
      return
    }
    let current = true
    const places = new Map<string, BotRow>()
    for (const row of onlineBotRows(rowsRef.current)) {
      places.set(placeOf(row), row)
    }
    const stops: (() => void)[] = []
    for (const [place, sample] of places) {
      const paired = clients.getAllClients().find((entry) => entry.hostId === sample.pairedHostId)
      if (!paired) {
        continue
      }
      const client = botPlaceClient(paired.client, {
        pairedHostId: sample.pairedHostId,
        executionHost: sample.executionHost
      })
      const placeRows = (): BotRow[] =>
        onlineBotRows(rowsRef.current).filter((row) => placeOf(row) === place)
      const refresh = (): void => {
        const bots = placeRows()
        for (const row of bots) {
          void readActivity(row, client)
        }
        void readTalks(place, bots, client)
      }
      stops.push(startHostBotRefresh({ client, appState: AppState, refresh, listed: () => true }))
    }

    async function readActivity(row: BotRow, client: RpcClient): Promise<void> {
      if (unavailable.current.has(row.key)) {
        return
      }
      const now = Date.now()
      const last = lastRead.current.get(row.key)
      if (last !== undefined && now - last < ISLAND_ACTIVITY_MIN_MS) {
        return
      }
      lastRead.current.set(row.key, now)
      try {
        const read = readHostMethodReply(
          await botActivityRead.request(client, { botId: row.bot.id }),
          botActivityRead.interpret
        )
        if (read.kind === 'unavailable') {
          // An older host has no bots.activity: place this bot by its dot alone, and stop asking.
          unavailable.current.add(row.key)
        } else if (read.kind === 'answered' && current) {
          setActivity((previous) => new Map(previous).set(row.key, read.value.activity))
        }
      } catch {
        // A failed read keeps what the island shows; the next notice reads again.
      }
    }

    async function readTalks(place: string, bots: BotRow[], client: RpcClient): Promise<void> {
      const keyByBotId = new Map(bots.map((row) => [row.bot.id, row.key]))
      try {
        // Group replies are read as the room transcript reads them: a refusal or a bad shape throws.
        const list = groupList.interpret(await groupList.request(client))
        for (const group of list.groups) {
          const read = groupRead.interpret(await groupRead.request(client, { groupId: group.id }))
          if (!current) {
            return
          }
          const seenKey = `${place}\n${group.id}`
          const after = seenSequence.current.get(seenKey)
          const newest = read.messages.reduce(
            (max, message) => Math.max(max, message.sequence),
            after ?? 0
          )
          seenSequence.current.set(seenKey, newest)
          // The first read only records where the room stood: older talk is not replayed.
          if (after === undefined) {
            continue
          }
          const fresh = islandTalksFrom(read.messages, after, keyByBotId, group.name)
          if (fresh.length > 0) {
            queue.current.push(...fresh)
            setTalks([...queue.current])
          }
        }
      } catch {
        // Talk is optional: the next notice reads again.
      }
    }

    return () => {
      current = false
      for (const stop of stops) {
        stop()
      }
    }
  }, [active, botsKey, clients])

  const takeTalks = useCallback((): IslandTalk[] => {
    const taken = queue.current
    queue.current = []
    setTalks([])
    return taken
  }, [])

  return { activity, talks, takeTalks }
}
