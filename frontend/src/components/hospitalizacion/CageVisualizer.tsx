import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

import { useTheme } from '@/lib/theme'
import { OPERATIONAL_META } from '@/lib/hospitalization'
import type {
  HospitalizationItem,
  LatestVitals,
  OccupancyAccommodation,
  OperationalStatus,
} from '@/lib/hospitalization'

const OP_COLORS: Record<OperationalStatus, number> = {
  critical: 0xb4453a,
  delicate: 0xc26e16,
  monitoring: 0x3a6ea5,
  stable: 0x2e7d5b,
}

const SPECIES_COLOR: Record<string, number> = {
  perro: 0xb07a3f,
  gato: 0x9c8a7a,
  ave: 0x3f6fae,
  conejo: 0xe0c9a6,
  roedor: 0xc9bdb0,
  reptil: 0x4f7a4f,
  equino: 0x6b4a2f,
}

const CAGE_W = 2.4
const CAGE_H = 2.4
const CAGE_D = 2.4

const ICON_SVG: Record<string, string> = {
  temp:
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/><circle cx="12" cy="18" r="1.2"/></svg>',
  heart:
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.5-10-9C.5 8 2 4 6 4c2.2 0 3.5 1.2 4.5 2.5L12 8l1.5-1.5C14.5 5.2 15.8 4 18 4c4 0 5.5 4 4 8-2.5 4.5-10 9-10 9Z"/></svg>',
  lungs:
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3c0 4-1 5-1 8v2c-2 1-4 3-4 6 0 1.5 1 2 2 2 1.5 0 3-2 3-4V8c0-2 0-5 0-5ZM15 3c0 4 1 5 1 8v2c2 1 4 3 4 6 0 1.5-1 2-2 2-1.5 0-3-2-3-4V8c0-2 0-5 0-5Z"/></svg>',
  pain:
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>',
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

function part(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, scale?: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }))
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  if (scale) m.scale.set(scale[0], scale[1], scale[2])
  return m
}

