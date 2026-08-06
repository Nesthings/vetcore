import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

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

export interface StaffUser {
  id: string
  full_name: string
  email: string
  role: string
  branch_id: string | null
  branch_name?: string | null
  is_active: boolean
  photo_url?: string | null
  professional_title?: string | null
  cedula?: string | null
  job_title?: string | null
  description?: string | null
  specialty?: string | null
}

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'veterinario', label: 'Veterinario' },
  { value: 'recepcion', label: 'Recepción' },
]

export function UserFormDialog({
  open,
  user,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  user: StaffUser | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('veterinario')
  const [branchId, setBranchId] = useState('')
  const [professionalTitle, setProfessionalTitle] = useState('')
  const [cedula, setCedula] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFullName(user?.full_name ?? '')
    setEmail(user?.email ?? '')
    setPassword('')
    setRole(user?.role ?? 'veterinario')
    setBranchId(user?.branch_id ?? '')
    setProfessionalTitle(user?.professional_title ?? '')
    setCedula(user?.cedula ?? '')
    setJobTitle(user?.job_title ?? '')
    setSpecialty(user?.specialty ?? '')
    setError(null)
    apiFetch<{ id: string; name: string }[]>('/branches')
      .then(setBranches)
      .catch(() => undefined)
  }, [open, user])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (user) {
        const body: Record<string, unknown> = {
          full_name: fullName,
          role,
          branch_id: branchId || null,
          professional_title: professionalTitle || null,
          cedula: cedula || null,
          job_title: jobTitle || null,
          specialty: specialty || null,
        }
        if (password) body.password = password
        await apiFetch(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      } else {
        await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({
            full_name: fullName,
            email,
            password,
            role,
            branch_id: branchId || null,
            professional_title: professionalTitle || null,
            cedula: cedula || null,
            job_title: jobTitle || null,
            specialty: specialty || null,
          }),
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el usuario')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
          <DialogDescription>
            {user
              ? 'Actualiza el rol, sucursal o contraseña.'
              : 'Crea una cuenta de staff para la clínica.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="space-y-2">
            <Label>Nombre completo *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          {!user && (
            <div className="space-y-2">
              <Label>Correo *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Rol *</Label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Sucursal</Label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Sin sucursal —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Título profesional</Label>
              <Input
                value={professionalTitle}
                onChange={(e) => setProfessionalTitle(e.target.value)}
                placeholder="ej. MVZ"
              />
            </div>
            <div className="space-y-2">
              <Label>Cédula profesional</Label>
              <Input
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                placeholder="ej. 1234567"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="ej. Cirujano"
              />
            </div>
            <div className="space-y-2">
              <Label>Especialidad</Label>
              <Input
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="ej. Dermatología"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{user ? 'Nueva contraseña (opcional)' : 'Contraseña *'}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={user ? undefined : 8}
              required={!user}
              placeholder={user ? 'Dejar vacío para no cambiar' : 'Mínimo 8 caracteres'}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
