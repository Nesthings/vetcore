import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Copy,
  KeyRound,
  Link2,
  LogOut,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OtpInput } from '@/components/ui/otp-input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface Invite {
  id: string
  token: string
  clinic_name?: string | null
  contact_email?: string | null
  status: string
  expires_at: string
}

interface StaffUser {
  id: string
  full_name: string
  email: string
  role: string
  clinic_name?: string | null
}

interface ClinicRow {
  id: string
  name: string
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  subscription_status: string
  setup_completed: boolean
  timezone: string
  currency: string
  stock_alert_threshold?: number | null
  created_at: string
}

interface ClinicSummary {
  id: string
  name: string
  subscription_status: string
  branches: number
  staff: number
  pets: number
  appointments: number
  invoices: number
}

interface ClinicEvent {
  id: string
  event_type: string
  notes?: string | null
  created_at: string
}

const SUBSCRIPTION_LABEL: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'info' }
> = {
  active: { label: 'Activa', variant: 'success' },
  trial: { label: 'Prueba', variant: 'info' },
  suspended: { label: 'Suspendida', variant: 'warning' },
  cancelled: { label: 'Cancelada', variant: 'destructive' },
}

export function Platform() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [invites, setInvites] = useState<Invite[]>([])
  const [invName, setInvName] = useState('')
  const [invEmail, setInvEmail] = useState('')
  const [invDays, setInvDays] = useState('30')
  const [newLink, setNewLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [users, setUsers] = useState<StaffUser[]>([])
  const [search, setSearch] = useState('')
  const [resetFor, setResetFor] = useState<StaffUser | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const [clinics, setClinics] = useState<ClinicRow[]>([])
  const [clinicSearch, setClinicSearch] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [summary, setSummary] = useState<ClinicSummary | null>(null)
  const [clinicStaff, setClinicStaff] = useState<StaffUser[]>([])
  const [events, setEvents] = useState<ClinicEvent[]>([])
  const [loadingClinics, setLoadingClinics] = useState(true)
  const [tab, setTab] = useState('links')

  // Estado 2FA del super-admin
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [totpStatusLoading, setTotpStatusLoading] = useState(true)
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qr_data: string } | null>(null)
  const [totpSetupLoading, setTotpSetupLoading] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [totpCodeError, setTotpCodeError] = useState<string | null>(null)
  const [totpCodeLoading, setTotpCodeLoading] = useState(false)

  const loadInvites = useCallback(async () => {
    try {
      setInvites(await apiFetch<Invite[]>('/platform/clinic-invites'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las invitaciones')
    }
  }, [])

  const loadClinics = useCallback(async () => {
    setLoadingClinics(true)
    setError(null)
    try {
      setClinics(await apiFetch<ClinicRow[]>('/clinics'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las clínicas')
    } finally {
      setLoadingClinics(false)
    }
  }, [])

  useEffect(() => {
    loadInvites()
    loadClinics()
  }, [loadInvites, loadClinics])

  const toggleDetail = async (id: string) => {
    if (detailId === id) {
      setDetailId(null)
      return
    }
    setDetailId(id)
    setSummary(null)
    setClinicStaff([])
    setEvents([])
    setError(null)
    try {
      const [sum, staff, evts] = await Promise.all([
        apiFetch<ClinicSummary>(`/clinics/${id}/summary`),
        apiFetch<StaffUser[]>(`/platform/users?clinic_id=${id}`),
        apiFetch<ClinicEvent[]>(`/clinics/${id}/events`),
      ])
      setSummary(sum)
      setClinicStaff(staff)
      setEvents(evts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle')
    }
  }

  const setSubscription = async (id: string, status: string) => {
    setError(null)
    try {
      await apiFetch(`/clinics/${id}/subscription`, {
        method: 'POST',
        body: JSON.stringify({ status, notes: null }),
      })
      await loadClinics()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
    }
  }

  const generate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await apiFetch<Invite>('/platform/clinic-invites', {
        method: 'POST',
        body: JSON.stringify({
          clinic_name: invName || null,
          contact_email: invEmail || null,
          expires_in_days: Number(invDays) || 30,
        }),
      })
      setNewLink(`${window.location.origin}/create-clinic?token=${res.token}`)
      setInvName('')
      setInvEmail('')
      await loadInvites()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el link')
    }
  }

  const revoke = async (id: string) => {
    setError(null)
    try {
      await apiFetch(`/platform/clinic-invites/${id}/revoke`, { method: 'POST' })
      await loadInvites()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo revocar')
    }
  }

  const copyLink = async () => {
    if (!newLink) return
    try {
      await navigator.clipboard.writeText(newLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // sin clipboard
    }
  }

  const searchUsers = async (term: string) => {
    setSearch(term)
    if (!term.trim()) {
      setUsers([])
      return
    }
    try {
      setUsers(
        await apiFetch<StaffUser[]>(`/platform/users?search=${encodeURIComponent(term.trim())}`),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar')
    }
  }

  const resetPassword = async () => {
    if (!resetFor || newPassword.length < 8) {
      setError('Selecciona un usuario y una contraseña de al menos 8 caracteres.')
      return
    }
    setError(null)
    try {
      await apiFetch(`/platform/staff/${resetFor.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ new_password: newPassword }),
      })
      setResetFor(null)
      setNewPassword('')
      setUsers([])
      setSearch('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer')
    }
  }

  const loadTotpStatus = useCallback(async () => {
    setTotpStatusLoading(true)
    try {
      const res = await apiFetch<{ totp_enabled: boolean }>('/auth/super-admin/2fa/status')
      setTotpEnabled(res.totp_enabled)
    } catch {
      // sin acceso / error → se ignora
    } finally {
      setTotpStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTotpStatus()
  }, [loadTotpStatus])

  const startTotpSetup = async () => {
    setTotpSetupLoading(true)
    setTotpCodeError(null)
    try {
      const res = await apiFetch<{ secret: string; qr_data: string }>(
        '/auth/super-admin/2fa/setup',
        { method: 'POST' },
      )
      setTotpSetup(res)
    } catch (err) {
      setTotpCodeError(err instanceof Error ? err.message : 'No se pudo iniciar la configuración')
    } finally {
      setTotpSetupLoading(false)
    }
  }

  const confirmTotp = async () => {
    if (totpCode.trim().length !== 6) {
      setTotpCodeError('Ingresa el código de 6 dígitos de tu aplicación.')
      return
    }
    setTotpCodeLoading(true)
    setTotpCodeError(null)
    try {
      await apiFetch('/auth/super-admin/2fa/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: totpCode.trim() }),
      })
      setTotpEnabled(true)
      setTotpSetup(null)
      setTotpCode('')
    } catch (err) {
      setTotpCodeError(err instanceof Error ? err.message : 'El código es incorrecto')
    } finally {
      setTotpCodeLoading(false)
    }
  }

  const disableTotp = async () => {
    if (totpCode.trim().length !== 6) {
      setTotpCodeError('Ingresa tu código actual para desactivar el 2FA.')
      return
    }
    setTotpCodeLoading(true)
    setTotpCodeError(null)
    try {
      await apiFetch('/auth/super-admin/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ code: totpCode.trim() }),
      })
      setTotpEnabled(false)
      setTotpSetup(null)
      setTotpCode('')
    } catch (err) {
      setTotpCodeError(err instanceof Error ? err.message : 'El código es incorrecto')
    } finally {
      setTotpCodeLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Plataforma</h1>
            <p className="text-sm text-muted-foreground">Dueño del producto · admin@vetcore.app</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            logout()
            navigate('/login', { replace: true })
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          Cerrar sesión
        </Button>
      </div>

      <div className="mb-4 min-h-[20px]">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="relative z-10 w-full flex-wrap justify-start gap-1 rounded-xl border border-border bg-card p-1">
          <TabsTrigger value="links">Links de invitación</TabsTrigger>
          <TabsTrigger value="clinics">Clínicas</TabsTrigger>
          <TabsTrigger value="recover">Recuperar acceso</TabsTrigger>
          <TabsTrigger value="security">Seguridad</TabsTrigger>
        </TabsList>

        <TabsContent value="links" className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="size-5 text-primary" /> Generar link único
              </CardTitle>
              <CardDescription>
                Crea un enlace para que un admin registre su clínica (un solo uso).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={generate} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Nombre de clínica</Label>
                    <Input
                      value={invName}
                      onChange={(e) => setInvName(e.target.value)}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Correo del admin</Label>
                    <Input
                      type="email"
                      value={invEmail}
                      onChange={(e) => setInvEmail(e.target.value)}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vence en (días)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={invDays}
                      onChange={(e) => setInvDays(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" size="sm">
                  <Plus /> Generar link
                </Button>
              </form>

              {newLink && (
                <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
                  <Clipboard className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{newLink}</p>
                  <Button type="button" size="sm" variant="outline" onClick={copyLink}>
                    {copied ? <RefreshCw className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Invitaciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {invites.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin invitaciones generadas.</p>
              ) : (
                invites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {inv.clinic_name ?? 'Clínica sin nombre'}
                        {inv.contact_email ? ` · ${inv.contact_email}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Vence el {new Date(inv.expires_at).toLocaleDateString('es-MX')} ·{' '}
                        {inv.token.slice(0, 12)}…
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant={
                          inv.status === 'used'
                            ? 'success'
                            : inv.status === 'revoked'
                              ? 'destructive'
                              : inv.status === 'expired'
                                ? 'secondary'
                                : 'warning'
                        }
                      >
                        {inv.status === 'used'
                          ? 'Usado'
                          : inv.status === 'revoked'
                            ? 'Revocado'
                            : inv.status === 'expired'
                              ? 'Expirado'
                              : 'Pendiente'}
                      </Badge>
                      {inv.status === 'pending' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => revoke(inv.id)}
                        >
                          Revocar
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clinics" className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-5 text-primary" /> Clínicas (tenants)
              </CardTitle>
              <CardDescription>
                Activa, suspende o cancela clínicas y consulta su información.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={clinicSearch}
                onChange={(e) => setClinicSearch(e.target.value)}
                placeholder="Buscar clínica…"
                className="max-w-sm"
              />

              {loadingClinics ? (
                <p className="text-sm text-muted-foreground">Cargando clínicas…</p>
              ) : (
                <div className="space-y-2">
                  {clinics
                    .filter((c) => c.name.toLowerCase().includes(clinicSearch.trim().toLowerCase()))
                    .map((c) => {
                      const st = SUBSCRIPTION_LABEL[c.subscription_status] ?? {
                        label: c.subscription_status,
                        variant: 'secondary' as const,
                      }
                      const open = detailId === c.id
                      return (
                        <div key={c.id} className="rounded-lg border border-border/60 bg-muted/20">
                          <div className="flex items-center justify-between gap-2 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{c.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {c.id.slice(0, 8)}… · Creada{' '}
                                {new Date(c.created_at).toLocaleDateString('es-MX')}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Badge variant={st.variant}>{st.label}</Badge>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleDetail(c.id)}
                              >
                                {open ? <ChevronDown /> : <ChevronRight />} Info
                              </Button>
                            </div>
                          </div>

                          {open && (
                            <div className="space-y-4 border-t border-border px-3 py-3">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground">
                                    Contacto
                                  </p>
                                  <p className="text-sm">
                                    {c.contact_name ?? '—'}
                                    {c.contact_email ? ` · ${c.contact_email}` : ''}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Teléfono: {c.contact_phone ?? '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground">
                                    Configuración
                                  </p>
                                  <p className="text-sm">
                                    Zona horaria {c.timezone} · Moneda {c.currency}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Umbral de stock: {c.stock_alert_threshold ?? 5} · Setup:{' '}
                                    {c.setup_completed ? 'Completado' : 'Pendiente'}
                                  </p>
                                </div>
                              </div>

                              {summary && (
                                <div className="flex flex-wrap gap-2">
                                  {[
                                    ['Sucursales', summary.branches],
                                    ['Staff', summary.staff],
                                    ['Mascotas', summary.pets],
                                    ['Citas', summary.appointments],
                                    ['Facturas', summary.invoices],
                                  ].map(([label, value]) => (
                                    <span
                                      key={String(label)}
                                      className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
                                    >
                                      <span className="font-semibold">{value}</span>{' '}
                                      <span className="text-muted-foreground">{label}</span>
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="flex flex-wrap items-center gap-2">
                                <p className="w-full text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Estado de suscripción
                                </p>
                                {c.subscription_status !== 'active' && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSubscription(c.id, 'active')}
                                  >
                                    Activar
                                  </Button>
                                )}
                                {c.subscription_status !== 'suspended' && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSubscription(c.id, 'suspended')}
                                  >
                                    Suspender
                                  </Button>
                                )}
                                {c.subscription_status !== 'cancelled' && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive"
                                    onClick={() => setSubscription(c.id, 'cancelled')}
                                  >
                                    Cancelar
                                  </Button>
                                )}
                              </div>

                              {clinicStaff.length > 0 && (
                                <div>
                                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Staff
                                  </p>
                                  <div className="space-y-1">
                                    {clinicStaff.map((u) => (
                                      <p key={u.id} className="text-sm">
                                        <span className="font-medium">{u.full_name}</span>
                                        <span className="text-muted-foreground">
                                          {' '}
                                          · {u.email} · {u.role}
                                        </span>
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {events.length > 0 && (
                                <div>
                                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Historial de suscripción
                                  </p>
                                  <div className="space-y-1">
                                    {events.map((ev) => (
                                      <p key={ev.id} className="text-sm">
                                        <span className="font-medium capitalize">
                                          {ev.event_type}
                                        </span>
                                        <span className="text-muted-foreground">
                                          {' '}
                                          · {new Date(ev.created_at).toLocaleString('es-MX')}
                                          {ev.notes ? ` · ${ev.notes}` : ''}
                                        </span>
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recover" className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-5 text-primary" /> Restablecer contraseña de un admin
              </CardTitle>
              <CardDescription>
                Busca al usuario por correo o nombre y asigna una nueva contraseña.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Buscar usuario</Label>
                <Input
                  value={search}
                  onChange={(e) => searchUsers(e.target.value)}
                  placeholder="Correo o nombre…"
                />
              </div>

              {users.length > 0 && (
                <div className="space-y-1.5">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setResetFor(u)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        resetFor?.id === u.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border/60 hover:bg-accent'
                      }`}
                    >
                      <span className="font-medium">{u.full_name}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {u.email} · {u.role} · {u.clinic_name ?? ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {resetFor && (
                <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-sm font-medium">Nueva contraseña para {resetFor.full_name}</p>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    placeholder="Mínimo 8 caracteres"
                  />
                  <Button type="button" size="sm" onClick={resetPassword}>
                    Restablecer contraseña
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" /> Autenticación en dos pasos
              </CardTitle>
              <CardDescription>
                Protege el acceso a la plataforma con un segundo factor usando Microsoft
                Authenticator u otra app TOTP.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {totpStatusLoading ? (
                <p className="text-sm text-muted-foreground">Cargando estado…</p>
              ) : totpEnabled && !totpSetup ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">2FA activado</p>
                      <p className="text-xs text-muted-foreground">
                        El acceso a la plataforma requiere tu código de verificación.
                      </p>
                    </div>
                    <Badge variant="soft-success">Activo</Badge>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="w-full space-y-1.5">
                      <Label htmlFor="platform-totp-disable-code">Código actual</Label>
                      <OtpInput
                        value={totpCode}
                        onChange={setTotpCode}
                        disabled={totpCodeLoading}
                      />
                      {totpCodeError && (
                        <p className="text-xs text-destructive">{totpCodeError}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={disableTotp}
                      disabled={totpCodeLoading}
                    >
                      {totpCodeLoading ? 'Desactivando…' : 'Desactivar 2FA'}
                    </Button>
                  </div>
                </div>
              ) : totpSetup ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Escanea el código QR con tu aplicación de autenticación (Microsoft
                    Authenticator, Google Authenticator, etc.) y luego ingresa el código de 6
                    dígitos para activar.
                  </p>
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                    <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-white p-2">
                      <img
                        src={totpSetup.qr_data}
                        alt="Código QR para configurar la autenticación"
                        className="size-48 object-contain"
                      />
                    </div>
                    <div className="w-full max-w-xs space-y-2">
                      <Label htmlFor="platform-totp-code">Código de 6 dígitos</Label>
                      <OtpInput
                        value={totpCode}
                        onChange={setTotpCode}
                        disabled={totpCodeLoading}
                      />
                      {totpCodeError && (
                        <p className="text-xs text-destructive">{totpCodeError}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={confirmTotp}
                          disabled={totpCodeLoading}
                        >
                          {totpCodeLoading ? 'Activando…' : 'Activar 2FA'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setTotpSetup(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
                    <p className="text-sm text-muted-foreground">
                      El 2FA está desactivado. Actívalo para exigir un código de verificación
                      además de tu contraseña al entrar a la plataforma.
                    </p>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="w-full max-w-xs space-y-1.5">
                      <Label htmlFor="platform-totp-disable-code">
                        Código actual (si desactivás)
                      </Label>
                      <OtpInput
                        value={totpCode}
                        onChange={setTotpCode}
                        disabled={totpCodeLoading}
                      />
                      {totpCodeError && (
                        <p className="text-xs text-destructive">{totpCodeError}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={startTotpSetup}
                      disabled={totpSetupLoading}
                    >
                      <QrCode className="size-4" aria-hidden="true" />
                      {totpSetupLoading ? 'Generando…' : 'Configurar 2FA'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
