import { describe, expect, it } from 'vitest'
import { islandBotState, islandCaption, islandStation } from './island-stations'

describe('islandStation', () => {
  it('sends a bot that needs you to the approval window', () =>
    expect(
      islandStation({ dot: 'permission', tool: { name: 'Bash', input: 'ls' }, hasWaits: false })
    ).toBe('window'))

  it.each([
    [{ name: 'Bash', input: 'xcodebuild archive -scheme App' }, 'dock'],
    [{ name: 'Bash', input: 'asc builds upload' }, 'dock'],
    [{ name: 'Bash', input: 'orca gmail search is:unread' }, 'mail'],
    [{ name: 'Bash', input: 'orca slack read #ios' }, 'board'],
    [{ name: 'Read', input: 'docs/a.md' }, 'shelf'],
    [{ name: 'WebSearch', input: null }, 'shelf'],
    [{ name: 'Edit', input: 'src/a.ts' }, 'desk']
  ])('maps a working tool %o to %s', (tool, station) =>
    expect(islandStation({ dot: 'working', tool, hasWaits: false })).toBe(station)
  )

  it('puts a working bot with no tool at the desk', () =>
    expect(islandStation({ dot: 'working', tool: null, hasWaits: false })).toBe('desk'))

  it('lets an idle bot with a scheduled automation wait at the tower', () =>
    expect(islandStation({ dot: 'active', tool: null, hasWaits: true })).toBe('tower'))

  it('rests an idle bot on the bench', () =>
    expect(islandStation({ dot: null, tool: null, hasWaits: false })).toBe('bench'))
})

describe('islandBotState', () => {
  it.each([
    ['working', 'working'],
    ['permission', 'permission'],
    ['inactive', 'paused'],
    ['active', 'available'],
    [null, 'available']
  ] as const)('maps dot %s to %s', (dot, state) => expect(islandBotState(dot)).toBe(state))
})

describe('islandCaption', () => {
  it('captions a tool with its first input line, cut at 40 chars', () =>
    expect(
      islandCaption({
        name: 'Bash',
        input: 'xcodebuild test -scheme OrcaPod -destination iPhone\nmore'
      })
    ).toBe('Bash: xcodebuild test -scheme OrcaPod -…'))

  it('returns null without a tool', () => expect(islandCaption(null)).toBeNull())
})
