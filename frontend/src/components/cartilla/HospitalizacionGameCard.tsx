import { BedDouble, HeartPulse, Stethoscope } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Vital {
  value: number | null
  unit?: string | null
  observed_at?: string | null
}

export interface HospitalizationShare {
  status?: string | null
  monitoring_level?: string | null
  operational_status?: string | null
  isolation_status?: string | null
  diagnosis?: string | null
  reason?: string | null
  admitted_at?: string | null
  expected_discharge_at?: string | null
  accommodation?: { code?: string | null; name?: string | null; type?: string | null } | null
  vitals?: Record<string, Vital> | null
  last_vet?: { name?: string | null; photo_url?: string | null; seen_at?: string | null } | null
}

const OP_STATUS: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'info' | 'destructive'; bar: string; msg: string }
> = {
  stable: {
    label: 'Estable',
    variant: 'success',
    bar: 'bg-success',
    msg: 'El paciente se encuentra estable y evolucionando bien.',
  },
  monitoring: {
    label: 'En observación',
    variant: 'info',
    bar: 'bg-info',
    msg: 'El paciente está en observación, sus signos se vigilan de cerca.',
  },
  delicate: {
    label: 'Delicado',
    variant: 'warning',
    bar: 'bg-warning',
    msg: 'El paciente está delicado; requiere monitoreo constante.',
  },
  critical: {
    label: 'Crítico',
    variant: 'destructive',
    bar: 'bg-destructive',
    msg: 'El paciente está en estado crítico, bajo atención intensiva.',
  },
}

const MONITORING: Record<string, string> = {
  basic: 'Básico',
  intermediate: 'Intermedio',
  intensive: 'Intensivo',
}

const VITAL_DEFS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'temperature', label: 'Temperatura', min: 35, max: 42 },
  { key: 'heart_rate', label: 'Frec. cardiaca', min: 60, max: 220 },
  { key: 'respiratory_rate', label: 'Frec. respiratoria', min: 10, max: 60 },
  { key: 'spo2', label: 'SpO2', min: 70, max: 100 },
  { key: 'blood_pressure', label: 'Presión arterial', min: 90, max: 200 },
  { key: 'weight', label: 'Peso', min: 0, max: 50 },
  { key: 'glucose', label: 'Glucosa', min: 50, max: 250 },
  { key: 'pain', label: 'Dolor', min: 0, max: 10 },
]

function pct(v: number, min: number, max: number) {
  return Math.max(4, Math.min(100, ((v - min) / (max - min)) * 100))
}

function fmt(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

export function HospitalizacionGameCard({
  h,
  petName,
  petPhoto,
}: {
  h: HospitalizationShare
  petName: string
  petPhoto?: string | null
}) {
  const op = OP_STATUS[h.operational_status ?? ''] ?? OP_STATUS.stable
  const vitalRows = (Object.keys(h.vitals ?? {}) as string[])
    .filter((k) => VITAL_DEFS.some((d) => d.key === k))
    .map((k) => ({
      def: VITAL_DEFS.find((d) => d.key === k)!,
      v: h.vitals![k],
    }))

  const admitted = h.admitted_at ? new Date(h.admitted_at) : null
  const expected = h.expected_discharge_at ? new Date(h.expected_discharge_at) : null

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <BedDouble className="size-4 text-primary" aria-hidden="true" />
          En hospitalización
        </p>
        <div className="flex items-center gap-1.5">
          {h.accommodation?.code && (
            <Badge variant="secondary">{h.accommodation.code}</Badge>
          )}
          {h.accommodation?.name && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {h.accommodation.name}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Jaula / mascota */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-secondary/20 p-5">
          <div className="flex size-28 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {petPhoto ? (
              <img src={petPhoto} alt={petName} className="size-full object-cover" />
            ) : (
              <HeartPulse className="size-10 text-primary" aria-hidden="true" />
            )}
          </div>
          <p className="mt-3 text-sm font-semibold">{petName}</p>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
            {h.monitoring_level && (
              <Badge variant="outline" className="text-muted-foreground">
                Monitoreo {MONITORING[h.monitoring_level] ?? h.monitoring_level}
              </Badge>
            )}
            {h.isolation_status && h.isolation_status !== 'normal' && (
              <Badge variant="warning">Aislamiento</Badge>
            )}
          </div>
        </div>

        {/* Signos vitales */}
        <div className="space-y-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <HeartPulse className="size-3.5 text-primary" aria-hidden="true" />
            Signos vitales
          </p>
          {vitalRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin mediciones registradas.</p>
          ) : (
            vitalRows.map(({ def, v }) => {
              const val = v?.value
              const unit = v?.unit ?? ''
              return (
                <div key={def.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{def.label}</span>
                    <span className="font-semibold text-foreground">
                      {val != null ? `${fmt(val)} ${unit}`.trim() : '—'}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full', op.bar)}
                      style={{ width: val != null ? `${pct(val, def.min, def.max)}%` : '0%' }}
                    />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Estado + último veterinario */}
      <div className="space-y-2.5 border-t border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge variant={op.variant}>{op.label}</Badge>
          <p className="text-sm text-muted-foreground">{op.msg}</p>
        </div>
        {h.diagnosis && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Diagnóstico:</span> {h.diagnosis}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {admitted ? `Ingreso ${admitted.toLocaleDateString('es-MX')}` : ''}
            {expected ? ` · Alta estimada ${expected.toLocaleDateString('es-MX')}` : ''}
          </p>
          {h.last_vet?.name && (
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary">
                {h.last_vet.photo_url ? (
                  <img
                    src={h.last_vet.photo_url}
                    alt={h.last_vet.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <Stethoscope className="size-3.5 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                Último veterinario: <span className="font-medium text-foreground">{h.last_vet.name}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}