import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Loader2, Pencil, Plus, Save, Settings2, Trash2, Users } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { BranchFormDialog, type Branch } from '@/components/settings/BranchFormDialog'
import { UserFormDialog, type StaffUser } from '@/components/settings/UserFormDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { apiFetch } from '@/lib/api'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  veterinario: 'Veterinario',
  recepcion: 'Recepción',
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
  const [users, setUsers] = useState<StaffUser[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    if (!confirm(`¿Eliminar la sucursal "${branch.name}"?`)) return
    try {
      await apiFetch(`/branches/${branch.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la sucursal')
    }
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
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">
              <Users className="mr-2 size-4" /> Usuarios
            </TabsTrigger>
            <TabsTrigger value="branches">
              <Settings2 className="mr-2 size-4" /> Sucursales
            </TabsTrigger>
            <TabsTrigger value="clinic">
              <Building2 className="mr-2 size-4" /> Clínica
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
                      <TableHead>Correo</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Sucursal</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>{ROLE_LABELS[u.role] ?? u.role}</TableCell>
                        <TableCell>{u.branch_name ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={u.is_active ? 'success' : 'secondary'}>
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
    </AppLayout>
  )
}
