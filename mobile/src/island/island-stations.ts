import type { BotRowStatus } from '../../../src/shared/bots/bot-row-status'
import type { IslandBotState, IslandStation, IslandTool } from './island-types'

const DOCK_PATTERN = /\b(xcodebuild archive|asc |fastlane|gh release|eas submit)/i
const SHELF_TOOLS = /^(Read|Grep|Glob|LS|WebFetch|WebSearch)$/i
const CAPTION_LIMIT = 40

/** Where a bot stands on the island: decided top to bottom, first match wins. */
export function islandStation(input: {
  dot: BotRowStatus | null
  tool: IslandTool | null
  hasWaits: boolean
}): IslandStation {
  const { dot, tool, hasWaits } = input
  if (dot === 'permission') {
    return 'window'
  }
  if (tool) {
    const haystack = `${tool.name} ${tool.input ?? ''}`.toLowerCase()
    if (DOCK_PATTERN.test(tool.input ?? '')) {
      return 'dock'
    }
    if (haystack.includes('gmail')) {
      return 'mail'
    }
    if (haystack.includes('slack')) {
      return 'board'
    }
    if (SHELF_TOOLS.test(tool.name)) {
      return 'shelf'
    }
    return 'desk'
  }
  if (dot === 'working') {
    return 'desk'
  }
  return hasWaits ? 'tower' : 'bench'
}

export function islandBotState(dot: BotRowStatus | null): IslandBotState {
  if (dot === 'working') {
    return 'working'
  }
  if (dot === 'permission') {
    return 'permission'
  }
  if (dot === 'inactive') {
    return 'paused'
  }
  return 'available'
}

export function islandCaption(tool: IslandTool | null): string | null {
  if (!tool) {
    return null
  }
  const firstLine = (tool.input ?? '').split('\n')[0]?.trim() ?? ''
  const caption = firstLine ? `${tool.name}: ${firstLine}` : tool.name
  return caption.length > CAPTION_LIMIT ? `${caption.slice(0, CAPTION_LIMIT - 1)}…` : caption
}
