import {
  CalendarDays,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  PawPrint,
  PackageOpen,
  Receipt,
  Settings2,
  ShoppingCart,
  UserRound,
  Users,
} from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'

import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const role = user?.role

  const NAV_ITEMS: {
    to: string
    label: string
    icon: React.ElementType
    end: boolean
    roles?: string[]
  }[] = [
    { to: '/', label: 'Dashboard del día', icon: LayoutDashboard, end: true },
    { to: '/agenda', label: 'Agenda', icon: CalendarDays, end: false },
    { to: '/pets', label: 'Pacientes', icon: Users, end: false },
    { to: '/inventory', label: 'Inventario', icon: Package, end: false },
    {
      to: '/kits',
      label: 'Kits',
      icon: PackageOpen,
      end: false,
      roles: ['admin', 'veterinario'],
    },
    {
      to: '/purchase-orders',
      label: 'Compras',
      icon: ShoppingCart,
      end: false,
      roles: ['admin'],
    },
    {
      to: '/templates',
      label: 'Plantillas',
      icon: FileText,
      end: false,
      roles: ['admin', 'veterinario'],
    },
    { to: '/services', label: 'Servicios', icon: Settings2, end: false, roles: ['admin'] },
    { to: '/invoices', label: 'Facturación', icon: Receipt, end: false, roles: ['admin'] },
    { to: '/settings', label: 'Configuración', icon: Settings2, end: false, roles: ['admin'] },
  ].filter((i) => !i.roles || (role && i.roles.includes(role)))

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
            <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
              {user?.role?.[0]?.toUpperCase()}
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
        <header className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-background/80 px-6 backdrop-blur">
          <p className="text-sm text-muted-foreground">
            Bienvenido, <span className="font-medium text-foreground">{user?.role}</span>
          </p>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
