import {
  History,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PawPrint,
  Receipt,
  ScanLine,
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
import { MODULE_META, NAV_ROUTES } from '@/lib/nav'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { QrScannerModal, requestCameraPermission } from '@/components/layout/QrScannerModal'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

const SIDEBAR_KEY = 'vetcore_sidebar_collapsed'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { hasComponent } = usePermissions()
  const { pinned, pin } = useNavConfig()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [clinicName, setClinicName] = useState<string>('')
  const [clinicLogoUrl, setClinicLogoUrl] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
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
    if (!user?.clinic_id) {
      setProfileLoading(false)
      return
    }
    let cancelled = false
    setProfileLoading(true)
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
      .finally(() => {
        if (!cancelled) setProfileLoading(false)
      })
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

  const principalItems = NAV_ITEMS.filter((i) => i.component === 'dashboard')
  const moduleItems = NAV_ITEMS.filter((i) => i.component !== 'dashboard')

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

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'group flex cursor-grab items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150 active:cursor-grabbing',
      collapsed && 'justify-center px-2',
      isActive
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground',
    )

  const renderNavItem = (item: (typeof NAV_ITEMS)[number]) => (
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
          ? collapsed
            ? item.label
            : 'Arrastra al Inicio para quitar de la barra'
          : item.label
      }
      className={navLinkClass}
    >
      <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  )

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
          'fixed inset-y-0 left-0 z-40 flex h-screen flex-col overflow-hidden border-r border-border bg-card transition-[width,transform] duration-100 ease-out md:sticky md:top-0 md:translate-x-0',
          collapsed ? 'w-16 -translate-x-full md:w-16 md:translate-x-0' : 'w-64 translate-x-0',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2.5 border-b border-border px-4 py-4',
            collapsed && 'justify-center px-2',
          )}
        >
          <div className="bg-brand-gradient flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl text-primary-foreground shadow-card">
            {clinicLogoUrl ? (
              <img src={clinicLogoUrl} alt={clinicName} className="size-full object-cover" />
            ) : (
              <PawPrint className="size-5" aria-hidden="true" />
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="break-words font-display text-sm font-semibold text-foreground">
                {clinicName || 'VetCore'}
              </p>
              <p className="text-xs text-muted-foreground">Panel clínico</p>
            </div>
          )}
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
            'flex-1 space-y-4 overflow-y-auto p-3 transition-colors',
            navDragOver && 'rounded-lg bg-primary/10 outline-2 outline-dashed outline-primary/40',
          )}
        >
          <div className="space-y-1">
            {!collapsed && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                Principal
              </p>
            )}
            {principalItems.map(renderNavItem)}
          </div>
          {moduleItems.length > 0 && (
            <div className="space-y-1">
              {!collapsed && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                  Módulos
                </p>
              )}
              {moduleItems.map(renderNavItem)}
            </div>
          )}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-border/80 bg-background/85 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? 'Expandir menú (Ctrl+Shift+B)' : 'Colapsar menú (Ctrl+Shift+B)'}
              aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
              className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-card transition-colors hover:bg-accent hover:text-foreground"
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
                className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-card transition-colors hover:bg-accent hover:text-foreground"
                title="Volver al inicio"
                aria-label="Volver al inicio"
              >
                <Home className="size-4" aria-hidden="true" />
              </NavLink>
            )}
            {profileLoading ? (
              <span className="ml-1 hidden h-4 w-32 animate-pulse rounded bg-secondary sm:block" />
            ) : (
              <p className="ml-1 hidden text-sm text-muted-foreground sm:block">
                Hola, <span className="font-semibold text-foreground">{displayName}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={async () => {
                await requestCameraPermission()
                setQrOpen(true)
              }}
              className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
              title="Escanear QR de la cartilla"
              aria-label="Escanear QR"
            >
              <ScanLine className="size-4" aria-hidden="true" />
            </button>
            <NotificationBell />
            <div ref={profileRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex size-9 items-center justify-center overflow-hidden rounded-full border-2 border-primary/30 bg-secondary text-xs font-semibold text-secondary-foreground transition-colors hover:bg-accent"
                aria-label="Menú de perfil"
              >
                {profileLoading ? (
                  <span className="block size-full animate-pulse bg-secondary" />
                ) : avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="size-full object-cover" />
                ) : (
                  <span>{displayName?.[0]?.toUpperCase() ?? user?.role?.[0]?.toUpperCase()}</span>
                )}
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-dialog">
                  <div className="border-b border-border bg-muted/40 px-3 py-3">
                    <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {user?.role === 'admin'
                        ? 'Administrador'
                        : user?.role === 'super-admin'
                          ? 'Administrador de plataforma'
                          : user?.role === 'veterinario'
                            ? 'Veterinario'
                            : user?.role === 'recepcion'
                              ? 'Recepción'
                              : user?.role}
                    </p>
                  </div>
                  <div className="p-1.5">
                    <NavLink
                      to="/profile"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <UserRound className="size-4" aria-hidden="true" />
                      Ver perfil
                    </NavLink>
                    {hasComponent('settings') && (
                      <NavLink
                        to="/settings"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <Settings2 className="size-4" aria-hidden="true" />
                        Configuración de la clínica
                      </NavLink>
                    )}
                    {hasComponent('audit') && (
                      <NavLink
                        to="/audit"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <History className="size-4" aria-hidden="true" />
                        Bitácora
                      </NavLink>
                    )}
                    {hasComponent('invoices') && (
                      <NavLink
                        to="/invoices"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <Receipt className="size-4" aria-hidden="true" />
                        Facturación
                      </NavLink>
                    )}
                    {user?.role === 'admin' || user?.role === 'veterinario' ? (
                      <NavLink
                        to="/movil"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <Smartphone className="size-4" aria-hidden="true" />
                        Modo veterinario (móvil)
                      </NavLink>
                    ) : null}
                  </div>
                  <div className="border-t border-border p-1.5">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <LogOut className="size-4" aria-hidden="true" />
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="flex-1 p-4 sm:p-6">{children}</div>
      </main>

      <QrScannerModal open={qrOpen} onOpenChange={setQrOpen} />
    </div>
  )
}
