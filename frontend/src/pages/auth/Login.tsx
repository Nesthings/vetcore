import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  Building2,
  ChevronLeft,
  Loader2,
  Lock,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface LoginResponse {
  access_token: string
}

interface LoginCandidate {
  id: string
  full_name: string
  role: string
  job_title?: string | null
  photo_url?: string | null
}

interface ClinicGroup {
  id: string
  name: string
  users: LoginCandidate[]
}

interface Candidates {
  clinics: ClinicGroup[]
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  veterinario: 'Veterinario',
  recepcion: 'Recepción',
}

function Avatar({ candidate, size = 'md' }: { candidate: LoginCandidate; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'size-16' : 'size-12'
  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-sm font-semibold text-secondary-foreground`}
    >
      {candidate.photo_url ? (
        <img
          src={candidate.photo_url}
          alt={candidate.full_name}
          className="size-full object-cover"
        />
      ) : (
        (candidate.full_name?.[0]?.toUpperCase() ?? (
          <UserRound className="size-6" aria-hidden="true" />
        ))
      )}
    </div>
  )
}

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [candidates, setCandidates] = useState<Candidates | null>(null)
  const [loadingCandidates, setLoadingCandidates] = useState(true)
  const [selected, setSelected] = useState<LoginCandidate | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [ownerMode, setOwnerMode] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')

  const loadCandidates = useCallback(async () => {
    try {
      const res = await apiFetch<Candidates>('/auth/login-candidates')
      setCandidates(res)
    } catch {
      setCandidates(null)
    } finally {
      setLoadingCandidates(false)
    }
  }, [])

  useEffect(() => {
    loadCandidates()
  }, [loadCandidates])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await apiFetch<LoginResponse>('/auth/login/user', {
        method: 'POST',
        body: JSON.stringify({ user_id: selected.id, password }),
      })
      login(res.access_token)
      const from = (location.state as { from?: { pathname: string } } | null)?.from
      navigate(from?.pathname ?? '/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await apiFetch<LoginResponse>('/auth/login/super-admin', {
        method: 'POST',
        body: JSON.stringify({ identifier: ownerEmail, password: ownerPassword }),
      })
      login(res.access_token)
      navigate('/platform', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciales inválidas')
    } finally {
      setSubmitting(false)
    }
  }

  const backToList = () => {
    setSelected(null)
    setPassword('')
    setError(null)
  }

  return (
    <AuthLayout
      title={ownerMode ? 'Acceso del dueño' : 'Iniciar sesión'}
      subtitle={
        ownerMode ? 'Plataforma del producto (super-admin)' : 'Selecciona tu perfil para continuar'
      }
      footer={
        <Link to="/forgot-password" className="font-medium text-primary hover:text-primary-hover">
          ¿Perdiste tu contraseña? Recupérala aquí
        </Link>
      }
    >
      {ownerMode ? (
        <form onSubmit={handleOwnerLogin} className="space-y-4">
          <button
            type="button"
            onClick={() => setOwnerMode(false)}
            className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-hover"
          >
            <ChevronLeft className="size-4" /> Volver al inicio de sesión
          </button>

          <div className="space-y-2">
            <Label htmlFor="owner-email">Correo del dueño</Label>
            <Input
              id="owner-email"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="correo@producto.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner-password">Contraseña</Label>
            <Input
              id="owner-password"
              type="password"
              value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ShieldCheck />}
            {submitting ? 'Entrando…' : 'Entrar a la plataforma'}
          </Button>
        </form>
      ) : selected ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <button
            type="button"
            onClick={backToList}
            className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-hover"
          >
            <ChevronLeft className="size-4" /> Cambiar de perfil
          </button>

          <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3">
            <Avatar candidate={selected} size="lg" />
            <div className="min-w-0">
              <p className="font-medium">{selected.full_name}</p>
              <p className="text-sm text-muted-foreground">
                {ROLE_LABELS[selected.role] ?? selected.role}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-password">Contraseña</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                className="pl-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Lock />}
            {submitting ? 'Entrando…' : 'Iniciar sesión'}
          </Button>
        </form>
      ) : loadingCandidates ? (
        <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
          <Loader2 className="animate-spin" aria-hidden="true" />
          <p className="text-sm">Cargando perfiles…</p>
        </div>
      ) : (
        <div className="space-y-5">
          {candidates && candidates.clinics.length > 0 ? (
            <div className="max-h-[360px] space-y-5 overflow-y-auto pr-1">
              {candidates.clinics.map((clinic) => (
                <div key={clinic.id}>
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Building2 className="size-3.5" aria-hidden="true" />
                    {clinic.name}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {clinic.users.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelected(u)
                          setPassword('')
                          setError(null)
                        }}
                        className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary hover:bg-accent"
                      >
                        <Avatar candidate={u} />
                        <div className="min-w-0 text-center">
                          <p className="truncate text-xs font-medium text-foreground">
                            {u.full_name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {ROLE_LABELS[u.role] ?? u.role}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No hay perfiles todavía. Las clínicas se crean con el enlace de invitación.
            </p>
          )}

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                setOwnerMode(true)
                setError(null)
              }}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Acceso del dueño
            </button>
          </div>
        </div>
      )}
    </AuthLayout>
  )
}
