// Bot meshes, tags, bubbles, walking and packets, ported from docs/mock/island-scene.js.
import type { IslandBotView } from '../island-types'
import type { Camera, Material, Object3D, Point, Scene } from './island-three'
import { addMesh, mat, THREE } from './island-three'
import type { Spot } from './island-world'

type Anim = 'type' | 'read' | 'sleep' | null
type Look = 'work' | 'read' | 'talk' | 'wait' | 'idle'

const TIP: Record<Look, number> = {
  work: 0x3cc8c4,
  read: 0x3cc8c4,
  talk: 0x8fe0a4,
  wait: 0xf0a03a,
  idle: 0x7d8a8b
}

type BotLabel = {
  tag: HTMLButtonElement
  name: HTMLSpanElement
  bubble: HTMLDivElement
  meta: HTMLSpanElement
  text: HTMLSpanElement
}

export type Bot = {
  key: string
  view: IslandBotView
  home: Spot
  at: Spot
  talking: boolean
  removed: boolean
  g: Object3D
  parts: Record<'inner' | 'head' | 'flag' | 'pivot', Object3D>
  paint: Record<'body' | 'eye' | 'tip', Material>
  label: BotLabel
  path: Point[]
  arriveFace: number
  targetRot: number
  moving: boolean
  resolve: (() => void) | null
  phase: number
  flagT: number
}

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))
const reads = (view: IslandBotView) => view.station === 'shelf' || view.station === 'board'

export function animOf(bot: Bot): Anim {
  const { state, station } = bot.view
  if (bot.moving || bot.talking) {
    return null
  }
  if (state === 'working') {
    return reads(bot.view) ? 'read' : 'type'
  }
  return state === 'paused' || (state === 'available' && station === 'tower') ? 'sleep' : null
}

function lookOf(bot: Bot): Look {
  if (bot.talking) {
    return 'talk'
  }
  if (bot.view.state === 'working') {
    return reads(bot.view) ? 'read' : 'work'
  }
  return bot.view.state === 'permission' ? 'wait' : 'idle'
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '') {
  const node = document.createElement(tag)
  node.className = className
  return node
}

