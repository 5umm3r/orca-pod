// Island WebView scene: plays React Native's commands; the mock's scripted day is gone.
import type {
  IslandBotView,
  IslandSceneCommand,
  IslandSceneEvent,
  IslandTalk
} from '../island-types'
import { animOf, createBots, type Bot } from './island-bots'
import { THREE } from './island-three'
import { createWorld, STATIONS, type Spot } from './island-world'

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void }
    __islandCommand?: (command: IslandSceneCommand) => void
  }
}

const FOV = 40
const SLOT_SPACING = 0.7
const WALK_RADIUS = 3.7
const TALK_GAP = 1.4
const TALK_MS = 3900

function post(event: IslandSceneEvent): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(event))
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function onIsland(spot: Spot): Spot {
  const r = Math.hypot(spot.x, spot.z)
  return r <= WALK_RADIUS
    ? spot
    : { ...spot, x: (spot.x / r) * WALK_RADIUS, z: (spot.z / r) * WALK_RADIUS }
}

const samePlace = (a: Spot, b: Spot) => a.x === b.x && a.z === b.z

// Bots sharing a station stand side by side, 0.7 apart along x, centred on the station.
function homeSpots(views: readonly IslandBotView[]): Map<string, Spot> {
  const byStation = new Map<string, string[]>()
  for (const view of views) {
    byStation.set(view.station, [...(byStation.get(view.station) ?? []), view.key])
  }
  const spots = new Map<string, Spot>()
  for (const view of views) {
    const mates = byStation.get(view.station) ?? [view.key]
    const offset = (mates.indexOf(view.key) - (mates.length - 1) / 2) * SLOT_SPACING
    const station = STATIONS[view.station]
    spots.set(view.key, onIsland({ ...station, x: station.x + offset }))
  }
  return spots
}

// The speaker stops TALK_GAP short of the listener, on the listener's side facing the speaker.
function meetingSpot(listener: Bot, speaker: Bot): Spot {
  const l = listener.g.position
  const s = speaker.g.position
  const d = Math.hypot(s.x - l.x, s.z - l.z)
  const ux = d > 0.01 ? (s.x - l.x) / d : Math.sin(listener.g.rotation.y)
  const uz = d > 0.01 ? (s.z - l.z) / d : Math.cos(listener.g.rotation.y)
  const spot = onIsland({ x: l.x + ux * TALK_GAP, z: l.z + uz * TALK_GAP, face: 0 })
  return { ...spot, face: Math.atan2(l.x - spot.x, l.z - spot.z) }
}

