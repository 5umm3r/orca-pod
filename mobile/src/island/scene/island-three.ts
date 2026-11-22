// allowJs inference of minified three r170 drops position, rotation, etc.; type what we call.
import * as THREE_MODULE from './vendor/three.module.min.js'

export type Point = { x: number; z: number }

export type Vec3 = {
  x: number
  y: number
  z: number
  set: (x: number, y: number, z: number) => Vec3
  project: (camera: Camera) => Vec3
}

export type Color = {
  set: (value: string | number) => Color
  setHex: (hex: number) => Color
  multiplyScalar: (scalar: number) => Color
}

export type Disposable = { dispose: () => void }
export type Material = Disposable & { color: Color }

export type Object3D = {
  position: Vec3
  rotation: { x: number; y: number; z: number }
  scale: Vec3
  visible: boolean
  castShadow: boolean
  receiveShadow: boolean
  userData: Record<string, unknown>
  add: (...objects: Object3D[]) => Object3D
  remove: (...objects: Object3D[]) => Object3D
  traverse: (visit: (object: Object3D) => void) => void
}

export type Camera = Object3D & {
  aspect: number
  updateProjectionMatrix: () => void
  lookAt: (target: Vec3) => void
}

export type Light = Object3D & { intensity: number; color: Color }

export type Scene = Object3D & { background: Color | null; fog: unknown }

export type Renderer = Disposable & {
  shadowMap: { enabled: boolean; type: number }
  outputColorSpace: string
  setPixelRatio: (ratio: number) => void
  setSize: (width: number, height: number, updateStyle: boolean) => void
  render: (scene: Scene, camera: Camera) => void
}

type DirectionalLight = Light & {
  shadow: {
    mapSize: { set: (width: number, height: number) => void }
    camera: Record<'left' | 'right' | 'top' | 'bottom' | 'near' | 'far', number> & {
      updateProjectionMatrix: () => void
    }
    bias: number
  }
}

type Shape = { moveTo: (x: number, y: number) => Shape; lineTo: (x: number, y: number) => Shape }
type BufferGeometry = Disposable & { setAttribute: (name: string, attribute: unknown) => void }
type Texture = Disposable & { needsUpdate: boolean }
type Raycaster = {
  setFromCamera: (ndc: { x: number; y: number }, camera: Camera) => void
  intersectObjects: (objects: Object3D[], recursive: boolean) => { object: Object3D }[]
}
type Ctor<Args extends unknown[], Instance> = new (...args: Args) => Instance
type Params = Record<string, unknown>

type ThreeApi = {
  ColorManagement: { enabled: boolean }
  LinearSRGBColorSpace: string
  PCFSoftShadowMap: number
  DoubleSide: number
  WebGLRenderer: Ctor<[{ canvas: HTMLCanvasElement; antialias: boolean }], Renderer>
  Scene: Ctor<[], Scene>
  PerspectiveCamera: Ctor<[number, number, number, number], Camera>
  Vector3: Ctor<[], Vec3>
  Vector2: Ctor<[], { x: number; y: number; set: (x: number, y: number) => void }>
  Raycaster: Ctor<[], Raycaster>
  Color: Ctor<[string], Color>
  Fog: Ctor<[string, number, number], unknown>
  HemisphereLight: Ctor<[number, number, number], Light>
  DirectionalLight: Ctor<[number, number], DirectionalLight>
  PointLight: Ctor<[number, number, number, number], Light>
  Group: Ctor<[], Object3D>
  Mesh: Ctor<[Disposable, Material], Object3D>
  Points: Ctor<[BufferGeometry, Material], Object3D>
  MeshStandardMaterial: Ctor<[Params], Material>
  MeshBasicMaterial: Ctor<[Params], Material>
  PointsMaterial: Ctor<[Params], Material>
  BoxGeometry: Ctor<[number, number, number], Disposable>
  CylinderGeometry: Ctor<[number, number, number, number], Disposable>
  ConeGeometry: Ctor<[number, number, number], Disposable>
  SphereGeometry: Ctor<[number, number, number], Disposable>
  DodecahedronGeometry: Ctor<[number], Disposable>
  IcosahedronGeometry: Ctor<[number, number], Disposable>
  PlaneGeometry: Ctor<[number, number], Disposable>
  ShapeGeometry: Ctor<[Shape], Disposable>
  Shape: Ctor<[], Shape>
  BufferGeometry: Ctor<[], BufferGeometry>
  Float32BufferAttribute: Ctor<[number[], number], unknown>
  CanvasTexture: Ctor<[HTMLCanvasElement], Texture>
}

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: ThreeApi lists only r170 members the scene calls; the WebView smoke run covers them.
export const THREE = THREE_MODULE as unknown as ThreeApi

// The mock's flat-shaded matte material.
export function mat(color: number | string, extra?: Params): Material {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.85,
    metalness: 0,
    ...extra
  })
}

export function addMesh(
  parent: Object3D,
  geometry: Disposable,
  material: Material,
  x = 0,
  y = 0,
  z = 0
): Object3D {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}
