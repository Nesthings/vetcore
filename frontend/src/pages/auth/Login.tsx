import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2, Lock } from 'lucide-react'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface LoginResponse {
  access_token: string
}

const ROLE_TARGETS: Record<string, string> = {
  staff: '/api/v1/auth/login',
  owner: '/api/v1/auth/login/owner',
  'super-admin': '/api/v1/auth/login/super-admin',
}

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState('staff')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await apiFetch<LoginResponse>(ROLE_TARGETS[tab], {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
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

  return (
    <AuthLayout
      title="Iniciar sesión"
      subtitle="Accede según tu tipo de cuenta"
      footer={
        <>
          <span className="text-muted-foreground">¿Perdiste tu contraseña? </span>
          <Link to="/forgot-password" className="font-medium text-primary hover:text-primary-hover">
            Recupérala aquí
          </Link>
        </>
      }
    >
      <Tabs defaultValue="staff" onValueChange={(v) => setTab(v)} className="mb-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="staff">Clínica</TabsTrigger>
          <TabsTrigger value="owner">Dueño</TabsTrigger>
          <TabsTrigger value="super-admin">Super Admin</TabsTrigger>
        </TabsList>
      </Tabs>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="identifier">{tab === 'owner' ? 'Correo o teléfono' : 'Correo'}</Label>
          <Input
            id="identifier"
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={tab === 'owner' ? 'correo@ejemplo.com o +52...' : 'correo@ejemplo.com'}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              className="pl-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
          {submitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Entrando…
            </>
          ) : (
            'Iniciar sesión'
          )}
        </Button>
      </form>
    </AuthLayout>
  )
}
