import { useCallback, useEffect, useState } from 'react'
import { Droplets, Loader2, Save, Syringe, UtensilsCrossed } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/api'
import { ELIMINATION_LABELS } from '@/lib/hospitalization'
import type { HospElimination, HospFeed, HospFluid, HospPain } from '@/lib/hospitalization'
import { cn } from '@/lib/utils'

export function CareSection({ hospitalizationId }: { hospitalizationId: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FeedsCard hospitalizationId={hospitalizationId} />
      <FluidsCard hospitalizationId={hospitalizationId} />
      <EliminationCard hospitalizationId={hospitalizationId} />
      <PainCard hospitalizationId={hospitalizationId} />
    </div>
  )
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      {children}
    </div>
  )
}

function FeedsCard({ hospitalizationId }: { hospitalizationId: string }) {
  const { toast } = useToast()
  const [items, setItems] = useState<HospFeed[]>([])
  const [diet, setDiet] = useState('')
  const [offered, setOffered] = useState('')
  const [consumed, setConsumed] = useState('')
  const [unit, setUnit] = useState('g')
  const [rejected, setRejected] = useState(false)
  const [vomited, setVomited] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await apiFetch<HospFeed[]>(`/hospitalization/${hospitalizationId}/feeds`))
    } catch {
      setItems([])
    }
  }, [hospitalizationId])

  useEffect(() => {
    load()
  }, [load])

  const submit = async () => {
    if (!diet.trim()) return
    setBusy(true)
    try {
      await apiFetch(`/hospitalization/${hospitalizationId}/feeds`, {
        method: 'POST',
        body: JSON.stringify({
          diet: diet.trim(),
          amount_offered: offered ? Number(offered) : null,
          amount_consumed: consumed ? Number(consumed) : null,
          unit: unit || null,
          rejected,
          vomited,
        }),
      })
      toast({ title: 'Alimentación registrada', variant: 'success' })
      setDiet('')
      setOffered('')
      setConsumed('')
      setRejected(false)
      setVomited(false)
      load()
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err instanceof Error ? err.message : 'Error.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard icon={<UtensilsCrossed className="size-4" />} title="Alimentación">
      <div className="space-y-2">
        <input value={diet} onChange={(e) => setDiet(e.target.value)} placeholder="Dieta (ej. croquetas renales)" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Ofrecido</Label>
            <input type="number" value={offered} onChange={(e) => setOffered(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Consumido</Label>
            <input type="number" value={consumed} onChange={(e) => setConsumed(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unidad</Label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={rejected} onChange={(e) => setRejected(e.target.checked)} /> Rechazo
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={vomited} onChange={(e) => setVomited(e.target.checked)} /> Vómito
          </label>
          <Button size="xs" variant="outline" className="ml-auto" onClick={submit} disabled={busy || !diet.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />} Guardar
          </Button>
        </div>
        {items.length > 0 && (
          <div className="space-y-1">
            {items.slice(0, 4).map((f) => {
              const pct = f.amount_offered && f.amount_offered > 0 ? Math.round(((f.amount_consumed ?? 0) / f.amount_offered) * 100) : null
              return (
                <div key={f.id} className="flex items-center justify-between rounded border border-border/60 bg-muted/30 px-2 py-1 text-xs">
                  <span className="truncate">
                    {f.diet} · {new Date(f.offered_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    {pct != null && <span className="ml-1 font-medium">{pct}% consumido</span>}
                  </span>
                  {(f.rejected || f.vomited) && <Badge variant="warning">{f.vomited ? 'Vómito' : 'Rechazo'}</Badge>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </SectionCard>
  )
}

function FluidsCard({ hospitalizationId }: { hospitalizationId: string }) {
  const { toast } = useToast()
  const [items, setItems] = useState<HospFluid[]>([])
  const [solution, setSolution] = useState('')
  const [route, setRoute] = useState('IV')
  const [rate, setRate] = useState('')
  const [volume, setVolume] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await apiFetch<HospFluid[]>(`/hospitalization/${hospitalizationId}/fluids`))
    } catch {
      setItems([])
    }
  }, [hospitalizationId])

  useEffect(() => {
    load()
  }, [load])

  const submit = async () => {
    setBusy(true)
    try {
      await apiFetch(`/hospitalization/${hospitalizationId}/fluids`, {
        method: 'POST',
        body: JSON.stringify({
          solution: solution || null,
          route: route || null,
          rate: rate ? Number(rate) : null,
          rate_unit: 'ml/h',
          volume: volume ? Number(volume) : null,
          unit: 'ml',
          started_at: new Date().toISOString(),
        }),
      })
      toast({ title: 'Fluidoterapia iniciada', variant: 'success' })
      setSolution('')
      setRate('')
      setVolume('')
      load()
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err instanceof Error ? err.message : 'Error.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const stop = async (id: string) => {
    await apiFetch(`/hospitalization/fluids/${id}/stop`, { method: 'POST' }).catch(() => undefined)
    load()
  }

  return (
    <SectionCard icon={<Droplets className="size-4" />} title="Fluidoterapia">
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Solución</Label>
            <input value={solution} onChange={(e) => setSolution(e.target.value)} placeholder="Solución" className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vía</Label>
            <select value={route} onChange={(e) => setRoute(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm">
              <option value="IV">IV</option>
              <option value="SC">SC</option>
              <option value="IO">IO</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Velocidad (ml/h)</Label>
            <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Volumen total (ml)</Label>
            <input type="number" value={volume} onChange={(e) => setVolume(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <Button size="xs" variant="outline" className="mt-4" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Syringe />} Iniciar
          </Button>
        </div>
        {items.length > 0 && (
          <div className="space-y-1">
            {items.slice(0, 4).map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded border border-border/60 bg-muted/30 px-2 py-1 text-xs">
                <span className="truncate">
                  {f.solution ?? 'Solución'} · {f.route} · {f.rate ?? '—'} ml/h{f.volume ? ` · ${f.volume} ml` : ''}
                </span>
                {f.ended_at ? (
                  <Badge variant="secondary">Terminado</Badge>
                ) : (
                  <button type="button" onClick={() => stop(f.id)} className="font-medium text-primary hover:underline">
                    Terminar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  )
}

function EliminationCard({ hospitalizationId }: { hospitalizationId: string }) {
  const { toast } = useToast()
  const [items, setItems] = useState<HospElimination[]>([])
  const [kind, setKind] = useState<'urine' | 'feces' | 'vomit'>('urine')
  const [quantity, setQuantity] = useState('')
  const [consistency, setConsistency] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await apiFetch<HospElimination[]>(`/hospitalization/${hospitalizationId}/eliminations`))
    } catch {
      setItems([])
    }
  }, [hospitalizationId])

  useEffect(() => {
    load()
  }, [load])

  const submit = async () => {
    setBusy(true)
    try {
      await apiFetch(`/hospitalization/${hospitalizationId}/eliminations`, {
        method: 'POST',
        body: JSON.stringify({ kind, present: true, quantity: quantity || null, consistency: consistency || null }),
      })
      toast({ title: 'Eliminación registrada', variant: 'success' })
      setQuantity('')
      setConsistency('')
      load()
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err instanceof Error ? err.message : 'Error.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard icon={<Syringe className="size-4" />} title="Eliminación">
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <select value={kind} onChange={(e) => setKind(e.target.value as 'urine' | 'feces' | 'vomit')} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
              <option value="urine">Orina</option>
              <option value="feces">Heces</option>
              <option value="vomit">Vómito</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cantidad</Label>
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="poca/moderada/mucha" className="h-8 w-36 rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Consistencia</Label>
            <input value={consistency} onChange={(e) => setConsistency(e.target.value)} placeholder="normal/blanda/diarréica" className="h-8 w-36 rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <Button size="xs" variant="outline" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />} Guardar
          </Button>
        </div>
        {items.length > 0 && (
          <div className="space-y-1">
            {items.slice(0, 5).map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded border border-border/60 bg-muted/30 px-2 py-1 text-xs">
                <span className="capitalize">
                  {ELIMINATION_LABELS[e.kind] ?? e.kind}
                  {e.quantity ? ` · ${e.quantity}` : ''}
                  {e.consistency ? ` · ${e.consistency}` : ''}
                </span>
                <span className="text-muted-foreground">{new Date(e.observed_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  )
}

function PainCard({ hospitalizationId }: { hospitalizationId: string }) {
  const { toast } = useToast()
  const [items, setItems] = useState<HospPain[]>([])
  const [score, setScore] = useState('0')
  const [scale, setScale] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await apiFetch<HospPain[]>(`/hospitalization/${hospitalizationId}/pain`))
    } catch {
      setItems([])
    }
  }, [hospitalizationId])

  useEffect(() => {
    load()
  }, [load])

  const submit = async () => {
    setBusy(true)
    try {
      await apiFetch(`/hospitalization/${hospitalizationId}/pain`, {
        method: 'POST',
        body: JSON.stringify({ score: Number(score) || 0, scale: scale || null }),
      })
      toast({ title: 'Dolor registrado', variant: 'success' })
      load()
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err instanceof Error ? err.message : 'Error.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard icon={<Droplets className="size-4" />} title="Dolor">
      <div className="space-y-2">
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Puntuación (0-10)</Label>
            <input type="number" min={0} max={10} value={score} onChange={(e) => setScore(e.target.value)} className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Escala</Label>
            <input value={scale} onChange={(e) => setScale(e.target.value)} placeholder="Ej. Glasgow de dolor" className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <Button size="xs" variant="outline" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />} Guardar
          </Button>
        </div>
        {items.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {items.slice(0, 8).map((p) => (
              <span key={p.id} className={cn('rounded-full border px-2.5 py-1 text-xs font-medium', p.score >= 7 ? 'border-destructive/40 bg-destructive/10 text-destructive' : p.score >= 4 ? 'border-warning/40 bg-warning/10 text-warning' : 'border-success/40 bg-success/10 text-success')}>
                {p.score}/10{new Date(p.observed_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) ? ` · ${new Date(p.observed_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
