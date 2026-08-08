import { useState } from 'react'
import { Loader2, Send } from 'lucide-react'

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
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api'

export function ConsentDialog({
  petId,
  petName,
  open,
  onOpenChange,
  onSaved,
}: {
  petId: string
  petName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await apiFetch('/consents/pending', {
        method: 'POST',
        body: JSON.stringify({ pet_id: petId, title, body }),
      })
      setTitle('')
      setBody('')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el consentimiento')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consentimiento para firma del dueño</DialogTitle>
          <DialogDescription>
            {petName} · Se envía a la cartilla del dueño para que lo firme; al recibirlo, el
            personal lo confirma incluyendo sus firmas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="consent-title">Título *</Label>
            <Input
              id="consent-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Anestesia general, Cirugía, Procedimiento…"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="consent-body">Texto del consentimiento *</Label>
            <Textarea
              id="consent-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Se informa al dueño sobre el procedimiento, riesgos y alternativas…"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <Send />} Enviar para firma
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
