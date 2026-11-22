import type { BotGroupMessage } from '../../../src/shared/bots/bot-group-schema'
import type { IslandTalk } from './island-types'

const TALK_LIMIT = 80

export function islandTalkText(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > TALK_LIMIT ? `${collapsed.slice(0, TALK_LIMIT - 1)}…` : collapsed
}

/** Bot-to-bot replies only: a bot's message that answers a peer's request. Nothing is invented. */
export function islandTalksFrom(
  messages: readonly BotGroupMessage[],
  afterSequence: number,
  keyByBotId: ReadonlyMap<string, string>,
  groupName: string
): IslandTalk[] {
  const talks: { sequence: number; talk: IslandTalk }[] = []
  for (const message of messages) {
    if (message.sequence <= afterSequence || message.author.kind !== 'bot' || !message.requester) {
      continue
    }
    const fromKey = keyByBotId.get(message.author.id)
    const toKey = keyByBotId.get(message.requester.id)
    if (!fromKey || !toKey) {
      continue
    }
    talks.push({
      sequence: message.sequence,
      talk: {
        id: message.id,
        fromKey,
        toKey,
        text: islandTalkText(message.text),
        meta: `${groupName} · group`
      }
    })
  }
  // Hermes on this React Native has no Array.prototype.toSorted; talks is local, so sort in place.
  return talks.sort((a, b) => a.sequence - b.sequence).map((entry) => entry.talk)
}
