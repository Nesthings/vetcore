import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, Building2, Loader2, PawPrint } from 'lucide-react'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface LoginResponse {
  access_token: string
}

export function CreateClinic() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { login } = useAuth()
  const navigate = useNavigate()

  const [checking, setChecking] = useState(true)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [clinicName, setClinicName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setInvalid('Falta el enlace de invitación.')
      setChecking(false)
      return
    }
    apiFetch<{ valid: boolean; clinic_name?: string | null; contact_email?: string | null }>(
      `/create-clinic/info?token=${encodeURIComponent(token)}`,
    )
      .then((res) => {
        setClinicName(res.clinic_name ?? '')
        setEmail(res.contact_email ?? '')
        setChecking(false)
      })
      .catch((err) => {
        setInvalid(err instanceof Error ? err.message : 'Enlace inválido o expirado')
        setChecking(false)
      })
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await apiFetch<LoginResponse>('/create-clinic', {
        method: 'POST',
        body: JSON.stringify({
          token,
          name: clinicName,
          first_admin: {
            full_name: fullName,
            email,
            password,
            professional_title: title || null,
          },
        }),
      })
      login(res.access_token)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la clínica')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Crear mi clínica" subtitle="Bienvenido, configura tu clínica y tu acceso">
      {checking ? (
        <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
          <Loader2 className="animate-spin" aria-hidden="true" />
          <p className="text-sm">Validando enlace…</p>
        </div>
      ) : invalid ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{invalid}</span>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cc-name">Nombre de la clínica *</Label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="cc-name"
                className="pl-9"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                placeholder="ej. Clínica VetCare"
                required
              />
            </div>
          </div>

          <div className="rounded-md border border-border p-4">
            <div className="mb-1 flex items-center gap-2">
              <PawPrint className="size-4 text-primary" aria-hidden="true" />
              <p className="text-sm font-medium">Primer administrador (tú)</p>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              El administrador tiene acceso a todo: configura la clínica, agrega sucursales y
              equipo, y gestiona citas, expedientes, inventario y finanzas.
            </p>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="cc-fullname">Nombre completo *</Label>
                <Input
                  id="cc-fullname"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cc-email">Correo *</Label>
                <Input
                  id="cc-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cc-password">Contraseña *</Label>
                  <Input
                    id="cc-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    placeholder="Mínimo 8 caracteres"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cc-title">Título profesional</Label>
                  <Input
                    id="cc-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="ej. MVZ"
                  />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {submitting ? 'Creando…' : 'Crear clínica y entrar'}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
