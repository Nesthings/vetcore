import { useEffect, useState } from 'react'
import { Copy, Link2, Loader2, Mail, MessageCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/api'

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
  const [share, setShare] = useState<ShareLinkResult | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [sendBusy, setSendBusy] = useState<'whatsapp' | 'email' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      setShare(null)
      setError(null)
    }
  }, [open])

  const generateShareLink = async () => {
    setShareBusy(true)
    setError(null)
    try {
      const res = await apiFetch<ShareLinkResult>(`/pets/${petId}/share-link`, { method: 'POST' })
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
      toast({ title: 'Enlace copiado', variant: 'success' })
    })
  }

  const shareFullLink = share ? `${window.location.origin}${share.url}` : ''

  const sendWhatsapp = async () => {
    setSendBusy('whatsapp')
    setError(null)
    try {
      const res = await apiFetch<{ ok: boolean; error?: string | null }>(
        `/pets/${petId}/send-cartilla`,
        { method: 'POST', body: JSON.stringify({ link: shareFullLink, to: defaultOwner?.phone || null }) },
      )
      if (res.ok) {
        toast({ title: 'Cartilla enviada por WhatsApp', variant: 'success' })
      } else {
        toast({ title: 'No se pudo enviar', description: res.error ?? undefined, variant: 'error' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar')
    } finally {
      setSendBusy(null)
    }
  }

  const sendEmail = async () => {
    setSendBusy('email')
    setError(null)
    try {
      const res = await apiFetch<{ ok: boolean; error?: string | null }>(
        `/pets/${petId}/send-cartilla-email`,
        { method: 'POST', body: JSON.stringify({ link: shareFullLink, to: defaultOwner?.email || null }) },
      )
      if (res.ok) {
        toast({ title: 'Cartilla enviada por correo', variant: 'success' })
      } else {
        toast({ title: 'No se pudo enviar', description: res.error ?? undefined, variant: 'error' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar')
    } finally {
      setSendBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compartir cartilla de {petName}</DialogTitle>
          <DialogDescription>Genera el enlace y compártelo con el dueño.</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {!share ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Enlace de la cartilla (sin login)
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                El dueño abre la cartilla de {petName}, sube su foto, gestiona alertas y firma
                consentimientos.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-2"
                onClick={generateShareLink}
                disabled={shareBusy}
              >
                {shareBusy ? <Loader2 className="animate-spin" /> : <Link2 />} Generar enlace
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <code
                data-testid="share-code"
                className="block min-w-0 truncate rounded-md border border-border bg-card px-2 py-1.5 text-xs"
              >
                {shareFullLink}
              </code>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Vence el {new Date(share.expires_at).toLocaleDateString('es-MX')}.
              </p>
              <div className="mt-3 grid gap-2">
                <Button type="button" variant="outline" size="sm" onClick={copyShareLink}>
                  <Copy /> Copiar enlace
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="soft"
                  onClick={sendWhatsapp}
                  disabled={sendBusy === 'whatsapp' || !defaultOwner?.phone}
                >
                  {sendBusy === 'whatsapp' ? <Loader2 className="animate-spin" /> : <MessageCircle />}{' '}
                  Enviar por WhatsApp
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="soft"
                  onClick={sendEmail}
                  disabled={sendBusy === 'email' || !defaultOwner?.email}
                >
                  {sendBusy === 'email' ? <Loader2 className="animate-spin" /> : <Mail />} Enviar por
                  correo
                </Button>
              </div>
              {(!defaultOwner?.phone || !defaultOwner?.email) && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {!defaultOwner?.phone && 'Sin teléfono registrado: WhatsApp deshabilitado. '}
                  {!defaultOwner?.email && 'Sin correo registrado: correo deshabilitado.'}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
