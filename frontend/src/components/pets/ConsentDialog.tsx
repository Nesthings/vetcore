import { useState } from 'react'
import { FileSignature, Loader2, PenLine, Send } from 'lucide-react'

import { SignaturePad } from '@/components/pets/SignaturePad'
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
  remote = false,
}: {
  petId: string
  petName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  remote?: boolean
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!remote && !signature) {
      setError('El dueño debe firmar en la tablet antes de guardar.')
      return
    }
    setSubmitting(true)
    try {
      if (remote) {
        await apiFetch('/consents/pending', {
          method: 'POST',
          body: JSON.stringify({ pet_id: petId, title, body }),
        })
      } else {
        await apiFetch('/consents', {
          method: 'POST',
          body: JSON.stringify({
            pet_id: petId,
            title,
            body,
            owner_name: ownerName || null,
            signature_base64: signature,
          }),
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el consentimiento')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {remote ? 'Consentimiento para firma del dueño' : 'Nuevo consentimiento informado'}
          </DialogTitle>
          <DialogDescription>
            {petName} ·{' '}
            {remote
              ? 'Se enviará a la cartilla del dueño para que lo firme a distancia.'
              : 'El dueño firma en la tablet y se genera el PDF.'}
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

          {!remote && (
            <div className="space-y-2">
              <Label htmlFor="consent-owner">Nombre del dueño que firma</Label>
              <Input
                id="consent-owner"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Nombre del dueño"
              />
            </div>
          )}

          {!remote && (
            <div className="rounded-md border border-border p-4">
              <div className="mb-2 flex items-center gap-2">
                <PenLine className="size-4 text-primary" aria-hidden="true" />
                <p className="text-sm font-medium">Firma en tablet</p>
              </div>
              <SignaturePad onDataUrl={setSignature} />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="animate-spin" />
              ) : remote ? (
                <Send />
              ) : (
                <FileSignature />
              )}
              {remote ? 'Enviar para firma' : 'Firmar y generar PDF'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
