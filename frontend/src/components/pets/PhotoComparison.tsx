import { useRef, useState } from 'react'

import { cn } from '@/lib/utils'

export function PhotoComparison({
  before,
  after,
  beforeLabel = 'Antes',
  afterLabel = 'Después',
  className,
}: {
  before: string
  after: string
  beforeLabel?: string
  afterLabel?: string
  className?: string
}) {
  const [pos, setPos] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const update = (clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setPos(Math.min(100, Math.max(0, pct)))
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative aspect-square w-full max-w-sm select-none overflow-hidden rounded-xl border border-border',
        className,
      )}
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        update(e.clientX)
      }}
      onPointerMove={(e) => dragging.current && update(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerLeave={() => (dragging.current = false)}
    >
      {/* Después (base) */}
      <img
        src={after}
        alt={afterLabel}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />

      {/* Antes (recortado por el divisor) */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img
          src={before}
          alt={beforeLabel}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      </div>

      {/* Divisor */}
      <div className="absolute inset-y-0 z-10 w-0.5 bg-white shadow" style={{ left: `${pos}%` }}>
        <div className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-xs text-foreground shadow-elevated">
          ◂▸
        </div>
      </div>

      {/* Etiquetas */}
      <span className="absolute left-2 top-2 rounded-md bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
        {beforeLabel}
      </span>
      <span className="absolute right-2 top-2 rounded-md bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
        {afterLabel}
      </span>
    </div>
  )
}
