import { createContext, useContext, useEffect, useState } from 'react'

import { useAuth } from '@/lib/auth'

const DEFAULT_ACTIVE = ['species', 'new_pets', 'appt_heatmap', 'vet_load', 'appt_funnel']

interface DashboardConfigValue {
  active: string[]
  add: (slug: string) => void
  remove: (slug: string) => void
}

const DashboardConfigContext = createContext<DashboardConfigValue | null>(null)

function storageKey(userId: string | undefined) {
  return `vetcore_dashboards_${userId ?? 'guest'}`
}

function loadActive(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === 'string')
    }
  } catch {
    // sin almacenamiento
  }
  return DEFAULT_ACTIVE
}

export function DashboardConfigProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const key = storageKey(user?.sub)
  const [active, setActive] = useState<string[]>(() => loadActive(key))

  useEffect(() => {
    setActive(loadActive(key))
  }, [key])

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(active))
    } catch {
      // sin almacenamiento
    }
  }, [key, active])

  const value: DashboardConfigValue = {
    active,
    add: (slug) => setActive((list) => (list.includes(slug) ? list : [...list, slug])),
    remove: (slug) => setActive((list) => list.filter((s) => s !== slug)),
  }

  return <DashboardConfigContext.Provider value={value}>{children}</DashboardConfigContext.Provider>
}

export function useDashboardConfig(): DashboardConfigValue {
  const ctx = useContext(DashboardConfigContext)
  if (!ctx) {
    throw new Error('useDashboardConfig debe usarse dentro de <DashboardConfigProvider>')
  }
  return ctx
}
