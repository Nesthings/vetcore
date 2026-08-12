import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ClipboardCheck, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
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
import type { HospDischarge, HospStatus } from '@/lib/hospitalization'

export function DischargeSection({
  hospitalizationId,
  status,
}: {
  hospitalizationId: string
  status: HospStatus
}) {
  const [discharge, setDischarge] = useState<HospDischarge | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<HospDischarge | null>(`/hospitalization/${hospitalizationId}/discharge`)
      setDischarge(res ?? null)
    } catch {
      setDischarge(null)
    }
  }, [hospitalizationId])

  useEffect(() => {
    load()
  }, [load])

  const canDischarge = ['admitted', 'active', 'discharge_pending'].includes(status)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Alta</h3>
        {discharge && <Badge variant="success">Dado de alta</Badge>}
        {canDischarge && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpen(true)}>
            Formalizar alta
          </Button>
        )}
      </div>

      {discharge && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
          {discharge.reason && (
            <p>
              <span className="font-medium">Motivo:</span> {discharge.reason}
            </p>
          )}
          {discharge.summary && <p className="whitespace-pre-wrap">{discharge.summary}</p>}
          {discharge.checklist.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {discharge.checklist.map((c) => (
                <Badge key={c.item} variant={c.done ? 'success' : 'secondary'}>
                  {c.done ? <CheckCircle2 className="size-3" /> : null} {c.item}
                </Badge>
              ))}
            </div>
          )}
          {discharge.follow_up_date && (
            <p className="text-muted-foreground">
              Seguimiento: {new Date(discharge.follow_up_date).toLocaleDateString('es-MX')}
              {discharge.follow_up_reason ? ` · ${discharge.follow_up_reason}` : ''}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Alta: {new Date(discharge.discharged_at).toLocaleString('es-MX')}
          </p>
        </div>
      )}

      <DischargeDialog
        open={open}
        onOpenChange={setOpen}
        hospitalizationId={hospitalizationId}
        onSaved={() => {
          setOpen(false)
          load()
        }}
      />
    </div>
  )
}

function DischargeDialog({
  open,
  onOpenChange,
  hospitalizationId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  hospitalizationId: string
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [reason, setReason] = useState('')
  const [summary, setSummary] = useState('')
  const [checklist, setChecklist] = useState<{ item: string; done: boolean }[]>([])
  const [followDate, setFollowDate] = useState('')
  const [followReason, setFollowReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setReason('')
    setSummary('')
    setFollowDate('')
    setFollowReason('')
    setError(null)
    apiFetch<{ items: string[] }>('/hospitalization/discharge-checklist/default')
      .then((res) => setChecklist(res.items.map((item) => ({ item, done: false }))))
      .catch(() => setChecklist([]))
  }, [open])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/hospitalization/${hospitalizationId}/discharge`, {
        method: 'POST',
        body: JSON.stringify({
          reason: reason || null,
          summary: summary || null,
          checklist,
          follow_up_date: followDate || null,
          follow_up_reason: followReason || null,
        }),
      })
      toast({ title: 'Alta formalizada', description: 'Resumen y seguimiento guardados.', variant: 'success' })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dar de alta')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Formalizar alta</DialogTitle>
          <DialogDescription>Registra el motivo, resumen, checklist y seguimiento post-alta.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Motivo de alta</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Mejoría clínica" />
          </div>
          <div className="space-y-2">
            <Label>Resumen de alta</Label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Evolución, procedimientos, indicaciones y seguimiento…"
              className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Checklist</Label>
            {checklist.map((c) => (
              <label key={c.item} className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                <input type="checkbox" checked={c.done} onChange={(e) => setChecklist((prev) => prev.map((x) => (x.item === c.item ? { ...x, done: e.target.checked } : x)))} className="size-4 rounded border-border" />
                <span className={c.done ? 'line-through opacity-60' : ''}>{c.item}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cita de seguimiento</Label>
              <Input type="date" value={followDate} onChange={(e) => setFollowDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Motivo del seguimiento</Label>
              <Input value={followReason} onChange={(e) => setFollowReason(e.target.value)} placeholder="Ej. Retiro de puntos" />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="success" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Dar de alta
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
