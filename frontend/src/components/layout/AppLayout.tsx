import {
  History,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PawPrint,
  Receipt,
  Settings2,
  Smartphone,
  UserRound,
} from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'

import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import { usePermissions } from '@/lib/permissions'
import { useNavConfig } from '@/lib/nav-config'
import { MODULE_META, NAV_ROUTES, pageBgForPath } from '@/lib/nav'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

const SIDEBAR_KEY = 'vetcore_sidebar_collapsed'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { hasComponent } = usePermissions()
  const { pinned, pin } = useNavConfig()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const pageBg = pageBgForPath(pathname)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)
  const [clinicName, setClinicName] = useState<string>('')
  const [clinicLogoUrl, setClinicLogoUrl] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [navDragOver, setNavDragOver] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1'
    } catch {
      return false
    }
  })
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
    } catch {
      // sin almacenamiento
    }
  }, [collapsed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setCollapsed((c) => !c)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!user?.clinic_id) return
    let cancelled = false
    Promise.all([
      apiFetch<{ photo_url?: string | null; full_name?: string | null }>('/auth/me'),
      apiFetch<{ name?: string; logo_url?: string | null }>('/clinics/me'),
    ])
      .then(([me, clinic]) => {
        if (cancelled) return
        if (me.photo_url) setAvatarUrl(me.photo_url)
        if (me.full_name) setFullName(me.full_name)
        if (clinic.name) setClinicName(clinic.name)
        if (clinic.logo_url) setClinicLogoUrl(clinic.logo_url)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [user?.clinic_id, user?.sub])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const NAV_ITEMS = NAV_ROUTES.filter(
    (i) =>
      i.component === 'dashboard' || (pinned.includes(i.component) && hasComponent(i.component)),
  ).map((i) => ({
    ...i,
    icon: MODULE_META[i.component].icon,
  }))

  const handleNavDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setNavDragOver(false)
    const component = e.dataTransfer.getData('text/plain')
    if (component && component !== 'dashboard') pin(component)
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const displayName = fullName ?? user?.role ?? ''

  return (
    <div className="flex min-h-screen bg-background">
      {collapsed === false && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px] md:hidden"
          onClick={() => setCollapsed(true)}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-screen flex-col overflow-hidden border-r border-border bg-card bg-gradient-to-b from-primary/10 via-transparent to-transparent transition-[width,transform] duration-300 md:sticky md:top-0 md:translate-x-0',
          collapsed ? '-translate-x-full md:w-0 md:translate-x-0' : 'w-60 translate-x-0',
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <div className="bg-brand-gradient flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-primary-foreground shadow-glow">
            {clinicLogoUrl ? (
              <img src={clinicLogoUrl} alt={clinicName} className="size-full object-cover" />
            ) : (
              <PawPrint className="size-5" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="break-words text-sm font-semibold text-foreground">
              {clinicName || 'VetCore'}
            </p>
            <p className="text-xs text-muted-foreground">Panel clínico</p>
          </div>
        </div>

        <nav
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setNavDragOver(true)
          }}
          onDragLeave={() => setNavDragOver(false)}
          onDrop={handleNavDrop}
          className={cn(
            'flex-1 space-y-1 p-3 transition-colors',
            navDragOver && 'rounded-lg bg-primary/10 outline-2 outline-dashed outline-primary/40',
          )}
        >
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              draggable={item.component !== 'dashboard'}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', item.component)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onClick={() => {
                if (window.innerWidth < 768) setCollapsed(true)
              }}
              title={
                item.component !== 'dashboard'
                  ? 'Arrastra al Inicio para quitar de la barra'
                  : undefined
              }
              className={({ isActive }) =>
                cn(
                  'flex cursor-grab items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 active:cursor-grabbing',
                  isActive
                    ? 'bg-gradient-to-r from-primary to-primary-hover text-primary-foreground shadow-glow'
                    : 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground',
                )
              }
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-border/70 bg-background/80 bg-gradient-to-b from-primary/[0.06] via-transparent to-transparent px-6 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? 'Expandir menú (Ctrl+Shift+B)' : 'Colapsar menú (Ctrl+Shift+B)'}
              aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
              className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden="true" />
              )}
            </button>
            {pathname !== '/' && (
              <NavLink
                to="/"
                className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Volver al inicio"
                aria-label="Volver al inicio"
              >
                <Home className="size-4" aria-hidden="true" />
              </NavLink>
            )}
            <p className="text-sm text-muted-foreground">
              Hola, <span className="font-medium text-foreground">{displayName}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <div ref={profileRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary text-xs font-semibold text-secondary-foreground transition-colors hover:bg-accent"
                aria-label="Menú de perfil"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="size-full object-cover" />
                ) : (
                  <span>{displayName?.[0]?.toUpperCase() ?? user?.role?.[0]?.toUpperCase()}</span>
                )}
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-dialog">
                  <div className="border-b border-border px-3 py-2.5">
                    <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                    <p className="text-xs capitalize text-muted-foreground">{user?.role}</p>
                  </div>
                  <NavLink
                    to="/profile"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <UserRound className="size-4" aria-hidden="true" />
                    Ver perfil
                  </NavLink>
                  {hasComponent('settings') && (
                    <NavLink
                      to="/settings"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 border-t border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Settings2 className="size-4" aria-hidden="true" />
                      Configuración de la clínica
                    </NavLink>
                  )}
                  {hasComponent('audit') && (
                    <NavLink
                      to="/audit"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 border-t border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <History className="size-4" aria-hidden="true" />
                      Bitácora
                    </NavLink>
                  )}
                  {hasComponent('invoices') && (
                    <NavLink
                      to="/invoices"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 border-t border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Receipt className="size-4" aria-hidden="true" />
                      Facturación
                    </NavLink>
                  )}
                  {user?.role === 'admin' || user?.role === 'veterinario' ? (
                    <NavLink
                      to="/movil"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 border-t border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Smartphone className="size-4" aria-hidden="true" />
                      Modo veterinario (móvil)
                    </NavLink>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 border-t border-border px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-accent"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div
          className={cn('p-6', pageBg && 'bg-gradient-to-b via-transparent to-transparent', pageBg)}
        >
          {children}
        </div>
      </main>
    </div>
  )
}