function buildAnimal(species: string): THREE.Group {
  const g = new THREE.Group()
  const color = SPECIES_COLOR[species] ?? 0x7a8a86
  const leg = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8)
  const foot = new THREE.CylinderGeometry(0.05, 0.07, 0.2, 8)

  if (species === 'ave') {
    g.add(part(new THREE.SphereGeometry(0.5, 20, 16), color, 0, 0.55, 0, 0, 0, 0, [1, 0.9, 1.1]))
    g.add(part(new THREE.SphereGeometry(0.28, 16, 12), color, 0, 0.95, 0.28))
    g.add(part(new THREE.ConeGeometry(0.09, 0.18, 8), 0xd69b3a, 0.05, 0.92, 0.52, 0, 0, Math.PI / 2))
    g.add(part(new THREE.BoxGeometry(0.5, 0.07, 0.7), color, -0.48, 0.55, 0))
    g.add(part(new THREE.BoxGeometry(0.5, 0.07, 0.7), color, 0.48, 0.55, 0))
    g.add(part(new THREE.ConeGeometry(0.12, 0.5, 8), color, 0, 0.55, -0.75, 0, 0, Math.PI / 2.6))
    g.add(part(foot, 0xd69b3a, -0.12, 0.12, 0.2))
    g.add(part(foot, 0xd69b3a, 0.12, 0.12, 0.2))
    return g
  }

  if (species === 'reptil') {
    g.add(part(new THREE.BoxGeometry(0.5, 0.35, 1.1), color, 0, 0.32, 0))
    g.add(part(new THREE.SphereGeometry(0.22, 16, 12), color, 0, 0.4, 0.62))
    g.add(part(new THREE.ConeGeometry(0.06, 0.18, 6), color, 0, 0.38, 0.8))
    g.add(part(new THREE.ConeGeometry(0.1, 0.75, 8), color, 0, 0.25, -0.8, 0, 0, Math.PI / 2))
    for (const s of [-1, 1]) {
      g.add(part(leg, color, s * 0.22, 0.12, 0.32))
      g.add(part(leg, color, s * 0.22, 0.12, -0.32))
    }
    return g
  }

  if (species === 'conejo') {
    g.add(part(new THREE.SphereGeometry(0.5, 20, 16), color, 0, 0.55, 0, 0, 0, 0, [0.9, 1, 1.1]))
    g.add(part(new THREE.SphereGeometry(0.3, 16, 12), color, 0, 0.9, 0.3))
    g.add(part(new THREE.CylinderGeometry(0.07, 0.09, 0.62, 8), color, -0.13, 1.2, 0.08, 0, 0, 0.14))
    g.add(part(new THREE.CylinderGeometry(0.07, 0.09, 0.62, 8), color, 0.13, 1.2, 0.08, 0, 0, -0.14))
    for (const s of [-1, 1]) {
      g.add(part(leg, color, s * 0.2, 0.12, 0.28))
      g.add(part(leg, color, s * 0.2, 0.12, -0.28))
    }
    g.add(part(new THREE.SphereGeometry(0.09, 10, 8), 0xf5f5f5, 0, 0.55, -0.6))
    return g
  }

  // cuadrúpedo genérico (perro, gato, roedor, equino, otro)
  const equino = species === 'equino'
  g.add(part(new THREE.SphereGeometry(0.5, 20, 16), color, 0, 0.55, 0, 0, 0, 0, equino ? [1.25, 1.05, 1.4] : [1, 0.95, 1.2]))
  const headY = equino ? 1.0 : 0.88
  if (equino) g.add(part(new THREE.CylinderGeometry(0.16, 0.22, 0.5, 8), color, 0, 0.78, 0.32, 0, 0, -0.22))
  g.add(part(new THREE.SphereGeometry(equino ? 0.32 : 0.28, 16, 12), color, 0, headY, 0.42))
  g.add(part(new THREE.ConeGeometry(0.08, 0.22, 6), color, -0.14, headY + 0.26, 0.34, 0, 0, 0.18))
  g.add(part(new THREE.ConeGeometry(0.08, 0.22, 6), color, 0.14, headY + 0.26, 0.34, 0, 0, -0.18))
  g.add(part(new THREE.SphereGeometry(0.14, 12, 10), species === 'perro' ? 0x4a3728 : color, 0, headY - 0.05, 0.6))
  for (const s of [-1, 1]) {
    g.add(part(leg, color, s * 0.26, 0.12, 0.32))
    g.add(part(leg, color, s * 0.26, 0.12, -0.32))
  }
  g.add(part(new THREE.CylinderGeometry(0.05, 0.08, 0.55, 8), color, 0, 0.62, -0.65, 0, 0, equino ? 0.1 : Math.PI / 4))
  return g
}

function makeCageFrame(frameColor: number): THREE.Group {
  const g = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a949c, metalness: 0.7, roughness: 0.35 })
  const W2 = CAGE_W / 2
  const D2 = CAGE_D / 2
  const H = CAGE_H

  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, H, 8)
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const p = new THREE.Mesh(postGeo, metal)
    p.position.set(sx * (W2 - 0.05), H / 2, sz * (D2 - 0.05))
    g.add(p)
  }

  const barGeo = new THREE.CylinderGeometry(0.035, 0.035, H, 6)
  const addSide = (fn: (t: number) => [number, number]) => {
    for (const t of [-0.5, 0.5]) {
      const [x, z] = fn(t)
      const b = new THREE.Mesh(barGeo, metal)
      b.position.set(x, H / 2, z)
      g.add(b)
    }
  }
  addSide((t) => [t * CAGE_W * 0.72, D2 - 0.02])
  addSide((t) => [t * CAGE_W * 0.72, -D2 + 0.02])
  addSide((t) => [W2 - 0.02, t * CAGE_D * 0.72])
  addSide((t) => [-W2 + 0.02, t * CAGE_D * 0.72])

  const topBar = new THREE.MeshStandardMaterial({ color: frameColor, metalness: 0.5, roughness: 0.4 })
  const addTop = (w: number, len: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, len), topBar)
    m.position.set(x, H, z)
    g.add(m)
  }
  addTop(CAGE_W + 0.12, 0.06, 0, D2 - 0.04)
  addTop(CAGE_W + 0.12, 0.06, 0, -D2 + 0.04)
  addTop(0.06, CAGE_D + 0.12, W2 - 0.04, 0)
  addTop(0.06, CAGE_D + 0.12, -W2 + 0.04, 0)
  addTop(CAGE_W - 0.3, 0.05, 0, -0.45)
  addTop(CAGE_W - 0.3, 0.05, 0, 0.45)
  return g
}

