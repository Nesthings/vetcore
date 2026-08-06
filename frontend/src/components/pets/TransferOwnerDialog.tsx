import { useEffect, useState } from 'react'
import { Copy, Loader2, UserRoundCog } from 'lucide-react'

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

interface OwnerLink {
  owner_id: string
  phone?: string | null
  email?: string | null
  linked_at: string
  is_active: boolean
}

interface TransferResult {
  owner_id: string
  reused: boolean
  links_revoked: number
  invitation: { token: string; activation_url: string; expires_at: string }
}

export function TransferOwnerDialog({
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
  const [links, setLinks] = useState<OwnerLink[]>([])
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<TransferResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setPhone('')
    setEmail('')
    setResult(null)
    setError(null)
    setCopied(false)
    apiFetch<OwnerLink[]>(`/pets/${petId}/owner-links`)
      .then(setLinks)
      .catch(() => undefined)
  }, [open, petId])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await apiFetch<TransferResult>(`/pets/${petId}/owner-transfer`, {
        method: 'POST',
        body: JSON.stringify({ contact_phone: phone || null, contact_email: email || null }),
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo transferir el dueño')
    } finally {
      setSubmitting(false)
    }
  }

  const copyLink = () => {
    const link = `${window.location.origin}${result?.invitation.activation_url}`
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const fullLink = result ? `${window.location.origin}${result.invitation.activation_url}` : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir dueño — {petName}</DialogTitle>
          <DialogDescription>Cambia la titularidad de la mascota a otro dueño.</DialogDescription>
        </DialogHeader>

        {!result ? (
          <form onSubmit={submit} className="grid gap-4">
            {links.length > 0 && (
              <div className="rounded-md border border-border p-3 text-sm">
                <p className="mb-1.5 font-medium">Dueños actuales</p>
                {links.map((l) => (
                  <p key={l.owner_id} className="text-muted-foreground">
                    {l.email ?? l.phone ?? l.owner_id.slice(0, 8)}{' '}
                    <span
                      className={
                        l.is_active ? 'text-success' : 'text-muted-foreground line-through'
                      }
                    >
                      {l.is_active ? '· activo' : '· revocado'}
                    </span>
                  </p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teléfono nuevo dueño</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+52..."
                />
              </div>
              <div className="space-y-2">
                <Label>Correo nuevo dueño</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nuevo@dueño.com"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Si el dueño ya existe se reutiliza su cuenta; los links actuales quedan revocados y el
              nuevo dueño recibe una invitación.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || (!phone && !email)}>
                {submitting ? <Loader2 className="animate-spin" /> : 'Transferir'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              <UserRoundCog className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Dueño transferido. {result.links_revoked} vínculo(s) anterior(es) revocado(s).
                {result.reused
                  ? ' Se reutilizó la cuenta existente.'
                  : ' Se creó una cuenta nueva.'}
              </span>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">
                Invita al nuevo dueño a activar su cuenta:
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 text-xs">
                  {fullLink}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                  <Copy /> {copied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
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
