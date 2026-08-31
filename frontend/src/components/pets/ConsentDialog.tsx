import { useRef, useState } from 'react'
import { Loader2, Paperclip, Send, X } from 'lucide-react'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api'

interface VetOption {
  id: string
  full_name: string
  professional_title?: string | null
}

interface OwnerOption {
  owner_id: string
  full_name?: string | null
}

export function ConsentDialog({
  petId,
  petName,
  vets,
  owner,
  open,
  onOpenChange,
  onSaved,
}: {
  petId: string
  petName: string
  vets: VetOption[]
  owner: OwnerOption | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [signingDoctor, setSigningDoctor] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setTitle('')
    setBody('')
    setSigningDoctor('')
    setFile(null)
    setError(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('pet_id', petId)
      fd.append('title', title)
      fd.append('body', body)
      if (signingDoctor.startsWith('vet:')) {
        fd.append('vet_user_id', signingDoctor.slice(4))
      } else if (signingDoctor.startsWith('owner:')) {
        fd.append('owner_id', signingDoctor.slice(6))
      }
      if (file) fd.append('attachment', file)
      await apiFetch('/consents/pending', { method: 'POST', body: fd })
      reset()
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
            <Label htmlFor="consent-body">Descripción del consentimiento *</Label>
            <Textarea
              id="consent-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Se informa al dueño sobre el procedimiento, riesgos y alternativas…"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Médico que firma (opcional)</Label>
            <Select value={signingDoctor} onValueChange={setSigningDoctor}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin especificar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin especificar</SelectItem>
                {vets.map((v) => (
                  <SelectItem key={v.id} value={`vet:${v.id}`}>
                    {v.full_name}
                    {v.professional_title ? ` · ${v.professional_title}` : ''}
                  </SelectItem>
                ))}
                {owner?.owner_id ? (
                  <SelectItem value={`owner:${owner.owner_id}`}>
                    {owner.full_name ?? 'Dueño'} · dueño (médico)
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Se usará la firma guardada en su perfil; también puedes elegir al dueño cuando él
              mismo es médico.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Adjuntar documento explicativo (opcional)</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <Paperclip className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{file.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null)
                    if (fileRef.current) fileRef.current.value = ''
                  }}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  aria-label="Quitar archivo"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip /> Elegir archivo
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              PDF o imagen · máx. 10 MB. El dueño podrá verlo en su cartilla.
            </p>
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