function makeClinicFloorTexture(theme: string): THREE.CanvasTexture {
  const size = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')
  if (ctx) {
    const dark = theme === 'dark'
    ctx.fillStyle = dark ? '#20281f' : '#e6e2d8'
    ctx.fillRect(0, 0, size, size)
    const t = size / 4
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        ctx.fillStyle = dark ? '#2a332a' : '#eeeadf'
        ctx.fillRect(i * t + 2, j * t + 2, t - 4, t - 4)
      }
    }
    ctx.strokeStyle = dark ? '#39443d' : '#d4cfc3'
    ctx.lineWidth = 3
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * t, 0); ctx.lineTo(i * t, size); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i * t); ctx.lineTo(size, i * t); ctx.stroke()
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(12, 12)
  tex.anisotropy = 4
  return tex
}

function buildInfoPanel(
  acc: OccupancyAccommodation,
  occupants: HospitalizationItem[],
  latestVitals: LatestVitals,
): HTMLElement {
  const occ = occupants[0]
  const wrap = document.createElement('div')
  wrap.className = 'pointer-events-none w-48 rounded-xl border border-border bg-card/95 p-2 shadow-dialog backdrop-blur-sm'

  const header = document.createElement('div')
  header.className = 'flex items-center gap-2'
  const img = document.createElement('img')
  img.className = 'size-10 rounded-full border border-border object-cover'
  img.src = occ.pet?.photo_url ?? ''
  img.alt = ''
  const meta = document.createElement('div')
  meta.className = 'min-w-0'
  meta.innerHTML = `<p class="truncate text-xs font-semibold">${escapeHtml(occ.pet?.name ?? 'Paciente')}</p><p class="text-[10px] text-muted-foreground">${escapeHtml(acc.code)} · ${escapeHtml(acc.name)}</p>`
  header.appendChild(img)
  header.appendChild(meta)
  wrap.appendChild(header)

  const vitals = latestVitals?.[occ.id] ?? {}
  const inds: { key: string; label: string; val: string; color: string }[] = []
  const t = vitals.temperature
  if (t && t.value != null) inds.push({ key: 'temp', label: 'Temperatura', val: `${t.value}°`, color: 'text-warning' })
  const h = vitals.heart_rate
  if (h && h.value != null) inds.push({ key: 'heart', label: 'Frec. cardíaca', val: `${h.value}`, color: 'text-destructive' })
  const r = vitals.respiratory_rate
  if (r && r.value != null) inds.push({ key: 'lungs', label: 'Frec. respiratoria', val: `${r.value}`, color: 'text-info' })
  const p = vitals.pain
  if (p && p.value != null) inds.push({ key: 'pain', label: 'Dolor', val: `${p.value}/10`, color: 'text-primary' })

  if (inds.length) {
    const row = document.createElement('div')
    row.className = 'mt-1.5 flex flex-wrap items-center gap-1.5'
    for (const i of inds) {
      const pill = document.createElement('span')
      pill.className = `inline-flex items-center gap-1 rounded-md bg-muted/40 px-1.5 py-0.5 ${i.color}`
      pill.title = i.label
      pill.innerHTML = ICON_SVG[i.key] + `<span class="text-[10px] font-medium">${escapeHtml(i.val)}</span>`
      row.appendChild(pill)
    }
    wrap.appendChild(row)
  }

  const op = OPERATIONAL_META[occ.operational_status]
  const status = document.createElement('p')
  status.className = 'mt-1 flex items-center gap-1 text-[10px] text-muted-foreground'
  status.innerHTML = `<span class="size-1.5 rounded-full" style="background:#${OP_COLORS[occ.operational_status].toString(16).padStart(6, '0')}"></span>${escapeHtml(op?.label ?? '')}`
  wrap.appendChild(status)
  return wrap
}