export function createBots(scene: Scene, labels: HTMLElement, onTap: (key: string) => void) {
  const shape = {
    base: new THREE.CylinderGeometry(0.33, 0.33, 0.06, 16),
    body: new THREE.CylinderGeometry(0.25, 0.32, 0.55, 16),
    arm: new THREE.SphereGeometry(0.085, 10, 8),
    head: new THREE.SphereGeometry(0.31, 18, 14),
    visor: new THREE.BoxGeometry(0.42, 0.17, 0.14),
    eye: new THREE.SphereGeometry(0.035, 8, 6),
    antenna: new THREE.CylinderGeometry(0.014, 0.014, 0.24, 6),
    tip: new THREE.SphereGeometry(0.06, 10, 8),
    pole: new THREE.CylinderGeometry(0.016, 0.016, 1.3, 6),
    cloth: new THREE.ShapeGeometry(
      new THREE.Shape().moveTo(0, 0).lineTo(0.42, -0.13).lineTo(0, -0.27)
    ),
    packet: new THREE.SphereGeometry(0.07, 10, 8)
  }
  const dark = mat(0x2a3233)
  const shell = mat(0xeef2f1, { flatShading: false, roughness: 0.45 })
  const visor = mat(0x1b2324, { flatShading: false, roughness: 0.3 })
  const cloth = new THREE.MeshStandardMaterial({ color: 0xe9a54c, side: THREE.DoubleSide })
  const packetPaint = new THREE.MeshBasicMaterial({ color: 0x8fe0a4 })
  const packets: { mesh: Object3D; from: Bot; to: Bot; t: number }[] = []
  const projected = new THREE.Vector3()

  function make(view: IslandBotView, spot: Spot): Bot {
    const [g, inner, head, flag, pivot] = Array.from({ length: 5 }, () => new THREE.Group())
    const body = mat(view.color)
    const eye = new THREE.MeshBasicMaterial({ color: 0x8ff0e8 })
    const tip = new THREE.MeshBasicMaterial({ color: TIP.idle })
    scene.add(g)
    g.add(inner)
    addMesh(inner, shape.base, dark, 0, 0.18, 0)
    addMesh(inner, shape.body, body, 0, 0.48, 0)
    addMesh(inner, shape.arm, body, -0.34, 0.55, 0.05)
    addMesh(inner, shape.arm, body, 0.34, 0.55, 0.05)
    head.position.y = 1.05
    inner.add(head)
    addMesh(head, shape.head, shell)
    addMesh(head, shape.visor, visor, 0, 0.02, 0.23)
    addMesh(head, shape.eye, eye, -0.085, 0.025, 0.305)
    addMesh(head, shape.eye, eye, 0.085, 0.025, 0.305)
    addMesh(head, shape.antenna, dark, 0, 0.4, 0)
    addMesh(head, shape.tip, tip, 0, 0.54, 0)
    flag.position.set(0.42, 0.25, 0)
    inner.add(flag)
    addMesh(flag, shape.pole, dark, 0, 0.65, 0)
    pivot.position.y = 1.28
    flag.add(pivot)
    addMesh(pivot, shape.cloth, cloth).receiveShadow = false
    flag.visible = false
    flag.scale.y = 0.001
    g.traverse((object) => {
      object.userData.bot = view.key
    })
    g.position.set(spot.x, 0, spot.z)
    g.rotation.y = spot.face

    // A real button, so VoiceOver can open a bot without finding it in 3D.
    const tag = element('button', 'tag')
    tag.type = 'button'
    const name = element('span')
    tag.append(element('i'), name)
    tag.addEventListener('click', () => onTap(view.key))
    const bubble = element('div', 'bubble')
    bubble.hidden = true
    const meta = element('span', 'meta')
    const text = element('span', 'txt')
    bubble.append(meta, text)
    labels.append(tag, bubble)

    return {
      key: view.key,
      view,
      home: spot,
      at: spot,
      talking: false,
      removed: false,
      g,
      parts: { inner, head, flag, pivot },
      paint: { body, eye, tip },
      label: { tag, name, bubble, meta, text },
      path: [],
      arriveFace: spot.face,
      targetRot: spot.face,
      moving: false,
      resolve: null,
      phase: Math.random() * 6,
      flagT: 0
    }
  }

  function say(bot: Bot, text: string, meta: string, wait: boolean): void {
    bot.label.meta.textContent = meta
    bot.label.meta.hidden = !meta
    bot.label.text.textContent = text
    bot.label.bubble.classList.toggle('wait', wait)
    bot.label.bubble.hidden = false
  }

  // Outside a talk the bubble shows the tool caption, which is real activity.
  function restBubble(bot: Bot): void {
    if (bot.talking) {
      return
    }
    if (bot.view.caption) {
      say(bot, bot.view.caption, '', bot.view.state === 'permission')
    } else {
      bot.label.bubble.hidden = true
    }
  }

  function setView(bot: Bot, view: IslandBotView): void {
    bot.view = view
    bot.paint.body.color.set(view.color)
    bot.label.name.textContent = `${view.name} · ${view.stateLabel}`
    restBubble(bot)
  }

  function walkTo(bot: Bot, spot: Spot, face = spot.face): Promise<void> {
    const path = [bot.at.out, spot.out, { x: spot.x, z: spot.z }].filter((p) => p !== undefined)
    bot.at = spot
    // A newer walk replaces the old one; release whoever awaited the old arrival.
    bot.resolve?.()
    return new Promise((resolve) => {
      bot.path = path
      bot.arriveFace = face
      bot.resolve = resolve
    })
  }

  function remove(bot: Bot): void {
    bot.removed = true
    bot.resolve?.()
    bot.resolve = null
    scene.remove(bot.g)
    for (const owned of Object.values(bot.paint)) {
      owned.dispose()
    }
    bot.label.tag.remove()
    bot.label.bubble.remove()
  }

  function step(bot: Bot, dt: number): void {
    const next = bot.path.at(0)
    if (!next) {
      return
    }
    const { position } = bot.g
    const dx = next.x - position.x
    const dz = next.z - position.z
    const d = Math.hypot(dx, dz)
    if (d >= 0.04) {
      const travel = Math.min(d, 1.5 * dt)
      position.x += (dx / d) * travel
      position.z += (dz / d) * travel
      bot.targetRot = Math.atan2(dx, dz)
      bot.moving = true
      return
    }
    position.x = next.x
    position.z = next.z
    bot.path.shift()
    if (!bot.path.length) {
      bot.moving = false
      bot.targetRot = bot.arriveFace
      const resolve = bot.resolve
      bot.resolve = null
      resolve?.()
    }
  }

  function update(bot: Bot, dt: number, t: number, reduce: boolean): void {
    const { inner, head, flag, pivot } = bot.parts
    step(bot, dt)
    bot.g.rotation.y += wrap(bot.targetRot - bot.g.rotation.y) * Math.min(1, dt * 7)
    const a = animOf(bot)
    const look = lookOf(bot)
    const amp = reduce ? 0 : bot.moving ? 0.05 : a === 'type' ? 0.02 : a === 'sleep' ? 0.025 : 0.04
    const rate = bot.moving ? 10 : a === 'type' ? 14 : a === 'sleep' ? 1.2 : 2.2
    inner.position.y = 0.1 + Math.sin(t * rate + bot.phase) * amp
    inner.rotation.x += ((bot.moving ? 0.18 : 0) - inner.rotation.x) * Math.min(1, dt * 6)
    const typing = 0.12 + (reduce ? 0 : Math.sin(t * 9) * 0.04)
    const hx = a === 'read' ? 0.35 : a === 'sleep' ? 0.3 : a === 'type' ? typing : 0
    head.rotation.x += (hx - head.rotation.x) * Math.min(1, dt * 5)
    const hy = a === 'read' && !reduce ? Math.sin(t * 0.9) * 0.25 : 0
    head.rotation.y += (hy - head.rotation.y) * Math.min(1, dt * 3)
    bot.paint.tip.color.setHex(TIP[look])
    if (look === 'wait' && !reduce) {
      bot.paint.tip.color.multiplyScalar(0.55 + 0.45 * Math.sin(t * 6))
    }
    bot.paint.eye.color.setHex(a === 'sleep' ? 0x2f5755 : 0x8ff0e8)
    bot.flagT += ((look === 'wait' ? 1 : 0) - bot.flagT) * Math.min(1, dt * 4)
    flag.visible = bot.flagT > 0.02
    flag.scale.y = Math.max(0.001, bot.flagT)
    pivot.rotation.y = reduce ? 0 : Math.sin(t * 5) * 0.35
    if (bot.label.tag.dataset.state !== look) {
      bot.label.tag.dataset.state = look
    }
  }

  function placeLabels(bots: Iterable<Bot>, camera: Camera, width: number, height: number): void {
    const screen = (x: number, y: number, z: number) => {
      projected.set(x, y, z).project(camera)
      return [((projected.x + 1) / 2) * width, ((1 - projected.y) / 2) * height]
    }
    for (const { g, label } of bots) {
      const [tx, ty] = screen(g.position.x, 0, g.position.z)
      label.tag.style.transform = `translate(${tx}px,${ty}px) translate(-50%, 6px)`
      const [bx, by] = screen(g.position.x, 1.85, g.position.z)
      const cx = Math.min(Math.max(bx, 92), width - 92)
      label.bubble.style.transform = `translate(${cx}px,${by}px) translate(-50%, -100%)`
      label.bubble.style.setProperty('--tail', `${bx - cx}px`)
    }
  }

  function sendPacket(from: Bot, to: Bot): void {
    if (!from.removed && !to.removed) {
      const mesh = new THREE.Mesh(shape.packet, packetPaint)
      scene.add(mesh)
      packets.push({ mesh, from, to, t: 0 })
    }
  }

  function updatePackets(dt: number): void {
    // Backwards so finished packets can be spliced mid-loop.
    for (let i = packets.length - 1; i >= 0; i--) {
      const packet = packets[i]
      packet.t += dt / 1.1
      const k = Math.min(1, packet.t)
      const a = packet.from.g.position
      const b = packet.to.g.position
      const y = 1.5 + Math.sin(k * Math.PI) * 0.6
      packet.mesh.position.set(a.x + (b.x - a.x) * k, y, a.z + (b.z - a.z) * k)
      if (packet.t >= 1 || packet.from.removed || packet.to.removed) {
        scene.remove(packet.mesh)
        packets.splice(i, 1)
      }
    }
  }

  return { make, setView, say, walkTo, remove, update, placeLabels, sendPacket, updatePackets }
}
