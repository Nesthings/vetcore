import { Check, X } from 'lucide-react'

interface Dose {
  id: string
  status: string
}

interface DoseStampsVaccine {
  doses: Dose[]
  steps: { label: string; offset_days: number }[]
  applications: unknown[]
}

function Stamp({ state, num }: { state: 'done' | 'pending' | 'skipped'; num: number }) {
  if (state === 'done')
    return (
      <span
        title="Dosis aplicada"
        className="flex size-8 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground"
      >
        <Check className="size-4" aria-hidden="true" />
      </span>
    )
  if (state === 'skipped')
    return (
      <span
        title="Dosis omitida"
        className="flex size-8 items-center justify-center rounded-full border-2 border-warning bg-warning/10 text-warning"
      >
        <X className="size-4" aria-hidden="true" />
      </span>
    )
  return (
    <span
      title="Dosis pendiente"
      className="flex size-8 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/60 text-xs font-bold text-muted-foreground"
    >
      {num}
    </span>
  )
}

/** Sellos de dosis: reflejan las dosis reales de la mascota (si tiene el plan
 * asignado) o los pasos del esquema estándar con las aplicaciones registradas. */
export function DoseStamps({ vaccine }: { vaccine: DoseStampsVaccine }) {
  if (vaccine.doses.length > 0) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {vaccine.doses.map((d, i) => (
          <Stamp
            key={d.id}
            num={i + 1}
            state={d.status === 'completed' ? 'done' : d.status === 'skipped' ? 'skipped' : 'pending'}
          />
        ))}
      </div>
    )
  }
  const total = vaccine.steps.length
  const applied = vaccine.applications.length
  const count = Math.max(total, applied)
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <Stamp key={i} num={i + 1} state={i < applied ? 'done' : 'pending'} />
      ))}
    </div>
  )
}
