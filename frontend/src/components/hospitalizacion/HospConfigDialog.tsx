import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Save, Settings2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/api'

interface HospConfig {
  stay_prices: Record<string, number>
  monitoring_surcharge: Record<string, number>
  monitoring_intervals: Record<string, number>
  discharge_checklist: { items?: string[] }
}

const ACC_TYPES = ['general', 'uci', 'isolation', 'recovery', 'postop', 'other']
const MONITORING = ['basic', 'intermediate', 'intensive']

export function HospConfigDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [cfg, setCfg] = useState<HospConfig | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setCfg(await apiFetch<HospConfig>('/hospitalization/config/stay'))
    } catch {
      setCfg(null)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const setNum = (section: keyof HospConfig, key: string, value: string) => {
    setCfg((prev) =>
      prev
        ? {
            ...prev,
            [section]: { ...(prev[section] as Record<string, number>), [key]: Number(value) || 0 },
          }
        : prev,
    )
  }

  const checklistItems = cfg?.discharge_checklist?.items ?? []
  const setChecklist = (items: string[]) =>
    setCfg((prev) => (prev ? { ...prev, discharge_checklist: { items } } : prev))

  const save = async () => {
    if (!cfg) return
    setBusy(true)
    try {
      await apiFetch('/hospitalization/config/stay', {
        method: 'PUT',
        body: JSON.stringify({
          stay_prices: cfg.stay_prices,
          monitoring_surcharge: cfg.monitoring_surcharge,
          monitoring_intervals: cfg.monitoring_intervals,
          discharge_checklist: { items: checklistItems },
        }),
      })
      toast({ title: 'Configuración guardada', variant: 'success' })
      onSaved()
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err instanceof Error ? err.message : 'Error.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-5 text-primary" /> Configuración de hospitalización
          </DialogTitle>
          <DialogDescription>
            Precios de estancia, recargos, intervalos de monitorización y checklist de alta.
          </DialogDescription>
        </DialogHeader>

        {!cfg ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="grid gap-5">
            <div className="space-y-2">
              <Label>Precio por día por tipo de espacio (MXN)</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ACC_TYPES.map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <span className="w-20 text-xs capitalize text-muted-foreground">{t}</span>
                    <Input type="number" value={cfg.stay_prices[t] ?? 0} onChange={(e) => setNum('stay_prices', t, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Recargo por nivel de monitorización (MXN/día)</Label>
              <div className="grid grid-cols-3 gap-2">
                {MONITORING.map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <span className="w-24 text-xs capitalize text-muted-foreground">{m}</span>
                    <Input type="number" value={cfg.monitoring_surcharge[m] ?? 0} onChange={(e) => setNum('monitoring_surcharge', m, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Intervalo de signos vitales por nivel (minutos)</Label>
              <div className="grid grid-cols-3 gap-2">
                {MONITORING.map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <span className="w-24 text-xs capitalize text-muted-foreground">{m}</span>
                    <Input type="number" value={cfg.monitoring_intervals[m] ?? 240} onChange={(e) => setNum('monitoring_intervals', m, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Checklist de alta</Label>
              <div className="space-y-1.5">
                {checklistItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={item} onChange={(e) => setChecklist(checklistItems.map((x, j) => (j === i ? e.target.value : x)))} />
                    <Button size="icon-sm" variant="ghost" onClick={() => setChecklist(checklistItems.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => setChecklist([...checklistItems, ''])}>
                <Plus /> Agregar ítem
              </Button>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Save />} Guardar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
