import { useCallback, useEffect, useState } from 'react'
import { Loader2, Save, UserRound } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api'

interface Me {
  id: string
  full_name: string
  email: string
  role: string
  phone?: string | null
  branch_name?: string | null
}

export function Profile() {
  const [me, setMe] = useState<Me | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<Me>('/users/me')
      setMe(res)
      setFullName(res.full_name)
      setPhone(res.phone ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar tu perfil')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { full_name: fullName, phone: phone || null }
      if (newPassword) {
        body.current_password = currentPassword
        body.new_password = newPassword
      }
      await apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify(body) })
      setCurrentPassword('')
      setNewPassword('')
      setSuccess(true)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el perfil')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Mi perfil</h1>
        <p className="text-sm text-muted-foreground">Tu cuenta de staff de la clínica</p>
      </div>

      <div className="max-w-lg space-y-6">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Datos de la cuenta</CardTitle>
            <CardDescription>
              {me?.email} · {me?.role} {me?.branch_name ? `· ${me.branch_name}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre completo</Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>

              <div className="rounded-md border border-border p-4">
                <p className="mb-3 text-sm font-medium">Cambiar contraseña</p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Contraseña actual</Label>
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nueva contraseña (mín. 8)</Label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && <p className="text-sm text-success">Perfil actualizado correctamente.</p>}

              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : <Save />} Guardar cambios
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
