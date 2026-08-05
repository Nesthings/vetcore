import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '@/lib/auth'

const ROLE_HOME: Record<string, string> = {
  'super-admin': '/super-admin',
  owner: '/portal',
  admin: '/',
  veterinario: '/',
  recepcion: '/',
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
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
