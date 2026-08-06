import { Navigate, useLocation } from 'react-router-dom'
import { ShieldX } from 'lucide-react'

import { useAuth } from '@/lib/auth'
import { usePermissions } from '@/lib/permissions'
import { useSetup } from '@/lib/setup'

const ROLE_HOME: Record<string, string> = {
  owner: '/portal',
  admin: '/',
  veterinario: '/',
  recepcion: '/',
}

function AccessDenied() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldX className="size-6" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold">Acceso restringido</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Tu rol no tiene permisos para ver esta sección. Contacta al admin de la clínica.
      </p>
    </div>
  )
}

export function ProtectedRoute({
  children,
  roles,
  component,
}: {
  children: React.ReactNode
  roles?: string[]
  component?: string
}) {
  const { isAuthenticated, user } = useAuth()
  const { hasComponent } = usePermissions()
  const { me, loading: setupLoading } = useSetup()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles && user && !roles.includes(user.role)) {
    return <AccessDenied />
  }

  // El check de componente solo aplica al staff de clínica. Super-admin y
  // owner tienen su propio panel/portal sin componentes.
  const isStaff =
    user?.role === 'admin' || user?.role === 'veterinario' || user?.role === 'recepcion'
  if (isStaff && component && !hasComponent(component)) {
    return <AccessDenied />
  }

  // Wizard de configuración: solo la primera vez que el admin entra a una
  // clínica nueva (setup_completed=false). Fuerza la ruta /setup.
  if (
    user?.role === 'admin' &&
    !setupLoading &&
    me?.setup_completed === false &&
    location.pathname !== '/setup'
  ) {
    return <Navigate to="/setup" replace />
  }

  // Si ya está autenticado y visita una página sin rol específico, lo manda a su home
  if (location.pathname === '/' && user && user.role in ROLE_HOME) {
    const home = ROLE_HOME[user.role]
    if (home !== '/') {
      return <Navigate to={home} replace />
    }
  }

  return children
}
