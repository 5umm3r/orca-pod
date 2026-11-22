// Shared contract between the island tab (React Native) and its WebView scene.

export type IslandStation =
  | 'desk'
  | 'shelf'
  | 'board'
  | 'mail'
  | 'dock'
  | 'tower'
  | 'window'
  | 'bench'

export type IslandBotState = 'working' | 'permission' | 'available' | 'paused'

export type IslandTool = { name: string; input: string | null }

export type IslandBotView = {
  key: string
  name: string
  color: string
  station: IslandStation
  state: IslandBotState
  stateLabel: string
  caption: string | null
}

export type IslandTalk = { id: string; fromKey: string; toKey: string; text: string; meta: string }

export type IslandSceneCommand =
  | { type: 'state'; bots: IslandBotView[]; overflow: number }
  | { type: 'talk'; talk: IslandTalk }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'theme'; dark: boolean }

export type IslandSceneEvent =
  | { type: 'ready' }
  | { type: 'tap'; key: string }
  | { type: 'error'; message: string }
