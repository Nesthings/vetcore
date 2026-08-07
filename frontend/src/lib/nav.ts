import {
  BellRing,
  CalendarDays,
  FileText,
  History,
  Home,
  Package,
  Receipt,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  Syringe,
  Timer,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavRoute {
  to: string
  label: string
  component: string
  end?: boolean
}

export interface ModuleMeta {
  icon: LucideIcon
  desc: string
  text: string
  iconBg: string
  img?: string
  imgGif?: string
  tint?: string
  glow?: string
}

// Catálogo completo de módulos del panel clínico.
// Se usa en el sidebar (AppLayout) y en las tarjetas de "Módulos" del Inicio.
export const NAV_ROUTES: NavRoute[] = [
  { to: '/', label: 'Inicio', component: 'dashboard', end: true },
  { to: '/agenda', label: 'Agenda', component: 'agenda' },
  { to: '/waitlist', label: 'Lista de espera', component: 'waitlist' },
  { to: '/pets', label: 'Pacientes', component: 'pets' },
  { to: '/inventory', label: 'Insumos', component: 'inventory' },
  { to: '/products', label: 'Productos', component: 'products' },
  { to: '/vaccination-plans', label: 'Planes de vacunación', component: 'vaccination_plans' },
  { to: '/purchase-orders', label: 'Compras', component: 'purchase_orders' },
  { to: '/automation', label: 'Recordatorios', component: 'automation' },
  { to: '/reports/financial', label: 'Finanzas', component: 'financial' },
  { to: '/templates', label: 'Plantillas', component: 'templates' },
  { to: '/services', label: 'Servicios', component: 'services' },
  { to: '/invoices', label: 'Facturación', component: 'invoices' },
]

export const MODULE_META: Record<string, ModuleMeta> = {
  dashboard: { icon: Home, desc: 'Resumen del día', text: 'text-primary', iconBg: 'bg-primary/15' },
  agenda: {
    icon: CalendarDays,
    desc: 'Citas y horarios',
    text: 'text-red-700 dark:text-red-300',
    iconBg: 'bg-red-500/15',
    img: '/module_pics/agenda.png',
    tint: 'bg-red-100 dark:bg-red-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(239,68,68,0.5)]',
  },
  waitlist: {
    icon: Timer,
    desc: 'Espera de citas',
    text: 'text-orange-700 dark:text-orange-300',
    iconBg: 'bg-orange-500/15',
    img: '/module_pics/lista_espera.jpeg',
    tint: 'bg-orange-100 dark:bg-orange-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(249,115,22,0.5)]',
  },
  pets: {
    icon: Users,
    desc: 'Expedientes clínicos',
    text: 'text-sky-700 dark:text-sky-300',
    iconBg: 'bg-sky-500/15',
    img: '/module_pics/pacientes.jpeg',
    tint: 'bg-sky-100 dark:bg-sky-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(14,165,233,0.5)]',
  },
  inventory: {
    icon: Package,
    desc: 'Inventario y lotes',
    text: 'text-violet-700 dark:text-violet-300',
    iconBg: 'bg-violet-500/15',
    img: '/module_pics/insumos.jpeg',
    tint: 'bg-violet-100 dark:bg-violet-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(168,85,247,0.5)]',
  },
  products: {
    icon: ShoppingBag,
    desc: 'Catálogo de venta',
    text: 'text-emerald-700 dark:text-emerald-300',
    iconBg: 'bg-emerald-500/15',
    img: '/module_pics/tienda.png',
    tint: 'bg-emerald-100 dark:bg-emerald-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(16,185,129,0.5)]',
  },
  vaccination_plans: {
    icon: Syringe,
    desc: 'Esquemas y citas',
    text: 'text-pink-700 dark:text-pink-300',
    iconBg: 'bg-pink-500/15',
    img: '/module_pics/planes_de_vac.jpeg',
    tint: 'bg-pink-100 dark:bg-pink-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(236,72,153,0.5)]',
  },
  purchase_orders: {
    icon: ShoppingCart,
    desc: 'Órdenes de compra',
    text: 'text-emerald-700 dark:text-emerald-300',
    iconBg: 'bg-emerald-500/15',
    img: '/module_pics/compras.png',
    tint: 'bg-emerald-100 dark:bg-emerald-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(16,185,129,0.5)]',
  },
  automation: {
    icon: BellRing,
    desc: 'Recordatorios',
    text: 'text-emerald-700 dark:text-emerald-300',
    iconBg: 'bg-emerald-500/15',
    img: '/module_pics/recordatorios.jpeg',
    tint: 'bg-emerald-100 dark:bg-emerald-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(16,185,129,0.5)]',
  },
  audit: {
    icon: History,
    desc: 'Bitácora',
    text: 'text-slate-700 dark:text-slate-300',
    iconBg: 'bg-slate-500/15',
  },
  financial: {
    icon: Receipt,
    desc: 'Ingresos y gastos',
    text: 'text-amber-700 dark:text-amber-300',
    iconBg: 'bg-amber-500/15',
    img: '/module_pics/finanzas.jpeg',
    tint: 'bg-amber-100 dark:bg-amber-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(245,158,11,0.5)]',
  },
  templates: {
    icon: FileText,
    desc: 'Plantillas',
    text: 'text-lime-700 dark:text-lime-300',
    iconBg: 'bg-lime-500/15',
  },
  services: {
    icon: Settings2,
    desc: 'Servicios y precios',
    text: 'text-orange-600 dark:text-orange-300',
    iconBg: 'bg-orange-500/15',
    img: '/module_pics/servicios.jpeg',
    tint: 'bg-[#ffe3d3] dark:bg-[#ffb59c]/20',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(255,160,122,0.55)]',
  },
  invoices: {
    icon: Receipt,
    desc: 'Facturación',
    text: 'text-pink-700 dark:text-pink-300',
    iconBg: 'bg-pink-500/15',
  },
}

export function routeForPath(pathname: string): NavRoute | undefined {
  return NAV_ROUTES.find((r) =>
    r.end ? pathname === r.to : pathname === r.to || pathname.startsWith(`${r.to}/`),
  )
}

export function firstAllowedRoute(hasComponent: (c: string) => boolean): string {
  const route = NAV_ROUTES.find((r) => hasComponent(r.component))
  return route?.to ?? '/'
}
