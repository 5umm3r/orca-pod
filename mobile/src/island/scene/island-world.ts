// The static island: ground, workstations, sky and lights, ported from docs/mock/island-scene.js.
import type { IslandStation } from '../island-types'
import type { Material, Object3D, Point, Scene } from './island-three'
import { addMesh, mat, THREE } from './island-three'

// r155+ dropped the legacy light scale the r128 mock was tuned for; PI restores its brightness.
const LEGACY_LIGHT = Math.PI
const DAY_SKY = '#cde0e1'

export type Spot = Point & { face: number; out?: Point }

// `out` is the waypoint that walks a bot around the desk.
export const STATIONS: Record<IslandStation, Spot> = {
  desk: { x: -2.3, z: -0.05, face: Math.PI, out: { x: -1.25, z: 0.15 } },
  shelf: { x: -0.8, z: -2.25, face: Math.PI },
  board: { x: 0.9, z: -2.3, face: Math.PI },
  tower: { x: 1.55, z: -1.35, face: 0.5 },
  dock: { x: 2.4, z: -0.35, face: Math.PI / 2 },
  mail: { x: 2.25, z: 1.4, face: Math.PI / 2 },
  window: { x: 0, z: 2.1, face: 0 },
  bench: { x: -2.5, z: 1.45, face: 0 }
}

export type IslandWorld = {
  applyTheme: () => void
  tick: (dt: number, t: number, deskTyping: boolean) => void
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const cyl = (top: number, bottom: number, h: number, segments: number) =>
  new THREE.CylinderGeometry(top, bottom, h, segments)
const cone = (r: number, h: number, segments: number) => new THREE.ConeGeometry(r, h, segments)

// Reads the mock's coordinate tables, written flat, as rows of `size` numbers.
function rows(flat: number[], size: number): number[][] {
  return Array.from({ length: flat.length / size }, (_, i) => flat.slice(i * size, (i + 1) * size))
}

function group(scene: Scene, x: number, z: number): Object3D {
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  scene.add(g)
  return g
}

function buildGround(scene: Scene): Object3D[] {
  addMesh(scene, cyl(4.3, 4.15, 0.5, 11), mat(0x86a872), 0, -0.25, 0)
  addMesh(scene, cyl(4.15, 3.5, 0.75, 11), mat(0x8b6b4c), 0, -0.875, 0)
  addMesh(scene, cone(3.5, 3.8, 11), mat(0x6f6a64), 0, -3.15, 0).rotation.x = Math.PI
  const stones = [
    -1.2, 0.2, -0.4, 0.6, 0.4, 0.9, 0.7, 1.6, 1.2, 0.3, 0.2, -0.5, -0.4, -1.4, 1.6, 0.9
  ]
  rows(stones, 2).forEach(([x, z], i) => {
    const stone = addMesh(scene, cyl(0.22, 0.24, 0.05, 7), mat(0xcfc6b0), x, 0.02, z)
    stone.rotation.y = i
    stone.castShadow = false
  })
  for (const [x, z, s] of rows([-3.3, -1.9, 1.1, -1.4, 3.4, 0.9, 3, 2.6, 1, -3.5, 0.6, 0.8], 3)) {
    const tree = group(scene, x, z)
    addMesh(tree, cyl(0.07 * s, 0.1 * s, 0.6 * s, 6), mat(0x7a5a3c), 0, 0.3 * s, 0)
    addMesh(tree, cone(0.55 * s, s, 7), mat(0x5c8c57), 0, 0.95 * s, 0)
    addMesh(tree, cone(0.42 * s, 0.8 * s, 7), mat(0x6a9a60), 0, 1.4 * s, 0)
  }
  const floaters = rows([5.4, -1.8, 1.4, 0.45, -5.6, -2.6, -0.8, 0.6, 4.2, -3.4, -3.6, 0.35], 4)
  return floaters.map(([x, y, z, r]) =>
    addMesh(scene, new THREE.DodecahedronGeometry(r), mat(0x6f6a64), x, y, z)
  )
}

// Terminal desk; the returned step scrolls the code on its screen.
function buildDesk(scene: Scene, wood: Material, dark: Material): () => void {
  const desk = group(scene, -2.3, -0.9)
  addMesh(desk, box(1.5, 0.08, 0.8), wood, 0, 0.75, 0)
  for (const [x, z] of rows([-0.68, -0.33, 0.68, -0.33, -0.68, 0.33, 0.68, 0.33], 2)) {
    addMesh(desk, box(0.07, 0.75, 0.07), dark, x, 0.375, z)
  }
  addMesh(desk, box(1, 0.62, 0.06), mat(0x222a2b), 0, 1.15, -0.25)
  addMesh(desk, box(0.08, 0.3, 0.08), mat(0x222a2b), 0, 0.9, -0.27)
  addMesh(desk, box(0.6, 0.03, 0.2), mat(0x3a4445), 0, 0.8, 0.1)
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 76
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('The desk screen needs a 2D canvas context.')
  }
  const texture = new THREE.CanvasTexture(canvas)
  const screenMaterial = new THREE.MeshBasicMaterial({ map: texture })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.54), screenMaterial)
  screen.position.set(0, 1.15, -0.215)
  desk.add(screen)
  const codeLine = () => [Math.floor(Math.random() * 4) * 8, 20 + Math.floor(Math.random() * 80)]
  const lines = Array.from({ length: 9 }, codeLine)
  const draw = () => {
    context.fillStyle = '#0f1516'
    context.fillRect(0, 0, 128, 76)
    lines.forEach(([indent, width], i) => {
      context.fillStyle = i % 3 === 0 ? '#cfe3e2' : '#4fb3b6'
      context.fillRect(8 + indent, 5 + i * 7.6, Math.min(width, 112 - indent), 3)
    })
    texture.needsUpdate = true
  }
  draw()
  return () => {
    lines.shift()
    lines.push(codeLine())
    draw()
  }
}

