export interface NavRoute {
  to: string
  label: string
  component: string
  end?: boolean
}

// Mapa de rutas del panel clínico -> componente requerido.
// Se usa en la sidebar (AppLayout) y en el guard de rutas (ProtectedRoute)
// para que un rol sin acceso no vea ni entre a una pantalla.
export const NAV_ROUTES: NavRoute[] = [
  { to: '/', label: 'Dashboards', component: 'dashboard', end: true },
  { to: '/vaccination-plans', label: 'Planes de vacunación', component: 'vaccination_plans' },
  { to: '/purchase-orders', label: 'Compras', component: 'purchase_orders' },
  { to: '/automation', label: 'Automatización', component: 'automation' },
  { to: '/audit', label: 'Bitácora', component: 'audit' },
  { to: '/reports/financial', label: 'Financiero', component: 'financial' },
  { to: '/templates', label: 'Plantillas', component: 'templates' },
  { to: '/services', label: 'Servicios', component: 'services' },
  { to: '/invoices', label: 'Facturación', component: 'invoices' },
]

export function routeForPath(pathname: string): NavRoute | undefined {
  return NAV_ROUTES.find((r) =>
    r.end ? pathname === r.to : pathname === r.to || pathname.startsWith(`${r.to}/`),
  )
}

export function firstAllowedRoute(hasComponent: (c: string) => boolean): string {
  const route = NAV_ROUTES.find((r) => hasComponent(r.component))
  return route?.to ?? '/'
}
