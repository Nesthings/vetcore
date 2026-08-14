import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  HeartPulse,
  PawPrint,
  ShieldAlert,
  Thermometer,
  Wind,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { OPERATIONAL_META } from '@/lib/hospitalization'
import type {
  HospitalizationItem,
  LatestVitals,
  OccupancyAccommodation,
  OperationalStatus,
} from '@/lib/hospitalization'
import { cn } from '@/lib/utils'

const OP_DOT: Record<OperationalStatus, string> = {
  critical: 'bg-destructive',
  delicate: 'bg-warning',
  monitoring: 'bg-info',
  stable: 'bg-success',
}

export function CageVisualizer({
  accommodations,
  hospitalizations,
  latestVitals,
}: {
  accommodations: OccupancyAccommodation[]
  hospitalizations: HospitalizationItem[]
  latestVitals?: LatestVitals
}) {
  const navigate = useNavigate()

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

  if (accommodations.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {accommodations.map((acc) => {
          const occupants = byAcc.get(acc.id) ?? []
          const occupied = occupants.length > 0
          const busy = acc.status === 'maintenance' || acc.status === 'unavailable'
          return (
            <CageCard
              key={acc.id}
              acc={acc}
              occupants={occupants}
              occupied={occupied}
              busy={busy}
              latestVitals={latestVitals ?? {}}
              onOpen={() => occupied && navigate(`/hospitalizacion/${occupants[0].id}`)}
            />
          )
        })}
      </div>
    </div>
  )
}

function CageCard({
  acc,
  occupants,
  occupied,
  busy,
  latestVitals,
  onOpen,
}: {
  acc: OccupancyAccommodation
  occupants: HospitalizationItem[]
  occupied: boolean
  busy: boolean
  latestVitals: LatestVitals
  onOpen: () => void
}) {
  const occ = occupants[0]
  const photoUrl = occ?.pet?.photo_url && !occ.pet.photo_url.startsWith('/media/') ? occ.pet.photo_url : null

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!occupied}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border-2 bg-card text-left shadow-card transition-all',
        occupied
          ? 'cursor-pointer border-destructive/40 hover:border-primary hover:shadow-elevated'
          : busy
            ? 'border-warning/40 opacity-70'
            : 'border-success/30',
      )}
    >
      {/* Rejilla superior tipo jaula */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-3 opacity-60"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 10px)',
          color: occupied ? 'var(--destructive)' : 'var(--success)',
        }}
        aria-hidden="true"
      />

      {/* Cabecera */}
      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-sm font-bold tracking-tight">{acc.code}</span>
          <span className="truncate text-xs text-muted-foreground">{acc.name}</span>
        </div>
        <span
          className={cn('size-2.5 shrink-0 rounded-full', occupied ? 'bg-destructive' : busy ? 'bg-warning' : 'bg-success')}
          aria-hidden="true"
        />
      </div>

      {/* Cuerpo de la jaula */}
      <div className="px-3 pb-3">
        <div className="relative flex flex-col items-center gap-2 rounded-xl border border-border/70 bg-secondary/30 px-2 py-3">
          {/* Foto */}
          <div className="relative">
            <div
              className={cn(
                'flex size-20 items-center justify-center overflow-hidden rounded-full border-2 bg-card',
                occupied ? 'border-primary/50' : 'border-border',
              )}
            >
              {photoUrl ? (
                <img src={photoUrl} alt={occ.pet?.name ?? ''} className="size-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-primary/70">
                  {(occ?.pet?.name ?? '?').trim().charAt(0).toUpperCase() || <PawPrint className="size-7" />}
                </span>
              )}
            </div>
            {acc.max_isolation !== 'normal' && (
              <span
                className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-destructive text-card"
                title={`Aislamiento: ${acc.max_isolation}`}
              >
                <ShieldAlert className="size-3.5" />
              </span>
            )}
          </div>

          {/* Nombre + estado */}
          {occupied && occ?.pet ? (
            <>
              <div className="min-w-0 text-center">
                <p className="truncate text-sm font-semibold">{occ.pet.name}</p>
                <p className="text-[11px] capitalize text-muted-foreground">
                  {occ.pet.species}
                  {occ.pet.breed ? ` · ${occ.pet.breed}` : ''}
                </p>
              </div>
              <Badge
                variant={OPERATIONAL_META[occ.operational_status]?.badge}
                className="gap-1"
              >
                <span className={cn('size-1.5 rounded-full', OP_DOT[occ.operational_status])} />
                {OPERATIONAL_META[occ.operational_status]?.label}
              </Badge>
            </>
          ) : (
            <div className="py-2 text-center">
              <p className="text-xs text-muted-foreground">
                {busy ? 'Mantenimiento' : 'Disponible'}
              </p>
              <p className="text-[11px] capitalize text-muted-foreground/70">
                {acc.type} · {acc.active_count}/{acc.capacity}
              </p>
            </div>
          )}
        </div>

        {/* Indicadores de salud */}
        {occupied && occ && (
          <Indicators vitals={latestVitals[occ.id] ?? {}} />
        )}
      </div>
    </button>
  )
}

function Indicators({
  vitals,
}: {
  vitals: Record<string, { value: number | null; unit: string | null; observed_at: string }>
}) {
  const items: { icon: React.ReactNode; label: string; text: string; color: string }[] = []
  const t = vitals.temperature
  if (t && t.value != null) items.push({ icon: <Thermometer className="size-3.5" />, label: 'Temperatura', text: `${t.value}°`, color: 'text-warning' })
  const h = vitals.heart_rate
  if (h && h.value != null) items.push({ icon: <HeartPulse className="size-3.5" />, label: 'Frec. cardíaca', text: `${h.value}`, color: 'text-destructive' })
  const r = vitals.respiratory_rate
  if (r && r.value != null) items.push({ icon: <Wind className="size-3.5" />, label: 'Frec. respiratoria', text: `${r.value}`, color: 'text-info' })
  const p = vitals.pain
  if (p && p.value != null) items.push({ icon: <Activity className="size-3.5" />, label: 'Dolor', text: `${p.value}/10`, color: 'text-primary' })

  if (items.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
      {items.map((it) => (
        <span
          key={it.label}
          title={it.label}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-1',
            it.color,
          )}
        >
          {it.icon}
          <span className="text-[11px] font-semibold">{it.text}</span>
        </span>
      ))}
    </div>
  )
}
