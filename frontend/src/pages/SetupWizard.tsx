import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Loader2,
  MapPin,
  Network,
  PawPrint,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useSetup } from '@/lib/setup'

const STEPS = [
  { id: 'clinic', label: 'Clínica', icon: Building2 },
  { id: 'super-user', label: 'Administrador', icon: CircleUserRound },
  { id: 'branches', label: 'Sucursales', icon: MapPin },
  { id: 'team', label: 'Equipo', icon: UserPlus },
  { id: 'org', label: 'Organigrama', icon: Network },
  { id: 'access', label: 'Accesos', icon: ShieldCheck },
  { id: 'done', label: 'Listo', icon: Sparkles },
]

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

interface Branch {
  id: string
  name: string
  address?: string | null
}

interface StaffUser {
  id: string
  full_name: string
  email: string
  role: string
  branch_id?: string | null
  professional_title?: string | null
  cedula?: string | null
  job_title?: string | null
}

interface UserComponents {
  catalog: { slug: string; label: string }[]
  defaults: string[]
  overrides: Record<string, boolean>
  effective: string[]
}

interface TeamMember {
  full_name: string
  email: string
  password: string
  role: string
  branch_id: string
  job_title: string
  professional_title: string
  cedula: string
}

const PUESTOS = [
  'Director(a)',
  'Encargado(a) de sucursal',
  'Veterinario(a)',
  'Cirujano(a)',
  'Dermatólogo(a)',
  'Recepción',
  'Auxiliar',
  'Administrativo(a)',
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  veterinario: 'Veterinario',
  recepcion: 'Recepción',
}

