import { LogOut } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

const ROLE_LABELS: Record<string, string> = {
  'super-admin': 'Panel Super-Admin',
  admin: 'Panel Clínico',
  veterinario: 'Panel Clínico',
  recepcion: 'Panel Clínico',
  owner: 'Portal del Dueño',
}

export function SessionHome() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-card">
        <h1 className="text-xl font-semibold text-foreground">
          {ROLE_LABELS[user?.role ?? ''] ?? 'Bienvenido'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sesión iniciada como <span className="font-medium text-foreground">{user?.role}</span>
          {user?.clinic_id && (
            <>
              {' '}
              · clínica <span className="font-medium text-foreground">{user.clinic_id}</span>
            </>
          )}
        </p>
        <div className="mt-6">
          <Button variant="outline" onClick={logout}>
            <LogOut />
            Cerrar sesión
          </Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Esta pantalla es un placeholder temporal — se reemplaza en las subfases 1.3, 1.7 y 1.8.
        </p>
      </div>
    </div>
  )
}
