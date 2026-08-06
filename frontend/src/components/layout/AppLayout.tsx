import {
  BellRing,
  CalendarDays,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  PawPrint,
  Receipt,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  History,
  Timer,
  UserRound,
  Users,
  Syringe,
} from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import { usePermissions } from '@/lib/permissions'
import { NAV_ROUTES } from '@/lib/nav'
import { NotificationBell } from '@/components/layout/NotificationBell'

const NAV_ICONS: Record<string, React.ElementType> = {
  dashboard: LayoutDashboard,
  agenda: CalendarDays,
  waitlist: Timer,
  pets: Users,
  inventory: Package,
  products: ShoppingBag,
  vaccination_plans: Syringe,
  purchase_orders: ShoppingCart,
  automation: BellRing,
  audit: History,
  financial: Receipt,
  templates: FileText,
  services: Settings2,
  invoices: Receipt,
  settings: Settings2,
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { hasComponent } = usePermissions()
  const navigate = useNavigate()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.clinic_id) return
    let cancelled = false
    apiFetch<{ photo_url?: string | null }>('/auth/me')
      .then((me) => {
        if (!cancelled && me.photo_url) setAvatarUrl(me.photo_url)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [user?.clinic_id, user?.sub])

  const NAV_ITEMS = NAV_ROUTES.filter((i) => hasComponent(i.component)).map((i) => ({
    ...i,
    icon: NAV_ICONS[i.component] ?? LayoutDashboard,
  }))

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 flex h-screen w-60 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PawPrint className="size-5" aria-hidden="true" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">VetCore</p>
            <p className="text-xs text-muted-foreground">Panel clínico</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center gap-2 px-1">
            <div className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
              {avatarUrl ? (
                <img src={avatarUrl} alt={user?.role ?? ''} className="size-full object-cover" />
              ) : (
                user?.role?.[0]?.toUpperCase()
              )}
            </div>
            <div className="leading-tight">
              <p className="text-xs font-medium text-foreground">{user?.role}</p>
              <p className="text-[11px] text-muted-foreground">
                Clínica {user?.clinic_id?.slice(0, 8)}
              </p>
            </div>
          </div>
          <NavLink
            to="/profile"
            className="mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <UserRound className="size-4" aria-hidden="true" />
            Mi perfil
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
          <p className="text-sm text-muted-foreground">
            Bienvenido, <span className="font-medium text-foreground">{user?.role}</span>
          </p>
          <NotificationBell />
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
