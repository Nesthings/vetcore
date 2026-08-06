import { useEffect, useState } from 'react'
import { Copy, Loader2, MailCheck } from 'lucide-react'

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

interface InvitationResult {
  token: string
  activation_url: string
  expires_at: string
}

export function InviteOwnerDialog({
  petId,
  petName,
  open,
  onOpenChange,
}: {
  petId: string
  petName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<InvitationResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setPhone('')
      setEmail('')
      setResult(null)
      setError(null)
      setCopied(false)
    }
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await apiFetch<InvitationResult>(`/pets/${petId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({
          contact_phone: phone || null,
          contact_email: email || null,
        }),
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la invitación')
    } finally {
      setSubmitting(false)
    }
  }

  const copyLink = () => {
    const link = `${window.location.origin}${result?.activation_url}`
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const fullLink = result ? `${window.location.origin}${result.activation_url}` : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar al dueño de {petName}</DialogTitle>
          <DialogDescription>
            Genera el enlace de activación para el dueño. Si ya tiene cuenta, se reutiliza.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+52..."
                />
              </div>
              <div className="space-y-2">
                <Label>Correo</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="dueño@ejemplo.com"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Al menos uno de los dos. La clínica ya capturó este contacto en persona.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || (!phone && !email)}>
                {submitting ? <Loader2 className="animate-spin" /> : 'Generar invitación'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Invitación creada. Comparte este enlace con el dueño (vence el{' '}
                {new Date(result.expires_at).toLocaleDateString('es-MX')}):
              </span>
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 text-xs">
                {fullLink}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                <Copy /> {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Listo
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
