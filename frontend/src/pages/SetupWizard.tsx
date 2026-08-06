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
  { id: 'super-user', label: 'Super usuario', icon: CircleUserRound },
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
  professional_title: string
  cedula: string
}

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
          job_title: '',
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

  const addTeamRow = () => {
    setTeam((prev) => [
      ...prev,
      {
        full_name: '',
        email: '',
        password: '',
        role: 'veterinario',
        branch_id: branchOptions[0]?.id ?? '',
        professional_title: '',
        cedula: '',
      },
    ])
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
                <h2 className="text-lg font-semibold">Super usuario</h2>
                <p className="text-sm text-muted-foreground">
                  Tu perfil profesional: título, cédula y datos de contacto.
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
                  <Label>Cargo</Label>
                  <Input
                    value={superForm.job_title}
                    onChange={(e) => setSuperForm({ ...superForm, job_title: e.target.value })}
                    placeholder="ej. Director"
                  />
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
                <h2 className="text-lg font-semibold">Equipo</h2>
                <p className="text-sm text-muted-foreground">
                  Agrega a los dependientes: veterinarios y recepción.
                </p>
              </div>
              {team.length === 0 && (
                <p className="rounded-md border border-border/60 bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
                  Puedes agregar el equipo ahora o después en Configuración.
                </p>
              )}
              {team.map((t, i) => (
                <div key={i} className="space-y-3 rounded-md border border-border/60 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Dependiente {i + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setTeam((prev) => prev.filter((_, j) => j !== i))}
                    >
                      Quitar
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Nombre completo *</Label>
                      <Input
                        value={t.full_name}
                        onChange={(e) => setTeamField(i, 'full_name', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Correo *</Label>
                      <Input
                        type="email"
                        value={t.email}
                        onChange={(e) => setTeamField(i, 'email', e.target.value)}
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
                        onChange={(e) => setTeamField(i, 'password', e.target.value)}
                        minLength={8}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Rol *</Label>
                      <select
                        value={t.role}
                        onChange={(e) => setTeamField(i, 'role', e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="veterinario">Veterinario</option>
                        <option value="recepcion">Recepción</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Sucursal</Label>
                      <select
                        value={t.branch_id}
                        onChange={(e) => setTeamField(i, 'branch_id', e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">— Sin sucursal —</option>
                        {branchOptions.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Cédula profesional</Label>
                      <Input
                        value={t.cedula}
                        onChange={(e) => setTeamField(i, 'cedula', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Título profesional</Label>
                    <Input
                      value={t.professional_title}
                      onChange={(e) => setTeamField(i, 'professional_title', e.target.value)}
                    />
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addTeamRow}>
                + Agregar dependiente
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Organigrama</h2>
                <p className="text-sm text-muted-foreground">
                  Define quién reporta a quién (relación jefe–subordinado).
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
                        {ROLE_LABELS[u.role] ?? u.role}
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
                      <option value="">— Sin responsable —</option>
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
                <h2 className="text-lg font-semibold">Accesos a componentes</h2>
                <p className="text-sm text-muted-foreground">
                  Activa o desactiva módulos por usuario (los valores por defecto son según el rol).
                </p>
              </div>
              <div className="space-y-4">
                {users.map((u) => (
                  <div key={u.id} className="rounded-md border border-border/60 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">{u.full_name}</p>
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
                      <div className="grid gap-1.5">
                        {userComponents[u.id].catalog.map((c) => {
                          const isDefault = userComponents[u.id].defaults.includes(c.slug)
                          const checked = accessOverride[u.id]?.[c.slug] ?? false
                          return (
                            <label
                              key={c.slug}
                              className="flex items-center justify-between rounded-md border border-border/50 px-3 py-1.5 text-sm"
                            >
                              <span>
                                {c.label}
                                {isDefault ? (
                                  <span className="ml-1 text-[11px] text-muted-foreground">
                                    (según rol)
                                  </span>
                                ) : null}
                              </span>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setAccessOverride((prev) => ({
                                    ...prev,
                                    [u.id]: { ...prev[u.id], [c.slug]: e.target.checked },
                                  }))
                                }
                              />
                            </label>
                          )
                        })}
                        <p className="text-[11px] text-muted-foreground">
                          {Object.values(accessOverride[u.id] ?? {}).filter(Boolean).length} de{' '}
                          {userComponents[u.id].catalog.length} activos
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
                  {superForm.full_name || 'Super usuario'} · {branchOptions.length} sucursales ·{' '}
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
