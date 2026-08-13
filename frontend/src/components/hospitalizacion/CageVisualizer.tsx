import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

import { useTheme } from '@/lib/theme'
import { OPERATIONAL_META } from '@/lib/hospitalization'
import type {
  HospitalizationItem,
  OccupancyAccommodation,
  OperationalStatus,
} from '@/lib/hospitalization'

const OP_COLORS: Record<OperationalStatus, number> = {
  critical: 0xb4453a,
  delicate: 0xc26e16,
  monitoring: 0x3a6ea5,
  stable: 0x2e7d5b,
}

const CAGE_W = 2.2
const CAGE_H = 2.2
const CAGE_D = 2.2

export function CageVisualizer({
  accommodations,
  hospitalizations,
  height = 420,
}: {
  accommodations: OccupancyAccommodation[]
  hospitalizations: HospitalizationItem[]
  height?: number
}) {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
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
  const frameColor = theme === 'dark' ? '#9aa6a0' : '#5c6763'

  // Inicializa la escena una sola vez.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(theme === 'dark' ? 0x121816 : 0xfaf9f6)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 200)
    camera.position.set(8, 10, 14)
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(8, 12, 6)
    scene.add(dir)

    const grid = new THREE.GridHelper(24, 24, theme === 'dark' ? 0x37413b : 0xd4cfc3, theme === 'dark' ? 0x2b342f : 0xe7e3da)
    grid.position.y = 0.01
    scene.add(grid)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1.2, 0)
    controls.enablePan = false
    controls.minDistance = 6
    controls.maxDistance = 30
    controls.maxPolarAngle = Math.PI / 2.1
    controls.update()
    controlsRef.current = controls

    // Tooltip (DOM) flotante
    const tooltip = document.createElement('div')
    tooltip.style.position = 'absolute'
    tooltip.style.transform = 'translate(-50%, -100%)'
    tooltip.style.marginTop = '-10px'
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

    const pointer = new THREE.Vector2()
    const onMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }
    renderer.domElement.addEventListener('pointermove', onMove)

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
      renderer.domElement.remove()
      labelRenderer.domElement.remove()
      controls.dispose()
      renderer.dispose()
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else if (mat) mat.dispose()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  // (Re)construye las jaulas cuando cambian los datos.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    // limpiar grupos previos
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
    const spacingX = 3.6
    const spacingZ = 3.6

    accommodations.forEach((acc, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = (col - (cols - 1) / 2) * spacingX
      const z = row * spacingZ - ((Math.ceil(n / cols) - 1) / 2) * spacingZ

      const group = new THREE.Group()
      group.position.set(x, 0, z)
      const hits: THREE.Object3D[] = []

      // Base
      const baseColor =
        acc.status === 'maintenance' || acc.status === 'unavailable'
          ? 0xc26e16
          : acc.occupied
            ? 0xb4453a
            : 0x2e7d5b
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(CAGE_W + 0.3, 0.12, CAGE_D + 0.3),
        new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.5 }),
      )
      base.position.y = 0.06
      group.add(base)

      // Cuerpo (vidrio + marco)
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(CAGE_W, CAGE_H, CAGE_D),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.07, roughness: 0.2 }),
      )
      body.position.y = 1.1
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(body.geometry),
        new THREE.LineBasicMaterial({ color: new THREE.Color(frameColor) }),
      )
      edges.position.copy(body.position)
      group.add(body)
      group.add(edges)
      hits.push(body, edges)

      // Aro de aislamiento
      const isolationBad = acc.max_isolation === 'isolation' || acc.max_isolation === 'precaution'
      if (isolationBad) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(CAGE_W / 2 + 0.15, 0.06, 8, 32),
          new THREE.MeshStandardMaterial({ color: 0xb4453a }),
        )
        ring.rotation.x = -Math.PI / 2
        ring.position.y = 0.02
        group.add(ring)
      }

      // Ocupantes
      const occupants = byAcc.get(acc.id) ?? []
      occupants.forEach((h, idx) => {
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.38, 24, 24),
          new THREE.MeshStandardMaterial({ color: OP_COLORS[h.operational_status], roughness: 0.4 }),
        )
        sphere.position.set(idx === 0 ? 0 : 0.7, 0.9, idx === 0 ? 0 : -0.7)
        group.add(sphere)
        hits.push(sphere)
      })

      // Etiqueta del código (CSS2D)
      const labelDiv = document.createElement('div')
      labelDiv.textContent = acc.code
      labelDiv.className =
        'select-none whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-bold shadow-sm backdrop-blur-sm'
      labelDiv.style.color = textColor
      labelDiv.style.background = theme === 'dark' ? 'rgba(18,24,22,0.65)' : 'rgba(255,255,255,0.7)'
      const labelObj = new CSS2DObject(labelDiv)
      labelObj.position.set(0, 2.7, 0)
      group.add(labelObj)

      scene.add(group)
      cageGroupsRef.current.set(acc.id, { group, hits })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accommodations, byAcc, textColor, frameColor, theme])

  // Pointer: hover + raycast (se añade a la escena)
  useEffect(() => {
    const rendererDom = containerRef.current?.querySelector('canvas')
    if (!rendererDom) return
    const scene = sceneRef.current
    const camera = cameraRef.current
    if (!scene || !camera) return

    const pointer = new THREE.Vector2()
    const onMove = (e: PointerEvent) => {
      const rect = rendererDom.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycasterRef.current.setFromCamera(pointer, camera)
      const targets: THREE.Object3D[] = []
      cageGroupsRef.current.forEach(({ hits }) => targets.push(...hits))
      const intersects = raycasterRef.current.intersectObjects(targets, false)
      const hit = intersects[0]

      let accId: string | null = null
      if (hit) {
        // encontrar el grupo al que pertenece
        for (const [id, { group }] of cageGroupsRef.current) {
          if (group === hit.object.parent) {
            accId = id
            break
          }
        }
        // buscar en ancestros por si el hit es un hijo anidado
        if (!accId) {
          let obj: THREE.Object3D | null = hit.object
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
      }

      if (accId !== hoveredRef.current) {
        hoveredRef.current = accId
        const tooltip = tooltipRef.current
        if (tooltip) {
          if (accId) {
            const acc = accommodations.find((a) => a.id === accId)
            const occupants = byAcc.get(accId) ?? []
            if (acc) {
              tooltip.innerHTML = ''
              const card = document.createElement('div')
              card.className =
                'pointer-events-none w-52 rounded-xl border border-border bg-card p-3 shadow-dialog'
              const head = document.createElement('div')
              head.className = 'flex items-center justify-between gap-2'
              head.innerHTML = `<p class="text-sm font-semibold">${acc.code} · ${acc.name}</p><span class="text-xs capitalize text-muted-foreground">${acc.type}</span>`
              const meta = document.createElement('p')
              meta.className = 'mt-1 text-xs text-muted-foreground'
              meta.textContent = `${acc.active_count}/${acc.capacity} ocupados · ${acc.status}${
                acc.max_isolation !== 'normal' ? ` · ${acc.max_isolation}` : ''
              }`
              card.appendChild(head)
              card.appendChild(meta)
              if (occupants.length > 0) {
                const list = document.createElement('div')
                list.className = 'mt-2 space-y-1'
                occupants.forEach((h) => {
                  const row = document.createElement('div')
                  row.className = 'flex items-center justify-between gap-2 text-xs'
                  const name = document.createElement('span')
                  name.className = 'font-medium'
                  name.textContent = h.pet?.name ?? 'Paciente'
                  const st = document.createElement('span')
                  st.className = 'inline-flex items-center gap-1'
                  const dot = document.createElement('span')
                  dot.className = 'size-2 rounded-full'
                  dot.style.background = `#${OP_COLORS[h.operational_status].toString(16).padStart(6, '0')}`
                  const stLabel = document.createElement('span')
                  stLabel.textContent = OPERATIONAL_META[h.operational_status]?.label ?? ''
                  st.appendChild(dot)
                  st.appendChild(stLabel)
                  row.appendChild(name)
                  row.appendChild(st)
                  list.appendChild(row)
                })
                card.appendChild(list)
                const hint = document.createElement('p')
                hint.className = 'mt-2 text-[11px] text-primary'
                hint.textContent = 'Clic para abrir el paciente'
                card.appendChild(hint)
                tooltip.appendChild(card)
              }
              tooltip.style.display = 'block'
              rendererDom.style.cursor = occupants.length > 0 ? 'pointer' : 'default'
            }
          } else {
            tooltip.style.display = 'none'
            rendererDom.style.cursor = 'default'
          }
        }
      }

      // posicionar el tooltip sobre la jaula
      const tooltip = tooltipRef.current
      if (tooltip && tooltip.style.display !== 'none' && accId) {
        const { group } = cageGroupsRef.current.get(accId) ?? { group: null }
        if (group) {
          const top = new THREE.Vector3(0, 2.2, 0).applyMatrix4(group.matrixWorld)
          top.project(camera)
          const x = (top.x * 0.5 + 0.5) * rendererDom.clientWidth
          const y = (-top.y * 0.5 + 0.5) * rendererDom.clientHeight
          tooltip.style.left = `${x}px`
          tooltip.style.top = `${y}px`
        }
      }
    }
    const onClick = () => {
      if (hoveredRef.current) {
        const occupants = byAcc.get(hoveredRef.current) ?? []
        if (occupants.length > 0) navigate(`/hospitalizacion/${occupants[0].id}`)
      }
    }
    rendererDom.addEventListener('pointermove', onMove)
    rendererDom.addEventListener('click', onClick)
    return () => {
      rendererDom.removeEventListener('pointermove', onMove)
      rendererDom.removeEventListener('click', onClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accommodations, byAcc, navigate, theme])

  // Cursor por defecto mientras no hay hover
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
