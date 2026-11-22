import type { SheetActivity } from '../bots/bot-sheet-operations'
import type { HomeBotRow } from '../home/bots/home-bot-row-views'
import { islandBotState, islandCaption, islandStation } from './island-stations'
import type { IslandBotState, IslandBotView } from './island-types'

export const ISLAND_MAX_BOTS = 6

const PALETTE = ['#0b6e73', '#5d6f2a', '#7a4a1f', '#3d4f50', '#8a5a7a', '#a8473a']

export function islandColor(botId: string, avatarColor?: string): string {
  if (avatarColor) {
    return avatarColor
  }
  let sum = 0
  for (let i = 0; i < botId.length; i++) {
    sum += botId.charCodeAt(i)
  }
  return PALETTE[sum % PALETTE.length] ?? PALETTE[0]!
}

/** Online bot rows only, in row order, capped at the island's capacity; `overflow` counts the rest. */
export function islandBotsFrom(
  rows: readonly HomeBotRow[],
  activity: ReadonlyMap<string, SheetActivity>,
  labels: Record<IslandBotState, string>
): { bots: IslandBotView[]; overflow: number } {
  const eligible = rows.filter((row) => row.kind === 'bot' && !row.offline)
  const bots = eligible.slice(0, ISLAND_MAX_BOTS).map((row): IslandBotView => {
    const read = activity.get(row.key)
    const tool = read?.workers[0]?.tool ?? null
    const dot = row.kind === 'bot' ? row.dot : null
    const state = islandBotState(dot)
    return {
      key: row.key,
      name: row.title,
      color: islandColor(
        row.kind === 'bot' ? row.bot.id : row.key,
        row.kind === 'bot' && typeof row.bot.avatarColor === 'string'
          ? row.bot.avatarColor
          : undefined
      ),
      station: islandStation({ dot, tool, hasWaits: (read?.waits.length ?? 0) > 0 }),
      state,
      stateLabel: labels[state],
      caption: islandCaption(tool)
    }
  })
  return { bots, overflow: Math.max(0, eligible.length - ISLAND_MAX_BOTS) }
}
