import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface PermissionsContextValue {
  components: string[]
  loading: boolean
  hasComponent: (component: string) => boolean
  refresh: () => void
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null)

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [components, setComponents] = useState<string[]>([])
  // Empieza en "loading" cuando hay sesión: evita que una URL directa redirija
  // a inicio antes de que se carguen los componentes (carrera en ProtectedRoute).
  const [loading, setLoading] = useState<boolean>(() => Boolean(user?.clinic_id))

  const load = useCallback(async () => {
    if (!user?.clinic_id) {
      setComponents([])
      return
    }
    setLoading(true)
    try {
      const res = await apiFetch<{ components: string[] }>('/users/me/components')
      setComponents(res.components)
    } catch {
      setComponents([])
    } finally {
      setLoading(false)
    }
  }, [user?.clinic_id])

  useEffect(() => {
    load()
  }, [load])

  const value = useMemo<PermissionsContextValue>(
    () => ({
      components,
      loading,
      hasComponent: (component: string) => components.includes(component),
      refresh: load,
    }),
    [components, loading, load],
  )

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext)
  if (!ctx) {
    throw new Error('usePermissions debe usarse dentro de <PermissionsProvider>')
  }
  return ctx
}
