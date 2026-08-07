import { useEffect, useState } from 'react'
import { Copy, Link2, Loader2, MailCheck } from 'lucide-react'

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

interface ShareLinkResult {
  url: string
  expires_at: string
}

interface OwnerContact {
  name?: string | null
  phone?: string | null
  email?: string | null
}

export function InviteOwnerDialog({
  petId,
  petName,
  open,
  onOpenChange,
  defaultOwner,
}: {
  petId: string
  petName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultOwner?: OwnerContact | null
}) {
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [usingDifferent, setUsingDifferent] = useState(false)
  const [result, setResult] = useState<InvitationResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [share, setShare] = useState<ShareLinkResult | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)

  const hasRegistered = Boolean(defaultOwner) && Boolean(defaultOwner?.phone || defaultOwner?.email)

  useEffect(() => {
    if (open) {
      setResult(null)
      setError(null)
      setCopied(false)
      setPhone(defaultOwner?.phone ?? '')
      setEmail(defaultOwner?.email ?? '')
      setUsingDifferent(!hasRegistered)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultOwner])

  const useRegistered = () => {
    setUsingDifferent(false)
    setPhone(defaultOwner?.phone ?? '')
    setEmail(defaultOwner?.email ?? '')
  }

  const useOther = () => {
    setUsingDifferent(true)
    setPhone('')
    setEmail('')
  }

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

  const generateShareLink = async () => {
    setShareBusy(true)
    setError(null)
    try {
      const res = await apiFetch<ShareLinkResult>(`/pets/${petId}/share-link`, {
        method: 'POST',
      })
      setShare(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el enlace')
    } finally {
      setShareBusy(false)
    }
  }

  const copyShareLink = () => {
    const link = `${window.location.origin}${share?.url}`
    navigator.clipboard?.writeText(link).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    })
  }

  const shareFullLink = share ? `${window.location.origin}${share.url}` : ''

  const fullLink = result ? `${window.location.origin}${result.activation_url}` : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar al dueño de {petName}</DialogTitle>
          <DialogDescription>
            Comparte la cartilla con el dueño o genera su invitación de cuenta.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Enlace de la cartilla (sin login)
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              El dueño abre la cartilla de {petName}, sube su foto, gestiona alertas y firma
              consentimientos.
            </p>
            {!share ? (
              <Button
                type="button"
                size="sm"
                className="mt-2"
                onClick={generateShareLink}
                disabled={shareBusy}
              >
                {shareBusy ? <Loader2 className="animate-spin" /> : <Link2 />} Generar enlace
              </Button>
            ) : (
              <div className="mt-2 space-y-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <code
                    data-testid="share-code"
                    className="block min-w-0 flex-1 truncate rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                  >
                    {shareFullLink}
                  </code>
                  <Button type="button" variant="outline" size="sm" onClick={copyShareLink}>
                    <Copy /> {shareCopied ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Vence el{' '}
                  {new Date(share.expires_at).toLocaleDateString('es-MX', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                  . Compártelo por WhatsApp, correo o como prefieras.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">o con cuenta del dueño</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>

        {!result ? (
          <form onSubmit={submit} className="grid gap-4">
            {hasRegistered && !usingDifferent ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Contacto registrado del dueño
                </p>
                {defaultOwner?.name && (
                  <p className="mt-1 text-sm font-semibold text-foreground">{defaultOwner.name}</p>
                )}
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {[defaultOwner?.phone, defaultOwner?.email].filter(Boolean).join(' · ') ||
                    'Sin contacto'}
                </p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="mt-1.5 h-auto p-0"
                  onClick={useOther}
                >
                  Usar otros datos
                </Button>
              </div>
            ) : (
              <>
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
                {hasRegistered && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto justify-start p-0"
                    onClick={useRegistered}
                  >
                    Volver a usar el contacto registrado
                  </Button>
                )}
              </>
            )}
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
