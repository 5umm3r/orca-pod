import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { HomeBotRow } from '../home/bots/home-bot-row-views'
import { MobileHomeTabHeader } from '../home/tabs/MobileHomeTabHeader'
import type { MobileHomeData } from '../home/use-mobile-home-data'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors, radii, spacing } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { IslandWebView } from './IslandWebView'
import type { IslandBotState, IslandSceneCommand, IslandSceneEvent } from './island-types'
import { islandBotsFrom } from './island-view-model'
import { useIslandFeed } from './use-island-feed'

// Talk the scene already has is kept only this long, so the command list stays small.
const TALK_KEEP = 8

type TalkCommand = Extract<IslandSceneCommand, { type: 'talk' }>

/** Home's bots on a 3D island; the bots list stands in when the scene cannot run. */
export function MobileHomeIslandTab(props: {
  data: MobileHomeData
  active: boolean
  bottomInset: number
  onOpenBot: (row: HomeBotRow) => void
  fallback: ReactNode
}) {
  const t = useMobileTranslation()
  const scheme = useMobileColorScheme()
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [talkCommands, setTalkCommands] = useState<readonly TalkCommand[]>([])
  const { rows, needsYou } = props.data.bots
  const { activity, talks, takeTalks } = useIslandFeed(rows, props.active && !failed)

  const labels = useMemo<Record<IslandBotState, string>>(
    () => ({
      working: t('island.state.working', 'Working'),
      permission: t('island.state.permission', 'Needs approval'),
      available: t('island.state.available', 'Available'),
      paused: t('island.state.paused', 'Paused')
    }),
    [t]
  )
  const island = useMemo(() => islandBotsFrom(rows, activity, labels), [rows, activity, labels])
  // Home redraws its rows often; the scene hears only an island that changed.
  const islandKey = JSON.stringify(island)
  const stateCommand = useMemo<IslandSceneCommand>(
    () => ({ type: 'state', bots: island.bots, overflow: island.overflow }),
    [islandKey]
  )
  const themeCommand = useMemo<IslandSceneCommand>(
    () => ({ type: 'theme', dark: scheme === 'dark' }),
    [scheme]
  )
  const runCommand = useMemo<IslandSceneCommand>(
    () => (props.active ? { type: 'resume' } : { type: 'pause' }),
    [props.active]
  )

  useEffect(() => {
    if (talks.length === 0) {
      return
    }
    const taken = takeTalks()
    if (taken.length > 0) {
      setTalkCommands((kept) =>
        [...kept, ...taken.map((talk): TalkCommand => ({ type: 'talk', talk }))].slice(-TALK_KEEP)
      )
    }
  }, [talks, takeTalks])

  // Bots exist in the scene before any talk between them plays.
  const commands = useMemo(
    () => [themeCommand, runCommand, stateCommand, ...talkCommands],
    [themeCommand, runCommand, stateCommand, talkCommands]
  )

  const { onOpenBot } = props
  const handleEvent = useCallback(
    (event: IslandSceneEvent) => {
      if (event.type === 'ready') {
        setReady(true)
      } else if (event.type === 'error') {
        setFailed(true)
      } else {
        const row = rows.find((entry) => entry.key === event.key)
        if (row) {
          onOpenBot(row)
        }
      }
    },
    [onOpenBot, rows]
  )

  if (failed) {
    return <>{props.fallback}</>
  }
  const waiting = needsYou > 0 ? rows.find((row) => row.needsYou > 0) : undefined
  return (
    <View style={styles.fill}>
      <IslandWebView commands={commands} onEvent={handleEvent} />
      <View style={styles.top} pointerEvents="box-none">
        <MobileHomeTabHeader title={t('island.tab', 'Island')} />
      </View>
      {ready ? null : (
        <View style={styles.loading} pointerEvents="none">
          <Text style={styles.loadingText}>{t('island.loading', 'Preparing the island')}</Text>
        </View>
      )}
      <View style={[styles.bottom, { paddingBottom: props.bottomInset }]} pointerEvents="box-none">
        {waiting ? (
          <Pressable
            style={({ pressed }) => [styles.needsYou, pressed && styles.needsYouPressed]}
            accessibilityRole="button"
            onPress={() => onOpenBot(waiting)}
          >
            <View style={styles.needsYouDot} />
            <Text style={styles.needsYouText} numberOfLines={1}>
              {needsYou === 1
                ? t('components.hostCard.needsYou_one', '{{count}} needs you', { count: needsYou })
                : t('components.hostCard.needsYou_other', '{{count}} need you', {
                    count: needsYou
                  })}
            </Text>
          </Pressable>
        ) : null}
        {island.overflow > 0 ? (
          <Text style={styles.more}>
            {t('island.more', '+{{count}} more', { count: island.overflow })}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  fill: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  loading: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingText: { fontSize: 13, color: colors.textMuted },
  bottom: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 0,
    gap: spacing.sm,
    alignItems: 'flex-start'
  },
  needsYou: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.statusAmber,
    backgroundColor: colors.bgPanel
  },
  needsYouPressed: { backgroundColor: colors.bgRaised },
  needsYouDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.statusAmber },
  needsYouText: { flexShrink: 1, fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  more: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.mark,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    backgroundColor: colors.bgPanel
  }
}))
