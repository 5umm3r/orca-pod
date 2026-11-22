import { describe, expect, it } from 'vitest'
import type { BotGroupMessage } from '../../../src/shared/bots/bot-group-schema'
import { islandTalkText, islandTalksFrom } from './island-talks'

function message(overrides: Record<string, unknown> = {}): BotGroupMessage {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the talks read only these fields of a message.
  return {
    id: 'm1',
    groupId: 'g',
    sequence: 5,
    author: { kind: 'bot', id: 'b1', name: 'One' },
    requester: { id: 'b2', name: 'Two' },
    text: 'Done.',
    createdAt: 0,
    turns: [],
    ...overrides
  } as unknown as BotGroupMessage
}

const keys = new Map([
  ['b1', 'k1'],
  ['b2', 'k2']
])

describe('islandTalksFrom', () => {
  it("turns a bot's answer to a peer request into a talk line", () => {
    expect(islandTalksFrom([message()], 0, keys, 'Crew')).toEqual([
      { id: 'm1', fromKey: 'k1', toKey: 'k2', text: 'Done.', meta: 'Crew · group' }
    ])
  })

  it('skips owner posts, bot posts without a requester, and old sequences', () => {
    const messages = [
      message({ id: 'o', author: { kind: 'owner' } }),
      message({ id: 'n', requester: undefined }),
      message({ id: 'old', sequence: 2 })
    ]
    expect(islandTalksFrom(messages, 2, keys, 'Crew')).toEqual([])
  })

  it('skips talks whose bots are not on the island', () => {
    expect(islandTalksFrom([message()], 0, new Map([['b1', 'k1']]), 'Crew')).toEqual([])
  })

  it('orders by sequence ascending', () => {
    const result = islandTalksFrom(
      [message({ id: 'b', sequence: 9 }), message({ id: 'a', sequence: 6 })],
      0,
      keys,
      'Crew'
    )
    expect(result.map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('islandTalkText', () => {
  it('collapses whitespace and cuts long text at 80 chars', () => {
    const text = islandTalkText(`${'word\n'.repeat(30)}`)
    expect(text.length).toBe(80)
    expect(text.endsWith('…')).toBe(true)
    expect(text).not.toContain('\n')
  })

  it('leaves short text alone', () => expect(islandTalkText('a \n b')).toBe('a b'))
})
