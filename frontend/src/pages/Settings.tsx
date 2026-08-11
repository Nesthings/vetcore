import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  Cake,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Save,
  Send,
  Settings2,
  Trash2,
  Unplug,
  Users,
} from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { BranchFormDialog, type Branch } from '@/components/settings/BranchFormDialog'
import { UserFormDialog, type StaffUser } from '@/components/settings/UserFormDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/api'

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
  birthday_message?: string | null
  birthday_send_email?: boolean
  birthday_send_whatsapp?: boolean
}

const DEFAULT_BIRTHDAY_MESSAGE =
  '🎂 ¡Feliz cumpleaños {mascota}! 🎉 Hoy cumples {edad} años. Te deseamos un año más de salud, juego y cariño. — {clínica}'

interface WhatsAppStatus {
  enabled: boolean
  phone_number?: string | null
  phone_number_id?: string | null
  business_account_id?: string | null
  token_configured: boolean
  reminder_template?: string | null
  birthday_template?: string | null
  receipt_template?: string | null
  receipt_document_template?: string | null
  cartilla_template?: string | null
  template_language?: string
}

export function Settings() {
  const [users, setUsers] = useState<StaffUser[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ title: string; onConfirm: () => void } | null>(null)

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

  const [birthdayMessage, setBirthdayMessage] = useState(DEFAULT_BIRTHDAY_MESSAGE)
  const [birthdaySendEmail, setBirthdaySendEmail] = useState(false)
  const [birthdaySendWhatsapp, setBirthdaySendWhatsapp] = useState(false)
  const [savingBirthday, setSavingBirthday] = useState(false)
  const [birthdaySuccess, setBirthdaySuccess] = useState(false)

  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null)
  const [waPhone, setWaPhone] = useState('')
  const [waPhoneId, setWaPhoneId] = useState('')
  const [waBusinessId, setWaBusinessId] = useState('')
  const [waToken, setWaToken] = useState('')
  const [waTestNumber, setWaTestNumber] = useState('')
  const [waReminderTemplate, setWaReminderTemplate] = useState('')
  const [waBirthdayTemplate, setWaBirthdayTemplate] = useState('')
  const [waReceiptTemplate, setWaReceiptTemplate] = useState('')
  const [waReceiptDocTemplate, setWaReceiptDocTemplate] = useState('')
  const [waCartillaTemplate, setWaCartillaTemplate] = useState('')
  const [waLanguage, setWaLanguage] = useState('es_MX')
  const [waSaving, setWaSaving] = useState(false)
  const [waTestBusy, setWaTestBusy] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [u, b, c] = await Promise.all([
        apiFetch<StaffUser[]>('/users'),
        apiFetch<Branch[]>('/branches'),
        apiFetch<ClinicProfile>('/clinics/me'),
      ])
      const wa = await apiFetch<WhatsAppStatus>('/clinics/me/whatsapp')
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
      setBirthdayMessage(c.birthday_message || DEFAULT_BIRTHDAY_MESSAGE)
      setBirthdaySendEmail(Boolean(c.birthday_send_email))
      setBirthdaySendWhatsapp(Boolean(c.birthday_send_whatsapp))
      setWaStatus(wa)
      setWaPhone(wa.phone_number ?? '')
      setWaPhoneId(wa.phone_number_id ?? '')
      setWaBusinessId(wa.business_account_id ?? '')
      setWaTestNumber(wa.phone_number ?? '')
      setWaReminderTemplate(wa.reminder_template ?? '')
      setWaBirthdayTemplate(wa.birthday_template ?? '')
      setWaReceiptTemplate(wa.receipt_template ?? '')
      setWaReceiptDocTemplate(wa.receipt_document_template ?? '')
      setWaCartillaTemplate(wa.cartilla_template ?? '')
      setWaLanguage(wa.template_language ?? 'es_MX')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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

  const saveBirthday = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingBirthday(true)
    setBirthdaySuccess(false)
    setError(null)
    try {
      await apiFetch('/clinics/me', {
        method: 'PATCH',
        body: JSON.stringify({
          birthday_message: birthdayMessage,
          birthday_send_email: birthdaySendEmail,
          birthday_send_whatsapp: birthdaySendWhatsapp,
        }),
      })
      setBirthdaySuccess(true)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el mensaje de cumpleaños')
    } finally {
      setSavingBirthday(false)
    }
  }

  const saveWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault()
    setWaSaving(true)
    setError(null)
    try {
      const res = await apiFetch<WhatsAppStatus>('/clinics/me/whatsapp', {
        method: 'PUT',
        body: JSON.stringify({
          phone_number: waPhone || null,
          phone_number_id: waPhoneId || null,
          business_account_id: waBusinessId || null,
          access_token: waToken || null,
          reminder_template: waReminderTemplate || null,
          birthday_template: waBirthdayTemplate || null,
          receipt_template: waReceiptTemplate || null,
          receipt_document_template: waReceiptDocTemplate || null,
          cartilla_template: waCartillaTemplate || null,
          template_language: waLanguage,
        }),
      })
      setWaStatus(res)
      setWaToken('')
      toast({
        title: 'WhatsApp guardado',
        description: res.enabled ? 'Cuenta vinculada correctamente.' : 'Revisa que los datos sean correctos.',
        variant: res.enabled ? 'success' : 'warning',
      })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la configuración de WhatsApp')
    } finally {
      setWaSaving(false)
    }
  }

  const testWhatsapp = async () => {
    const to = waTestNumber.trim() || waPhone.trim()
    if (!to) {
      setError('Indica un número para la prueba o usa el teléfono configurado.')
      return
    }
    setWaTestBusy(true)
    setError(null)
    try {
      const res = await apiFetch<{ ok: boolean; external_id?: string | null; error?: string | null }>(
        '/clinics/me/whatsapp/test',
        { method: 'POST', body: JSON.stringify({ to }) },
      )
      if (res.ok) {
        toast({
          title: 'Mensaje de prueba enviado',
          description: `Se envió a ${to}. Revisa el WhatsApp.`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'No se pudo enviar la prueba',
          description: res.error ?? 'Error de conexión con Meta.',
          variant: 'error',
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo probar la conexión')
    } finally {
      setWaTestBusy(false)
    }
  }

  const disableWhatsapp = async () => {
    setError(null)
    try {
      const res = await apiFetch<WhatsAppStatus>('/clinics/me/whatsapp/disable', { method: 'POST' })
      setWaStatus(res)
      setWaPhone('')
      setWaPhoneId('')
      setWaBusinessId('')
      setWaToken('')
      toast({ title: 'WhatsApp desvinculado', variant: 'info' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desvincular WhatsApp')
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
                        <TableCell className="font-medium">{u.full_name}</TableCell>
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

        <Card className="mt-6 shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cake className="size-5 text-pink-500" aria-hidden="true" /> Mensaje de cumpleaños
            </CardTitle>
            <CardDescription>
              Personaliza la felicitación que se envía a los dueños cuando su mascota cumple años,
              y por qué canales.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveBirthday} className="space-y-4">
              <div className="space-y-2">
                <Label>Mensaje</Label>
                <Textarea
                  value={birthdayMessage}
                  onChange={(e) => setBirthdayMessage(e.target.value)}
                  rows={4}
                  placeholder={DEFAULT_BIRTHDAY_MESSAGE}
                />
                <p className="text-xs text-muted-foreground">
                  Puedes usar{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                    {'{mascota}'}
                  </code>
                  ,{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{'{edad}'}</code>,{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{'{dueño}'}</code> y{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{'{clínica}'}</code>{' '}
                  como marcadores de posición.
                </p>
              </div>

              <div className="space-y-3">
                <Label>Canales de envío</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
                    <Checkbox
                      checked={birthdaySendEmail}
                      onCheckedChange={(c) => setBirthdaySendEmail(Boolean(c))}
                    />
                    <Mail className="size-4 text-primary" aria-hidden="true" />
                    <span className="text-sm">Enviar por correo</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
                    <Checkbox
                      checked={birthdaySendWhatsapp}
                      onCheckedChange={(c) => setBirthdaySendWhatsapp(Boolean(c))}
                    />
                    <MessageCircle className="size-4 text-success" aria-hidden="true" />
                    <span className="text-sm">Enviar por WhatsApp</span>
                  </label>
                </div>
              </div>

              {birthdaySuccess && (
                <p className="text-sm text-success">Mensaje de cumpleaños guardado.</p>
              )}
              <Button type="submit" disabled={savingBirthday}>
                {savingBirthday ? <Loader2 className="animate-spin" /> : <Save />} Guardar
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="mt-6 shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="size-5 text-success" aria-hidden="true" /> WhatsApp Business
            </CardTitle>
            <CardDescription>
              Vincula tu cuenta de WhatsApp Business (Meta Cloud API) para automatizar mensajes:
              recordatorios de citas, felicitaciones de cumpleaños y resumen de recibos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {waStatus?.enabled ? (
                <Badge variant="soft-success">Conectado</Badge>
              ) : (
                <Badge variant="soft-secondary">No configurado</Badge>
              )}
              {waStatus?.token_configured && (
                <span className="text-xs text-muted-foreground">Token configurado</span>
              )}
            </div>

            <form onSubmit={saveWhatsapp} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Teléfono de negocio</Label>
                  <Input
                    value={waPhone}
                    onChange={(e) => setWaPhone(e.target.value)}
                    placeholder="+5215512345678"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number ID</Label>
                  <Input
                    value={waPhoneId}
                    onChange={(e) => setWaPhoneId(e.target.value)}
                    placeholder="Ej. 1285324297995234"
                  />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp Business Account ID</Label>
                  <Input
                    value={waBusinessId}
                    onChange={(e) => setWaBusinessId(e.target.value)}
                    placeholder="Ej. 2223863378181788"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Access Token</Label>
                  <Input
                    type="password"
                    value={waToken}
                    onChange={(e) => setWaToken(e.target.value)}
                    placeholder="Pega tu token de acceso (EAA…)"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={waSaving}>
                  {waSaving ? <Loader2 className="animate-spin" /> : <Save />} Guardar
                </Button>
                <Button type="button" variant="outline" onClick={testWhatsapp} disabled={waTestBusy}>
                  {waTestBusy ? <Loader2 className="animate-spin" /> : <Send />} Probar conexión
                </Button>
                {waStatus?.enabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    onClick={disableWhatsapp}
                  >
                    <Unplug /> Desvincular
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label>Número de prueba (opcional)</Label>
                <Input
                  value={waTestNumber}
                  onChange={(e) => setWaTestNumber(e.target.value)}
                  placeholder="+15556617103"
                />
                <p className="text-xs text-muted-foreground">
                  La prueba se envía a este número; si lo dejas vacío se usa el teléfono de negocio
                  configurado.
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="mb-2 text-sm font-medium">Plantillas de mensajes (recomendado)</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Meta solo entrega mensajes fuera de la ventana de 24h mediante plantillas
                  aprobadas. Crea las plantillas en tu cuenta de WhatsApp Business y escribe aquí su
                  nombre. Si una queda vacía, VetCore intenta con texto libre.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Recordatorio de cita</Label>
                    <Input
                      value={waReminderTemplate}
                      onChange={(e) => setWaReminderTemplate(e.target.value)}
                      placeholder="recordatorio_cita"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Parámetros: {'{mascota}'}, fecha, hora
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cumpleaños</Label>
                    <Input
                      value={waBirthdayTemplate}
                      onChange={(e) => setWaBirthdayTemplate(e.target.value)}
                      placeholder="feliz_cumpleaños"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Parámetros: {'{mascota}'}, edad, {'{clínica}'}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Recibo</Label>
                    <Input
                      value={waReceiptTemplate}
                      onChange={(e) => setWaReceiptTemplate(e.target.value)}
                      placeholder="recibo_compra"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Parámetros: {'{clínica}'}, folio, total
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Recibo con PDF (cabecera)</Label>
                    <Input
                      value={waReceiptDocTemplate}
                      onChange={(e) => setWaReceiptDocTemplate(e.target.value)}
                      placeholder="recibo_compra_pdf"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Plantilla con header de documento para entregar el PDF fuera de la ventana 24h.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cartilla</Label>
                    <Input
                      value={waCartillaTemplate}
                      onChange={(e) => setWaCartillaTemplate(e.target.value)}
                      placeholder="envio_cartilla"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Parámetros: {'{mascota}'}, {'{enlace}'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 w-full sm:w-48">
                  <Label>Idioma de la plantilla</Label>
                  <select
                    value={waLanguage}
                    onChange={(e) => setWaLanguage(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="es_MX">Español (MX) — es_MX</option>
                    <option value="en_US">Inglés (US) — en_US</option>
                  </select>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
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
