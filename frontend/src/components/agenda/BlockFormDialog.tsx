import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

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
import { apiFetch } from '@/lib/api'

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function BlockFormDialog({
  open,
  onOpenChange,
  defaultBranchId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultBranchId: string
  onSaved: () => void
}) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      const from = new Date()
      from.setMinutes(0, 0, 0)
      from.setHours(from.getHours() + 1)
      const to = new Date(from)
      to.setHours(to.getHours() + 1)
      setStart(toLocalInputValue(from))
      setEnd(toLocalInputValue(to))
      setReason('')
      setError(null)
    }
  }, [open])

  const submit = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await apiFetch('/schedule-blocks', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: defaultBranchId,
          start_time: new Date(start).toISOString(),
          end_time: new Date(end).toISOString(),
          reason: reason || null,
        }),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo bloquear el horario')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bloquear horario</DialogTitle>
          <DialogDescription>
            Reserva un espacio de la agenda (junta, capacitación, etc.).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Inicio</Label>
              <Input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fin</Label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Junta del equipo"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : 'Bloquear horario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