function createIslandScene(): (command: IslandSceneCommand) => void {
  const stage = document.getElementById('island')
  const canvas = document.getElementById('scene')
  const labels = document.getElementById('labels')
  if (!stage || !labels || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error('The island document is missing its scene elements.')
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // The mock was tuned on r128, which used colors as given; r152+ color management washes it out.
  THREE.ColorManagement.enabled = false
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200)
  const target = new THREE.Vector3().set(0, -0.7, 0)
  const world = createWorld(scene)
  const kit = createBots(scene, labels, (key) => post({ type: 'tap', key }))
  const bots = new Map<string, Bot>()
  const talks: IslandTalk[] = []
  let talking = false

  function applyState(views: readonly IslandBotView[]): void {
    const listed = new Set(views.map((view) => view.key))
    for (const bot of bots.values()) {
      if (!listed.has(bot.key)) {
        kit.remove(bot)
        bots.delete(bot.key)
      }
    }
    const spots = homeSpots(views)
    for (const view of views) {
      const spot = spots.get(view.key) ?? STATIONS[view.station]
      const bot = bots.get(view.key) ?? kit.make(view, spot)
      bots.set(view.key, bot)
      kit.setView(bot, view)
      const moved = !samePlace(bot.home, spot)
      bot.home = spot
      if (moved && !bot.talking) {
        void kit.walkTo(bot, spot)
      }
    }
  }

  function settle(bot: Bot): Promise<void> {
    if (bot.removed) {
      return Promise.resolve()
    }
    // Re-applying the view brings back the caption bubble the talk replaced.
    kit.setView(bot, bot.view)
    if (!samePlace(bot.at, bot.home)) {
      return kit.walkTo(bot, bot.home)
    }
    bot.targetRot = bot.home.face
    return Promise.resolve()
  }

  async function playTalk(talk: IslandTalk): Promise<void> {
    const from = bots.get(talk.fromKey)
    const to = bots.get(talk.toKey)
    if (!from || !to || from === to) {
      return
    }
    from.talking = true
    to.talking = true
    from.label.bubble.hidden = true
    to.label.bubble.hidden = true
    const meet = meetingSpot(to, from)
    to.targetRot = Math.atan2(meet.x - to.g.position.x, meet.z - to.g.position.z)
    await kit.walkTo(from, meet)
    if (!from.removed && !to.removed) {
      kit.say(from, talk.text, talk.meta, false)
      kit.sendPacket(from, to)
      setTimeout(() => kit.sendPacket(from, to), 300)
      await sleep(TALK_MS)
      from.label.bubble.hidden = true
    }
    from.talking = false
    to.talking = false
    await Promise.all([settle(to), settle(from)])
  }

  async function playTalks(): Promise<void> {
    talking = true
    for (let talk = talks.shift(); talk; talk = talks.shift()) {
      await playTalk(talk)
    }
    talking = false
  }

  let width = 0
  let height = 0
  let camDist = 18
  let azDrag = 0
  function resize(): void {
    width = stage?.clientWidth ?? 0
    height = stage?.clientHeight ?? 0
    if (!width || !height) {
      return
    }
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    const half = Math.tan((FOV * Math.PI) / 360)
    camDist = Math.min(24, Math.max(11, 4.7 / (half * camera.aspect)))
  }
  new ResizeObserver(resize).observe(stage)
  resize()

  function placeCamera(t: number): void {
    const a = 0.45 + azDrag + (reduce ? 0 : Math.sin(t * 0.07) * 0.22)
    const el = 0.6
    const ring = Math.cos(el) * camDist
    camera.position.set(
      target.x + Math.sin(a) * ring,
      target.y + Math.sin(el) * camDist,
      target.z + Math.cos(a) * ring
    )
    camera.lookAt(target)
  }

  // Drag to orbit; a press that barely moves is a tap on whatever bot it hits.
  let down: { x: number; y: number; az: number; moved: number } | null = null
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  canvas.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY, az: azDrag, moved: 0 }
    canvas.setPointerCapture(event.pointerId)
  })
  canvas.addEventListener('pointermove', (event) => {
    if (!down) {
      return
    }
    const dx = event.clientX - down.x
    down.moved = Math.max(down.moved, Math.abs(dx) + Math.abs(event.clientY - down.y))
    azDrag = down.az - dx * 0.008
  })
  canvas.addEventListener('pointerup', (event) => {
    if (down && down.moved < 6) {
      const rect = canvas.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      ndc.set(x, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const [hit] = ray.intersectObjects(
        [...bots.values()].map((bot) => bot.g),
        true
      )
      const key = hit?.object.userData.bot
      if (typeof key === 'string') {
        post({ type: 'tap', key })
      }
    }
    down = null
  })
  canvas.addEventListener('pointercancel', () => {
    down = null
  })

  world.applyTheme()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', world.applyTheme)

  let running = true
  let frameId = 0
  let last = performance.now()
  function frame(now: number): void {
    frameId = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const t = now / 1000
    let deskTyping = false
    for (const bot of bots.values()) {
      kit.update(bot, dt, t, reduce)
      deskTyping ||= bot.view.station === 'desk' && animOf(bot) === 'type'
    }
    kit.updatePackets(dt)
    if (!width || !height) {
      return
    }
    world.tick(dt, t, deskTyping)
    placeCamera(t)
    renderer.render(scene, camera)
    kit.placeLabels(bots.values(), camera, width, height)
  }
  frameId = requestAnimationFrame(frame)

  return (command) => {
    switch (command.type) {
      case 'state':
        // The island draws at most the bots it is given; React Native shows the overflow count.
        applyState(command.bots)
        return
      case 'talk':
        talks.push(command.talk)
        if (!talking) {
          void playTalks()
        }
        return
      case 'pause':
        running = false
        cancelAnimationFrame(frameId)
        return
      case 'resume':
        if (!running) {
          running = true
          last = performance.now()
          frameId = requestAnimationFrame(frame)
        }
        return
      case 'theme':
        document.documentElement.dataset.theme = command.dark ? 'dark' : 'light'
        world.applyTheme()
        return
    }
  }
}

function boot(): void {
  let handle: ((command: IslandSceneCommand) => void) | null = null
  // Defined before WebGL starts so a command that races a failed start is a no-op, not a throw.
  window.__islandCommand = (command) => handle?.(command)
  try {
    handle = createIslandScene()
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    return
  }
  post({ type: 'ready' })
}

boot()
