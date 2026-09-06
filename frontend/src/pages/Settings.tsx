import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { BranchFormDialog, type Branch } from '@/components/settings/BranchFormDialog'
import { UserFormDialog, type StaffUser } from '@/components/settings/UserFormDialog'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { OtpInput } from '@/components/ui/otp-input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  veterinario: 'Veterinario',
  recepcion: 'Recepción',
}

const ROLE_BADGE: Record<string, 'soft-info' | 'soft-success' | 'soft-secondary'> = {
  admin: 'soft-info',
  veterinario: 'soft-success',
  recepcion: 'soft-secondary',
}

interface ClinicProfile {
  id: string
  name: string
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  address?: string | null
  rfc?: string | null
  fiscal_name?: string | null
  timezone: string
  currency: string
  logo_url?: string | null
}

export function Settings() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [users, setUsers] = useState<StaffUser[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ title: string; onConfirm: () => void } | null>(null)

  // Estado 2FA del admin
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [totpStatusLoading, setTotpStatusLoading] = useState(true)
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qr_data: string } | null>(null)
  const [totpSetupLoading, setTotpSetupLoading] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [totpCodeError, setTotpCodeError] = useState<string | null>(null)
  const [totpCodeLoading, setTotpCodeLoading] = useState(false)

  const [userFormOpen, setUserFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null)
  const [branchFormOpen, setBranchFormOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)

  const [clinic, setClinic] = useState<ClinicProfile | null>(null)
  const [clinicForm, setClinicForm] = useState({
    name: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    address: '',
    rfc: '',
    fiscal_name: '',
    timezone: 'UTC',
    currency: 'MXN',
  })
  const [savingClinic, setSavingClinic] = useState(false)
  const [clinicSuccess, setClinicSuccess] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [u, b, c] = await Promise.all([
        apiFetch<StaffUser[]>('/users'),
        apiFetch<Branch[]>('/branches'),
        apiFetch<ClinicProfile>('/clinics/me'),
      ])
      setUsers(u)
      setBranches(b)
      setClinic(c)
      setClinicForm({
        name: c.name,
        contact_name: c.contact_name ?? '',
        contact_phone: c.contact_phone ?? '',
        contact_email: c.contact_email ?? '',
        address: c.address ?? '',
        rfc: c.rfc ?? '',
        fiscal_name: c.fiscal_name ?? '',
        timezone: c.timezone,
        currency: c.currency,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const loadTotpStatus = useCallback(async () => {
    if (!isAdmin) {
      setTotpStatusLoading(false)
      return
    }
    setTotpStatusLoading(true)
    try {
      const res = await apiFetch<{ totp_enabled: boolean }>('/auth/me/2fa/status')
      setTotpEnabled(res.totp_enabled)
    } catch {
      // sin acceso / error → se ignora
    } finally {
      setTotpStatusLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    loadTotpStatus()
  }, [loadTotpStatus])

  const startTotpSetup = async () => {
    setTotpSetupLoading(true)
    setTotpCodeError(null)
    try {
      const res = await apiFetch<{ secret: string; qr_data: string }>('/auth/me/2fa/setup', {
        method: 'POST',
      })
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
      await apiFetch('/auth/me/2fa/confirm', {
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
      await apiFetch('/auth/me/2fa/disable', {
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

  const toggleUser = async (user: StaffUser) => {
    try {
      await apiFetch(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !user.is_active }),
      })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario')
    }
  }

  const deleteBranch = async (branch: Branch) => {
    setConfirm({
      title: `¿Eliminar la sucursal "${branch.name}"?`,
      onConfirm: async () => {
        try {
          await apiFetch(`/branches/${branch.id}`, { method: 'DELETE' })
          load()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No se pudo eliminar la sucursal')
        }
        setConfirm(null)
      },
    })
  }

  const saveClinic = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingClinic(true)
    setClinicSuccess(false)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        name: clinicForm.name,
        contact_name: clinicForm.contact_name || null,
        contact_phone: clinicForm.contact_phone || null,
        contact_email: clinicForm.contact_email || null,
        address: clinicForm.address || null,
        rfc: clinicForm.rfc || null,
        fiscal_name: clinicForm.fiscal_name || null,
        timezone: clinicForm.timezone,
        currency: clinicForm.currency,
      }
      await apiFetch('/clinics/me', { method: 'PATCH', body: JSON.stringify(body) })
      setClinicSuccess(true)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la clínica')
    } finally {
      setSavingClinic(false)
    }
  }

  const uploadLogo = async (file: File) => {
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      await apiFetch('/clinics/me/logo', { method: 'POST', body: form })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el logo')
    }
  }

  const setClinicField = (field: keyof typeof clinicForm, value: string) =>
    setClinicForm((prev) => ({ ...prev, [field]: value }))

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Configuración de la clínica</h1>
        <p className="text-sm text-muted-foreground">
          Usuarios, sucursales y catálogo de servicios
        </p>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando configuración…" />}

      {!loading && !error && (
        <>
        <Tabs defaultValue="users">
          <TabsList className="w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 sm:w-auto sm:overflow-visible">
            <TabsTrigger value="users">
              <Users className="size-4" /> Usuarios
            </TabsTrigger>
            <TabsTrigger value="branches">
              <Settings2 className="size-4" /> Sucursales
            </TabsTrigger>
            <TabsTrigger value="clinic">
              <Building2 className="size-4" /> Clínica
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{users.length} cuentas de staff</p>
              <Button
                size="sm"
                onClick={() => {
                  setEditingUser(null)
                  setUserFormOpen(true)
                }}
              >
                <Plus /> Nuevo usuario
              </Button>
            </div>
            {users.length === 0 ? (
              <EmptyState title="Sin usuarios" description="Crea la primera cuenta de staff." />
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="hidden lg:table-cell">Correo</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead className="hidden md:table-cell">Sucursal</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar
                              src={u.photo_url}
                              name={u.full_name}
                              alt={`Foto de ${u.full_name}`}
                              className="size-9"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{u.full_name}</p>
                              {u.job_title && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {u.job_title}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant={ROLE_BADGE[u.role] ?? 'soft-secondary'}>
                            {ROLE_LABELS[u.role] ?? u.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {u.branch_name ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.is_active ? 'soft-success' : 'soft-secondary'}>
                            {u.is_active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Editar ${u.full_name}`}
                            onClick={() => {
                              setEditingUser(u)
                              setUserFormOpen(true)
                            }}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleUser(u)}
                            className="text-destructive"
                          >
                            {u.is_active ? 'Desactivar' : 'Activar'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {isAdmin && (
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-5 text-primary" /> Autenticación en dos pasos
                  </CardTitle>
                  <CardDescription>
                    Protege tu cuenta de administrador de la clínica con un segundo factor usando
                    Microsoft Authenticator u otra app TOTP.
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
                            Tu cuenta requiere el código de verificación al iniciar sesión.
                          </p>
                        </div>
                        <Badge variant="soft-success">Activo</Badge>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="w-full max-w-xs space-y-1.5">
                          <Label>Código actual</Label>
                          <OtpInput value={totpCode} onChange={setTotpCode} disabled={totpCodeLoading} />
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
                        Escanea el código QR con tu aplicación de autenticación y luego ingresa el
                        código de 6 dígitos para activar.
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
                          <Label>Código de 6 dígitos</Label>
                          <OtpInput value={totpCode} onChange={setTotpCode} disabled={totpCodeLoading} />
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
                          además de tu contraseña al entrar a la clínica.
                        </p>
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
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="branches" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {branches.length} sucursales — agenda e inventario independientes
              </p>
              <Button
                size="sm"
                onClick={() => {
                  setEditingBranch(null)
                  setBranchFormOpen(true)
                }}
              >
                <Plus /> Nueva sucursal
              </Button>
            </div>
            {branches.length === 0 ? (
              <EmptyState title="Sin sucursales" description="Crea tu primera sucursal." />
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell>{b.address ?? '—'}</TableCell>
                        <TableCell>{b.phone ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Editar ${b.name}`}
                            onClick={() => {
                              setEditingBranch(b)
                              setBranchFormOpen(true)
                            }}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Eliminar ${b.name}`}
                            className="text-destructive"
                            onClick={() => deleteBranch(b)}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              El catálogo de servicios y precios se gestiona en{' '}
              <Link to="/services" className="font-medium text-primary hover:text-primary-hover">
                Servicios
              </Link>
              .
            </p>
          </TabsContent>

          <TabsContent value="clinic" className="space-y-4">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Datos de la clínica</CardTitle>
                <CardDescription>
                  Identidad del negocio: logo, contacto y datos fiscales.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={saveClinic} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary">
                      {clinic?.logo_url ? (
                        <img src={clinic.logo_url} alt="Logo" className="size-full object-cover" />
                      ) : (
                        <Building2 className="size-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <input
                        id="clinic-logo"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) uploadLogo(f)
                          e.currentTarget.value = ''
                        }}
                      />
                      <Button type="button" variant="outline" size="sm">
                        <label
                          htmlFor="clinic-logo"
                          className="flex cursor-pointer items-center gap-2"
                        >
                          {clinic?.logo_url ? 'Cambiar logo' : 'Subir logo'}
                        </label>
                      </Button>
                      <p className="text-xs text-muted-foreground">JPEG/PNG · máx. 5 MB</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Nombre de la clínica *</Label>
                    <Input
                      value={clinicForm.name}
                      onChange={(e) => setClinicField('name', e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nombre de contacto</Label>
                      <Input
                        value={clinicForm.contact_name}
                        onChange={(e) => setClinicField('contact_name', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Teléfono</Label>
                      <Input
                        value={clinicForm.contact_phone}
                        onChange={(e) => setClinicField('contact_phone', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Correo de contacto</Label>
                    <Input
                      type="email"
                      value={clinicForm.contact_email}
                      onChange={(e) => setClinicField('contact_email', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Dirección</Label>
                    <Input
                      value={clinicForm.address}
                      onChange={(e) => setClinicField('address', e.target.value)}
                      placeholder="Calle, número, colonia, ciudad"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>RFC</Label>
                      <Input
                        value={clinicForm.rfc}
                        onChange={(e) => setClinicField('rfc', e.target.value)}
                        placeholder="Para recibos y facturación"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Razón social</Label>
                      <Input
                        value={clinicForm.fiscal_name}
                        onChange={(e) => setClinicField('fiscal_name', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Zona horaria</Label>
                      <select
                        value={clinicForm.timezone}
                        onChange={(e) => setClinicField('timezone', e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="UTC">UTC</option>
                        <option value="America/Mexico_City">Ciudad de México</option>
                        <option value="America/Monterrey">Monterrey</option>
                        <option value="America/Guadalajara">Guadalajara</option>
                        <option value="America/Tijuana">Tijuana</option>
                        <option value="America/Merida">Mérida</option>
                        <option value="America/Chihuahua">Chihuahua</option>
                        <option value="America/Los_Angeles">Los Ángeles</option>
                        <option value="America/Bogota">Bogotá</option>
                        <option value="America/Lima">Lima</option>
                        <option value="America/Santiago">Santiago</option>
                        <option value="America/Argentina/Buenos_Aires">Buenos Aires</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Moneda</Label>
                      <select
                        value={clinicForm.currency}
                        onChange={(e) => setClinicField('currency', e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="MXN">MXN — Peso mexicano</option>
                        <option value="USD">USD — Dólar</option>
                        <option value="EUR">EUR — Euro</option>
                        <option value="COP">COP — Peso colombiano</option>
                        <option value="PEN">PEN — Sol</option>
                        <option value="CLP">CLP — Peso chileno</option>
                        <option value="ARS">ARS — Peso argentino</option>
                      </select>
                    </div>
                  </div>

                  {clinicSuccess && (
                    <p className="text-sm text-success">Datos de la clínica guardados.</p>
                  )}
                  <Button type="submit" disabled={savingClinic}>
                    {savingClinic ? <Loader2 className="animate-spin" /> : <Save />} Guardar
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        </>
      )}

      <UserFormDialog
        open={userFormOpen}
        user={editingUser}
        onOpenChange={setUserFormOpen}
        onSaved={() => {
          setUserFormOpen(false)
          setEditingUser(null)
          load()
        }}
      />
      <BranchFormDialog
        open={branchFormOpen}
        branch={editingBranch}
        onOpenChange={setBranchFormOpen}
        onSaved={() => {
          setBranchFormOpen(false)
          setEditingBranch(null)
          load()
        }}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.title ?? ''}
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={() => confirm?.onConfirm()}
      />
    </AppLayout>
  )
}