// Bookshelf, notice board and clock tower; the returned step sets the clock.
function buildBackRow(scene: Scene, dark: Material): () => void {
  const shelf = group(scene, -0.8, -3)
  addMesh(shelf, box(1.4, 1.7, 0.45), mat(0x8b6b4c), 0, 0.85, 0)
  const bookColors = [0x0b6e73, 0xc9a227, 0xa8473a, 0xeef2f1, 0x5d6f2a, 0x3d4f50]
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 6; i++) {
      const h = 0.3 + ((i * 7 + r * 3) % 4) * 0.04
      const book = mat(bookColors[(i + r * 2) % 6])
      addMesh(shelf, box(0.16, h, 0.1), book, -0.5 + i * 0.2, 0.25 + r * 0.52 + h / 2, 0.25)
    }
  }
  const board = group(scene, 0.9, -3)
  for (const x of [-0.6, 0.6]) {
    addMesh(board, box(0.08, 1.6, 0.08), dark, x, 0.8, 0)
  }
  addMesh(board, box(1.4, 0.85, 0.06), mat(0x3d4f50), 0, 1.2, 0.03)
  const notes = [-0.4, 1.35, 0xeef2f1, 0.05, 1.15, 0xe9c46a, 0.4, 1.38, 0x4fb3b6, -0.2, 1, 0xeef2f1]
  for (const [x, y, color] of rows(notes, 3)) {
    addMesh(board, box(0.26, 0.2, 0.01), mat(color), x, y, 0.07)
  }
  const tower = group(scene, 2.4, -2.3)
  addMesh(tower, box(0.9, 2.3, 0.9), mat(0xd8d2c4), 0, 1.15, 0)
  addMesh(tower, cone(0.8, 0.75, 4), mat(0x9a4f3a), 0, 2.68, 0).rotation.y = Math.PI / 4
  const dial = mat(0xfafafa, { flatShading: false })
  addMesh(tower, cyl(0.3, 0.3, 0.04, 20), dial, 0, 1.8, 0.46).rotation.x = Math.PI / 2
  const hourHand = new THREE.Group()
  const minuteHand = new THREE.Group()
  hourHand.position.set(0, 1.8, 0.49)
  minuteHand.position.set(0, 1.8, 0.495)
  tower.add(hourHand, minuteHand)
  addMesh(hourHand, box(0.035, 0.15, 0.01), mat(0x1b2324), 0, 0.075, 0)
  addMesh(minuteHand, box(0.025, 0.24, 0.01), mat(0x1b2324), 0, 0.12, 0)
  return () => {
    const now = new Date()
    const minutes = now.getMinutes() + now.getSeconds() / 60
    const hours = (now.getHours() % 12) + minutes / 60
    minuteHand.rotation.z = (-minutes / 60) * Math.PI * 2
    hourHand.rotation.z = (-hours / 12) * Math.PI * 2
  }
}

// Shipping dock (builds), mailbox (Gmail), approval counter (waiting on you) and the idle bench.
function buildFrontRow(scene: Scene, wood: Material, dark: Material): void {
  const dock = group(scene, 3.1, -0.4)
  addMesh(dock, box(0.55, 0.55, 0.55), mat(0xa77b4f), 0, 0.275, 0)
  addMesh(dock, box(0.5, 0.5, 0.5), mat(0xa77b4f), 0.05, 0.8, 0.02).rotation.y = 0.3
  addMesh(dock, box(0.42, 0.32, 0.42), mat(0x0b6e73), 0, 0.16, 0.62)
  const mailbox = group(scene, 2.9, 1.4)
  addMesh(mailbox, box(0.08, 0.9, 0.08), dark, 0, 0.45, 0)
  addMesh(mailbox, box(0.42, 0.32, 0.55), mat(0xa8473a), 0, 1.05, 0)
  addMesh(mailbox, box(0.03, 0.22, 0.08), mat(0xe9c46a), 0.23, 1.18, 0.12)
  const booth = group(scene, 0, 2.75)
  addMesh(booth, box(1.5, 0.8, 0.4), mat(0xd8d2c4), 0, 0.4, 0)
  addMesh(booth, box(1.6, 0.06, 0.5), wood, 0, 0.83, 0)
  for (const x of [-0.72, 0.72]) {
    addMesh(booth, box(0.07, 1.9, 0.07), dark, x, 0.95, -0.55)
  }
  addMesh(booth, box(1.7, 0.07, 0.95), mat(0x0b6e73), 0, 1.92, -0.3)
  const bulb = new THREE.MeshBasicMaterial({ color: 0xffe2b0 })
  addMesh(booth, new THREE.SphereGeometry(0.07, 8, 6), bulb, 0, 1.8, -0.3)
  const bench = group(scene, -2.5, 2)
  addMesh(bench, box(1.1, 0.07, 0.38), wood, 0, 0.42, 0)
  addMesh(bench, box(1.1, 0.3, 0.05), wood, 0, 0.65, -0.18)
  for (const x of [-0.45, 0.45]) {
    addMesh(bench, box(0.06, 0.42, 0.3), dark, x, 0.21, 0)
  }
}

