import { describe, expect, it } from 'vitest'
import type { HomeBotRow } from '../home/bots/home-bot-row-views'
import type { SheetActivity } from '../bots/bot-sheet-operations'
import type { IslandBotState } from './island-types'
import { ISLAND_MAX_BOTS, islandBotsFrom, islandColor } from './island-view-model'

const labels: Record<IslandBotState, string> = {
  working: 'Working',
  permission: 'Needs you',
  available: 'Available',
  paused: 'Paused'
}

function row(key: string, overrides: Record<string, unknown> = {}): HomeBotRow {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the view model reads only these fields of a row.
  return {
    kind: 'bot',
    key,
    title: `Bot ${key}`,
    dot: null,
    bot: { id: `id-${key}`, name: `Bot ${key}`, avatarColor: undefined },
    ...overrides
  } as unknown as HomeBotRow
}

function activity(overrides: Record<string, unknown>): SheetActivity {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the view model reads only workers and waits.
  return { workers: [], waits: [], ...overrides } as unknown as SheetActivity
}

describe('islandBotsFrom', () => {
  it('keeps only bot rows that are online, in row order', () => {
    const { bots } = islandBotsFrom(
      [row('a'), row('g', { kind: 'group' }), row('off', { offline: true })],
      new Map(),
      labels
    )
    expect(bots.map((b) => b.key)).toEqual(['a'])
  })

  it('caps the island at six bots and counts the rest', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(`k${i}`))
    const { bots, overflow } = islandBotsFrom(rows, new Map(), labels)
    expect(bots.length).toBe(ISLAND_MAX_BOTS)
    expect(overflow).toBe(2)
  })

  it("uses the first worker's tool for the station and caption", () => {
    const map = new Map([
      [
        'a',
        activity({
          workers: [
            {
              kind: 'worker',
              key: 'w',
              title: 't',
              dot: 'working',
              origin: null,
              tool: { name: 'Read', input: 'a.md' }
            }
          ]
        })
      ]
    ])
    const [bot] = islandBotsFrom([row('a', { dot: 'working' })], map, labels).bots
    expect(bot?.station).toBe('shelf')
    expect(bot?.caption).toBe('Read: a.md')
  })

  it('falls back to the row dot when no activity was read', () => {
    const [bot] = islandBotsFrom([row('a', { dot: 'working' })], new Map(), labels).bots
    expect(bot?.station).toBe('desk')
    expect(bot?.stateLabel).toBe(labels.working)
  })
})

describe('islandColor', () => {
  it('returns the avatar color when set', () => expect(islandColor('x', '#112233')).toBe('#112233'))

  it('picks from the palette by char code sum otherwise', () =>
    // 'a' = 97, 97 % 6 = 1
    expect(islandColor('a')).toBe('#5d6f2a'))
})