export function SetupWizard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { refresh } = useSetup()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [clinicForm, setClinicForm] = useState({
    name: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    address: '',
    rfc: '',
    fiscal_name: '',
    timezone: 'America/Mexico_City',
    currency: 'MXN',
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const [superForm, setSuperForm] = useState({
    full_name: '',
    professional_title: '',
    cedula: '',
    job_title: '',
    specialty: '',
    phone: '',
  })
  const [superPhoto, setSuperPhoto] = useState<File | null>(null)

  const [newBranches, setNewBranches] = useState<{ name: string; address: string }[]>([])
  const [branchOptions, setBranchOptions] = useState<{ id: string; name: string }[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [users, setUsers] = useState<StaffUser[]>([])
  const [reportsTo, setReportsTo] = useState<Record<string, string>>({})
  const [userComponents, setUserComponents] = useState<Record<string, UserComponents>>({})
  const [accessOverride, setAccessOverride] = useState<Record<string, Record<string, boolean>>>({})

  const loadData = useCallback(async () => {
    try {
      const [c, br, us] = await Promise.all([
        apiFetch<ClinicProfile>('/clinics/me'),
        apiFetch<Branch[]>('/branches'),
        apiFetch<StaffUser[]>('/users'),
      ])
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
      setLogoUrl(c.logo_url ?? null)
      setBranchOptions(br.map((b) => ({ id: b.id, name: b.name })))
      setUsers(us)
      const me = us.find((u) => u.id === user?.sub)
      if (me) {
        setSuperForm({
          full_name: me.full_name,
          professional_title: me.professional_title ?? '',
          cedula: me.cedula ?? '',
          job_title: me.job_title ?? '',
          specialty: '',
          phone: '',
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración')
    }
  }, [user?.sub])

  useEffect(() => {
    loadData()
  }, [loadData])

  const saveStep = async () => {
    setError(null)
    setSaving(true)
    try {
      if (step === 0) {
        await apiFetch('/clinics/me', {
          method: 'PATCH',
          body: JSON.stringify(clinicForm),
        })
        if (logoFile) {
          const form = new FormData()
          form.append('file', logoFile)
          await apiFetch('/clinics/me/logo', { method: 'POST', body: form })
        }
      } else if (step === 1) {
        await apiFetch('/users/me', {
          method: 'PATCH',
          body: JSON.stringify(superForm),
        })
        if (superPhoto && user?.sub) {
          const form = new FormData()
          form.append('file', superPhoto)
          await apiFetch(`/users/${user.sub}/photo`, { method: 'POST', body: form })
        }
      } else if (step === 2) {
        const valid = newBranches.filter((b) => b.name.trim())
        for (const b of valid) {
          await apiFetch('/branches', {
            method: 'POST',
            body: JSON.stringify({ name: b.name.trim(), address: b.address.trim() || null }),
          })
        }
        const br = await apiFetch<Branch[]>('/branches')
        setBranchOptions(br.map((b) => ({ id: b.id, name: b.name })))
      } else if (step === 3) {
        const valid = team.filter((t) => t.full_name.trim() && t.email.trim())
        for (const t of valid) {
          await apiFetch('/users', {
            method: 'POST',
            body: JSON.stringify({
              full_name: t.full_name.trim(),
              email: t.email.trim(),
              password: t.password,
              role: t.role,
              branch_id: t.branch_id || null,
              job_title: t.job_title.trim() || null,
              professional_title: t.professional_title.trim() || null,
              cedula: t.cedula.trim() || null,
            }),
          })
        }
        const us = await apiFetch<StaffUser[]>('/users')
        setUsers(us)
        setReportsTo((prev) => {
          const next = { ...prev }
          for (const u of us) {
            if (!next[u.id]) next[u.id] = ''
          }
          return next
        })
      } else if (step === 4) {
        for (const [uid, mid] of Object.entries(reportsTo)) {
          if (!mid) continue
          await apiFetch(`/users/${uid}`, {
            method: 'PATCH',
            body: JSON.stringify({ reports_to: mid }),
          })
        }
      } else if (step === 5) {
        for (const [uid, overrides] of Object.entries(accessOverride)) {
          if (!overrides) continue
          const defaults = userComponents[uid]?.defaults ?? []
          const diffs: Record<string, boolean> = {}
          for (const [slug, checked] of Object.entries(overrides)) {
            const isDefault = defaults.includes(slug)
            if (checked !== isDefault) diffs[slug] = checked
          }
          await apiFetch(`/users/${uid}/components`, {
            method: 'PUT',
            body: JSON.stringify({ overrides: diffs }),
          })
        }
      } else if (step === 6) {
        await apiFetch('/clinics/me', {
          method: 'PATCH',
          body: JSON.stringify({ setup_completed: true }),
        })
        await refresh()
        navigate('/', { replace: true })
        return
      }
      setStep((s) => s + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar este paso')
    } finally {
      setSaving(false)
    }
  }

  const goBack = () => {
    setError(null)
    setStep((s) => Math.max(0, s - 1))
  }

  const loadComponentsForUser = async (uid: string) => {
    try {
      const res = await apiFetch<UserComponents>(`/users/${uid}/components`)
      setUserComponents((prev) => ({ ...prev, [uid]: res }))
      setAccessOverride((prev) => {
        const overrides: Record<string, boolean> = {}
        for (const c of res.catalog) {
          overrides[c.slug] = res.effective.includes(c.slug)
        }
        return { ...prev, [uid]: overrides }
      })
    } catch {
      /* sin componentes aún */
    }
  }

  const setTeamField = (idx: number, field: keyof TeamMember, value: string) => {
    setTeam((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)))
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-elevated">
          <PawPrint className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Configura tu clínica
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Antes de empezar, dejemos lista tu clínica en VetCore. Esta pantalla solo aparece la
          primera vez.
        </p>
      </div>

      <div className="w-full max-w-2xl">
        <ol className="mb-6 flex flex-wrap items-center gap-1">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1">
              <span
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  i < step
                    ? 'bg-success/10 text-success'
                    : i === step
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground'
                }`}
              >
                <s.icon className="size-3.5" aria-hidden="true" />
                {i < step ? <Check className="size-3.5" /> : s.label}
              </span>
              {i < STEPS.length - 1 && <span className="text-muted-foreground">·</span>}
            </li>
          ))}
        </ol>

        <div className="rounded-xl border border-border bg-card p-8 shadow-card">
          {error && (
            <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Tu clínica</h2>
                <p className="text-sm text-muted-foreground">Nombre, logo y datos de contacto.</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary">
                  {logoFile ? (
                    <img
                      src={URL.createObjectURL(logoFile)}
                      alt="Logo nuevo"
                      className="size-full object-cover"
                    />
                  ) : logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="size-full object-cover" />
                  ) : (
                    <Building2 className="size-6 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <input
                    id="setup-logo"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  />
                  <Button type="button" variant="outline" size="sm">
                    <label htmlFor="setup-logo" className="cursor-pointer">
                      {logoFile || logoUrl ? 'Cambiar logo' : 'Elegir logo'}
                    </label>
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Nombre de la clínica *</Label>
                <Input
                  value={clinicForm.name}
                  onChange={(e) => setClinicForm({ ...clinicForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre de contacto</Label>
                  <Input
                    value={clinicForm.contact_name}
                    onChange={(e) => setClinicForm({ ...clinicForm, contact_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    value={clinicForm.contact_phone}
                    onChange={(e) =>
                      setClinicForm({ ...clinicForm, contact_phone: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Correo de contacto</Label>
                <Input
                  type="email"
                  value={clinicForm.contact_email}
                  onChange={(e) => setClinicForm({ ...clinicForm, contact_email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Dirección</Label>
                <Input
                  value={clinicForm.address}
                  onChange={(e) => setClinicForm({ ...clinicForm, address: e.target.value })}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Administrador</h2>
                <p className="text-sm text-muted-foreground">
                  Tu perfil profesional: título, cédula y datos de contacto.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Como administrador tendrás acceso a todo: configuración, sucursales, equipo,
                  citas, expedientes, inventario y finanzas de la clínica.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary">
                  {superPhoto ? (
                    <img
                      src={URL.createObjectURL(superPhoto)}
                      alt="Foto nueva"
                      className="size-full object-cover"
                    />
                  ) : (
                    <CircleUserRound className="size-8 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <input
                    id="setup-photo"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setSuperPhoto(e.target.files?.[0] ?? null)}
                  />
                  <Button type="button" variant="outline" size="sm">
                    <label htmlFor="setup-photo" className="cursor-pointer">
                      Elegir foto
                    </label>
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Nombre completo *</Label>
                <Input
                  value={superForm.full_name}
                  onChange={(e) => setSuperForm({ ...superForm, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Título profesional</Label>
                  <Input
                    value={superForm.professional_title}
                    onChange={(e) =>
                      setSuperForm({ ...superForm, professional_title: e.target.value })
                    }
                    placeholder="ej. MVZ"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cédula profesional</Label>
                  <Input
                    value={superForm.cedula}
                    onChange={(e) => setSuperForm({ ...superForm, cedula: e.target.value })}
                    placeholder="ej. 1234567"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cargo / puesto</Label>
                  <select
                    value={superForm.job_title}
                    onChange={(e) => setSuperForm({ ...superForm, job_title: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">— Elegir puesto —</option>
                    {PUESTOS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Especialidad</Label>
                  <Input
                    value={superForm.specialty}
                    onChange={(e) => setSuperForm({ ...superForm, specialty: e.target.value })}
                    placeholder="ej. Cirugía"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={superForm.phone}
                  onChange={(e) => setSuperForm({ ...superForm, phone: e.target.value })}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Sucursales</h2>
                <p className="text-sm text-muted-foreground">
                  Define cuántas sucursales tendrá tu clínica y sus nombres.
                </p>
              </div>
              {newBranches.length === 0 && branchOptions.length === 0 && (
                <p className="rounded-md border border-border/60 bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
                  Agrega tu primera sucursal (ej. «Sucursal Centro»).
                </p>
              )}
              {branchOptions.length > 0 && (
                <p className="rounded-md border border-border/60 bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
                  Ya existentes: {branchOptions.map((b) => b.name).join(', ')}. Agrega nuevas si
                  quieres más.
                </p>
              )}
              <div className="space-y-3">
                {newBranches.map((b, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-3">
                    <div className="space-y-1.5">
                      <Label>Nombre</Label>
                      <Input
                        value={b.name}
                        onChange={(e) =>
                          setNewBranches((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        placeholder="Nombre de la sucursal"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Dirección</Label>
                      <Input
                        value={b.address}
                        onChange={(e) =>
                          setNewBranches((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)),
                          )
                        }
                        placeholder="Calle, número, colonia"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-end text-destructive"
                      onClick={() => setNewBranches((prev) => prev.filter((_, j) => j !== i))}
                    >
                      Quitar
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewBranches((prev) => [...prev, { name: '', address: '' }])}
              >
                + Agregar sucursal
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Dependientes por sucursal</h2>
                <p className="text-sm text-muted-foreground">
                  Agrega al equipo y asígnalo a su sucursal y puesto. Cada uno verá su propio panel
                  según su rol.
                </p>
              </div>

              {branchOptions.length === 0 && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  Primero define al menos una sucursal en el paso anterior.
                </p>
              )}

              {branchOptions.map((b) => {
                const members = team.filter((t) => t.branch_id === b.id)
                return (
                  <div key={b.id} className="rounded-md border border-border/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {members.length} dependiente{members.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    {members.length === 0 && (
                      <p className="mb-3 text-sm text-muted-foreground">
                        Sin dependientes asignados todavía.
                      </p>
                    )}
                    {members.map((t, i) => {
                      const globalIdx = team.indexOf(t)
                      return (
                        <div
                          key={i}
                          className="mb-3 space-y-3 rounded-md border border-border/50 p-3"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">
                              {t.full_name || 'Nuevo dependiente'} ·{' '}
                              <span className="font-normal text-muted-foreground">
                                {t.job_title || 'sin puesto'}
                              </span>
                            </p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() =>
                                setTeam((prev) => prev.filter((_, j) => j !== globalIdx))
                              }
                            >
                              Quitar
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label>Nombre completo *</Label>
                              <Input
                                value={t.full_name}
                                onChange={(e) =>
                                  setTeamField(globalIdx, 'full_name', e.target.value)
                                }
                                required
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Correo *</Label>
                              <Input
                                type="email"
                                value={t.email}
                                onChange={(e) => setTeamField(globalIdx, 'email', e.target.value)}
                                required
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label>Contraseña *</Label>
                              <Input
                                type="password"
                                value={t.password}
                                onChange={(e) =>
                                  setTeamField(globalIdx, 'password', e.target.value)
                                }
                                minLength={8}
                                required
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Puesto *</Label>
                              <select
                                value={t.job_title}
                                onChange={(e) =>
                                  setTeamField(globalIdx, 'job_title', e.target.value)
                                }
                                required
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              >
                                <option value="">— Elegir puesto —</option>
                                {PUESTOS.map((p) => (
                                  <option key={p} value={p}>
                                    {p}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label>Rol de acceso *</Label>
                              <select
                                value={t.role}
                                onChange={(e) => setTeamField(globalIdx, 'role', e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              >
                                <option value="veterinario">Veterinario</option>
                                <option value="recepcion">Recepción</option>
                                <option value="admin">Admin</option>
                              </select>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Cédula profesional</Label>
                              <Input
                                value={t.cedula}
                                onChange={(e) => setTeamField(globalIdx, 'cedula', e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Título profesional</Label>
                            <Input
                              value={t.professional_title}
                              onChange={(e) =>
                                setTeamField(globalIdx, 'professional_title', e.target.value)
                              }
                              placeholder="ej. MVZ"
                            />
                          </div>
                        </div>
                      )
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setTeam((prev) => [
                          ...prev,
                          {
                            full_name: '',
                            email: '',
                            password: '',
                            role: 'veterinario',
                            branch_id: b.id,
                            job_title: '',
                            professional_title: '',
                            cedula: '',
                          },
                        ])
                      }
                    >
                      + Agregar dependiente a {b.name}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Organigrama y encargados</h2>
                <p className="text-sm text-muted-foreground">
                  Define quién es encargado de quién (jefe–subordinado) dentro de cada sucursal.
                </p>
              </div>
              <div className="space-y-2">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{u.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.job_title ?? ROLE_LABELS[u.role] ?? u.role}
                      </p>
                    </div>
                    <select
                      value={reportsTo[u.id] ?? ''}
                      onChange={(e) =>
                        setReportsTo((prev) => ({ ...prev, [u.id]: e.target.value }))
                      }
                      aria-label={`Reporta a ${u.full_name}`}
                      className="h-8 w-48 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">— Sin encargado —</option>
                      {users
                        .filter((x) => x.id !== u.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.full_name}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Privilegios</h2>
                <p className="text-sm text-muted-foreground">
                  Activa o desactiva el acceso a cada pantalla del panel por usuario.
                </p>
              </div>
              <div className="space-y-4">
                {users.map((u) => (
                  <div key={u.id} className="rounded-md border border-border/60 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {u.full_name}
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => loadComponentsForUser(u.id)}
                      >
                        Cargar módulos
                      </Button>
                    </div>
                    {userComponents[u.id] ? (
                      <div className="space-y-1.5">
                        {userComponents[u.id].catalog.map((c) => {
                          const checked = accessOverride[u.id]?.[c.slug] ?? false
                          return (
                            <div
                              key={c.slug}
                              className="flex items-center justify-between rounded-md border border-border/50 px-3 py-1.5 text-sm"
                            >
                              <span>{c.label}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setAccessOverride((prev) => ({
                                    ...prev,
                                    [u.id]: { ...prev[u.id], [c.slug]: !checked },
                                  }))
                                }
                                aria-pressed={checked}
                                className={`flex h-7 w-14 items-center rounded-full px-1 transition-colors ${
                                  checked ? 'justify-end bg-success' : 'justify-start bg-secondary'
                                }`}
                              >
                                <span className="flex size-5 items-center justify-center rounded-full bg-background text-[10px] font-semibold text-foreground shadow-sm">
                                  {checked ? 'SÍ' : 'NO'}
                                </span>
                              </button>
                            </div>
                          )
                        })}
                        <p className="text-[11px] text-muted-foreground">
                          {Object.values(accessOverride[u.id] ?? {}).filter(Boolean).length} de{' '}
                          {userComponents[u.id].catalog.length} pantallas activas
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Presiona «Cargar módulos» para editar.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">¡Todo listo!</h2>
                <p className="text-sm text-muted-foreground">
                  Tu clínica quedó configurada. Al continuar entrarás al panel.
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-secondary/50 px-4 py-3 text-sm">
                <p className="font-medium">{clinicForm.name}</p>
                <p className="text-muted-foreground">
                  {superForm.full_name || 'Administrador'} · {branchOptions.length} sucursales ·{' '}
                  {users.length} miembros del equipo
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={goBack} disabled={step === 0 || saving}>
              <ChevronLeft /> Atrás
            </Button>
            <Button type="button" onClick={saveStep} disabled={saving}>
              {saving ? (
                <Loader2 className="animate-spin" />
              ) : step === STEPS.length - 1 ? (
                <Check />
              ) : (
                <ChevronRight />
              )}
              {step === STEPS.length - 1 ? 'Entrar al panel' : 'Continuar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