function buildSky(scene: Scene) {
  const cloudMaterial = mat(0xffffff, { roughness: 1 })
  const clouds = Array.from({ length: 6 }, (_, i) => {
    const cloud = new THREE.Group()
    for (const [x, y, z, r] of rows([0, 0, 0, 0.7, 0.6, -0.1, 0.1, 0.5, -0.6, -0.1, 0, 0.55], 4)) {
      const puff = new THREE.IcosahedronGeometry(r, 0)
      addMesh(cloud, puff, cloudMaterial, x, y, z).castShadow = false
    }
    const s = 0.8 + (i % 3) * 0.35
    cloud.scale.set(s, s * 0.8, s)
    scene.add(cloud)
    return { cloud, a: (i / 6) * Math.PI * 2, r: 7.5 + (i % 2) * 2.5, y: -2.5 + (i % 3) * 1.6 }
  })
  const points: number[] = []
  for (let i = 0; i < 400; i++) {
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(Math.random() * 1.6 - 0.6)
    points.push(
      60 * Math.sin(ph) * Math.cos(th),
      60 * Math.cos(ph),
      60 * Math.sin(ph) * Math.sin(th)
    )
  }
  const starGeometry = new THREE.BufferGeometry()
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  const starMaterial = new THREE.PointsMaterial({ color: 0xcfe3e2, size: 0.35, fog: false })
  const stars = new THREE.Points(starGeometry, starMaterial)
  scene.add(stars)
  return { cloudMaterial, clouds, stars }
}

export function createWorld(scene: Scene): IslandWorld {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x55664f, 0.8 * LEGACY_LIGHT)
  const sun = new THREE.DirectionalLight(0xfff1dc, 0.85 * LEGACY_LIGHT)
  sun.position.set(6, 12, 7)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 })
  sun.shadow.camera.updateProjectionMatrix()
  sun.shadow.bias = -0.0008
  // Decay 1 is the r128 default the mock's lamp distances were picked for.
  const lamp = new THREE.PointLight(0xffd29a, 0, 5, 1)
  lamp.position.set(0, 1.8, 2.45)
  const screenGlow = new THREE.PointLight(0x5fe0dc, 0, 3.5, 1)
  screenGlow.position.set(-2.3, 1.2, -0.7)
  scene.add(hemi, sun, lamp, screenGlow)

  const wood = mat(0xb08a5e)
  const dark = mat(0x7a5a3c)
  const floaters = buildGround(scene)
  const scrollScreen = buildDesk(scene, wood, dark)
  const updateClock = buildBackRow(scene, dark)
  buildFrontRow(scene, wood, dark)
  const sky = buildSky(scene)
  let screenT = 0

  return {
    applyTheme: () => {
      const style = getComputedStyle(document.documentElement)
      const skyColor = style.getPropertyValue('--scene-sky').trim() || DAY_SKY
      const night = style.getPropertyValue('--scene-night').trim() === '1'
      scene.background = new THREE.Color(skyColor)
      scene.fog = new THREE.Fog(skyColor, 24, 48)
      hemi.intensity = (night ? 0.32 : 0.8) * LEGACY_LIGHT
      sun.intensity = (night ? 0.35 : 0.85) * LEGACY_LIGHT
      sun.color.setHex(night ? 0x9db4d8 : 0xfff1dc)
      lamp.intensity = (night ? 1.4 : 0) * LEGACY_LIGHT
      screenGlow.intensity = (night ? 1 : 0.25) * LEGACY_LIGHT
      sky.stars.visible = night
      sky.cloudMaterial.color.setHex(night ? 0x55636a : 0xffffff)
    },
    tick: (dt, t, deskTyping) => {
      screenT += dt
      if (deskTyping && screenT > 0.22) {
        screenT = 0
        scrollScreen()
      }
      sky.clouds.forEach((entry, i) => {
        entry.a += dt * 0.015
        const y = entry.y + Math.sin(t * 0.3 + i) * 0.15
        entry.cloud.position.set(Math.cos(entry.a) * entry.r, y, Math.sin(entry.a) * entry.r)
      })
      floaters.forEach((floater, i) => {
        floater.position.y += Math.sin(t * 0.6 + i * 2) * 0.002
        floater.rotation.y += dt * 0.1
      })
      updateClock()
    }
  }
}