export function CageVisualizer({
  accommodations,
  hospitalizations,
  latestVitals,
  height = 460,
}: {
  accommodations: OccupancyAccommodation[]
  hospitalizations: HospitalizationItem[]
  latestVitals?: LatestVitals
  height?: number
}) {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster())
  const cageGroupsRef = useRef<Map<string, { group: THREE.Group; hits: THREE.Object3D[] }>>(new Map())
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const hoveredRef = useRef<string | null>(null)

  const byAcc = useMemo(() => {
    const map = new Map<string, HospitalizationItem[]>()
    for (const h of hospitalizations) {
      if (h.accommodation_id) {
        const list = map.get(h.accommodation_id) ?? []
        list.push(h)
        map.set(h.accommodation_id, list)
      }
    }
    return map
  }, [hospitalizations])

  const textColor = theme === 'dark' ? '#e5e7eb' : '#111827'
  const frameColor = theme === 'dark' ? 0x9aa6a0 : 0x5c6763
  const bgColor = theme === 'dark' ? 0x121816 : 0xf3f1ea

  // Escena (una sola vez)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(bgColor)
    scene.fog = new THREE.Fog(bgColor, 28, 60)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 200)
    camera.position.set(8, 11, 15)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const labelRenderer = new CSS2DRenderer()
    labelRenderer.setSize(container.clientWidth, container.clientHeight)
    labelRenderer.domElement.style.position = 'absolute'
    labelRenderer.domElement.style.top = '0'
    labelRenderer.domElement.style.left = '0'
    labelRenderer.domElement.style.pointerEvents = 'none'
    container.appendChild(labelRenderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.85))
    const dir = new THREE.DirectionalLight(0xffffff, 1.3)
    dir.position.set(8, 14, 8)
    scene.add(dir)
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.4)
    dir2.position.set(-6, 6, -6)
    scene.add(dir2)

    // Piso tipo clínica
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 32),
      new THREE.MeshStandardMaterial({ map: makeClinicFloorTexture(theme), roughness: 0.9 }),
    )
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1.3, 0)
    controls.enablePan = false
    controls.minDistance = 7
    controls.maxDistance = 32
    controls.maxPolarAngle = Math.PI / 2.05
    controls.update()

    const tooltip = document.createElement('div')
    tooltip.style.position = 'absolute'
    tooltip.style.transform = 'translate(-50%, -100%)'
    tooltip.style.marginTop = '-8px'
    tooltip.style.pointerEvents = 'none'
    tooltip.style.zIndex = '20'
    tooltip.style.display = 'none'
    tooltipRef.current = tooltip
    container.appendChild(tooltip)

    const resize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      labelRenderer.setSize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    const onMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), camera)
      const targets: THREE.Object3D[] = []
      cageGroupsRef.current.forEach(({ hits }) => targets.push(...hits))
      const intersect = raycasterRef.current.intersectObjects(targets, false)[0]

      let accId: string | null = null
      if (intersect) {
        let obj: THREE.Object3D | null = intersect.object
        while (obj) {
          for (const [id, { group }] of cageGroupsRef.current) {
            if (group === obj) {
              accId = id
              break
            }
          }
          if (accId) break
          obj = obj.parent
        }
      }

      if (accId !== hoveredRef.current) {
        hoveredRef.current = accId
        const tp = tooltipRef.current
        if (tp) {
          const acc = accommodations.find((a) => a.id === accId)
          const occupants = accId ? byAcc.get(accId) ?? [] : []
          if (acc && occupants.length === 0) {
            tp.innerHTML = ''
            const card = document.createElement('div')
            card.className = 'w-44 rounded-xl border border-border bg-card p-2.5 shadow-dialog'
            card.innerHTML = `<p class="text-sm font-semibold">${escapeHtml(acc.code)} · ${escapeHtml(acc.name)}</p><p class="mt-0.5 text-xs capitalize text-muted-foreground">${escapeHtml(acc.type)} · ${acc.active_count}/${acc.capacity} · ${escapeHtml(acc.status)}${acc.max_isolation !== 'normal' ? ' · ' + escapeHtml(acc.max_isolation) : ''}</p>`
            tp.appendChild(card)
            tp.style.display = 'block'
            renderer.domElement.style.cursor = 'default'
          } else {
            tp.style.display = 'none'
            renderer.domElement.style.cursor = occupants.length > 0 ? 'pointer' : 'default'
          }
        }
      }

      const tp = tooltipRef.current
      if (tp && tp.style.display !== 'none' && accId) {
        const entry = cageGroupsRef.current.get(accId)
        if (entry) {
          const top = new THREE.Vector3(0, CAGE_H + 0.8, 0).applyMatrix4(entry.group.matrixWorld)
          top.project(camera)
          tp.style.left = `${((top.x * 0.5 + 0.5) * renderer.domElement.clientWidth).toFixed(0)}px`
          tp.style.top = `${((-top.y * 0.5 + 0.5) * renderer.domElement.clientHeight).toFixed(0)}px`
        }
      }
    }
    const onClick = () => {
      const occupants = hoveredRef.current ? byAcc.get(hoveredRef.current) ?? [] : []
      if (occupants.length > 0) navigate(`/hospitalizacion/${occupants[0].id}`)
    }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('click', onClick)

    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
      labelRenderer.render(scene, camera)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.remove()
      labelRenderer.domElement.remove()
      controls.dispose()
      renderer.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  // (Re)construye jaulas
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    cageGroupsRef.current.forEach(({ group }) => {
      scene.remove(group)
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else if (mat) mat.dispose()
      })
    })
    cageGroupsRef.current.clear()

    const n = accommodations.length
    if (n === 0) return
    const cols = Math.min(5, Math.max(1, n))
    const spacingX = 3.7
    const spacingZ = 3.7

    accommodations.forEach((acc, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = (col - (cols - 1) / 2) * spacingX
      const z = row * spacingZ - ((Math.ceil(n / cols) - 1) / 2) * spacingZ

      const group = new THREE.Group()
      group.position.set(x, 0, z)
      const hits: THREE.Object3D[] = []

      const baseColor =
        acc.status === 'maintenance' || acc.status === 'unavailable'
          ? 0xc26e16
          : acc.occupied
            ? 0xb4453a
            : 0x2e7d5b
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(CAGE_W + 0.34, 0.12, CAGE_D + 0.34),
        new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.5 }),
      )
      base.position.y = 0.06
      group.add(base)

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(CAGE_W, CAGE_H, CAGE_D),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.04, depthWrite: false }),
      )
      body.position.y = CAGE_H / 2
      group.add(body)
      hits.push(body)

      const frame = makeCageFrame(frameColor)
      group.add(frame)
      frame.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) hits.push(obj)
      })

      const isolationBad = acc.max_isolation === 'isolation' || acc.max_isolation === 'precaution'
      if (isolationBad) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(CAGE_W / 2 + 0.22, 0.06, 8, 32),
          new THREE.MeshStandardMaterial({ color: 0xb4453a }),
        )
        ring.rotation.x = -Math.PI / 2
        ring.position.y = 0.02
        group.add(ring)
      }

      const occupants = byAcc.get(acc.id) ?? []

      if (occupants.length > 0) {
        const animal = buildAnimal(occupants[0].pet?.species ?? 'otro')
        group.add(animal)
        animal.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) hits.push(obj)
        })

        const panel = new CSS2DObject(buildInfoPanel(acc, occupants, latestVitals ?? {}))
        panel.position.set(0, CAGE_H + 1.15, 0)
        group.add(panel)
      } else {
        const labelDiv = document.createElement('div')
        labelDiv.textContent = acc.code
        labelDiv.className = 'select-none whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-bold shadow-sm backdrop-blur-sm'
        labelDiv.style.color = textColor
        labelDiv.style.background = theme === 'dark' ? 'rgba(18,24,22,0.7)' : 'rgba(255,255,255,0.7)'
        const labelObj = new CSS2DObject(labelDiv)
        labelObj.position.set(0, CAGE_H + 0.9, 0)
        group.add(labelObj)
      }

      scene.add(group)
      cageGroupsRef.current.set(acc.id, { group, hits })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accommodations, byAcc, latestVitals, textColor, frameColor, theme])

  useEffect(() => {
    return () => {
      document.body.style.cursor = 'default'
    }
  }, [])

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card" style={{ height }}>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute bottom-2 left-3 z-10 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-success" /> Libre</span>
        <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-destructive" /> Ocupado</span>
        <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-warning" /> Mantenimiento</span>
        <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-info" /> Paciente</span>
      </div>
      <p className="pointer-events-none absolute bottom-2 right-3 z-10 text-[11px] text-muted-foreground">
        Arrastra para rotar · rueda para zoom
      </p>
    </div>
  )
}
