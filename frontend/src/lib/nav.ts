import {
  BedDouble,
  BellRing,
  CalendarDays,
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
  pageBg?: string
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
  { to: '/services', label: 'Servicios', component: 'services' },
  { to: '/hospitalizacion', label: 'Hospitalización', component: 'hospitalizacion' },
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
    pageBg: 'from-red-100/80 dark:from-red-500/[0.12]',
  },
  waitlist: {
    icon: Timer,
    desc: 'Espera de citas',
    text: 'text-orange-700 dark:text-orange-300',
    iconBg: 'bg-orange-500/15',
    img: '/module_pics/lista_espera.jpeg',
    tint: 'bg-orange-100 dark:bg-orange-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(249,115,22,0.5)]',
    pageBg: 'from-orange-100/80 dark:from-orange-500/[0.12]',
  },
  pets: {
    icon: Users,
    desc: 'Expedientes clínicos',
    text: 'text-sky-700 dark:text-sky-300',
    iconBg: 'bg-sky-500/15',
    img: '/module_pics/pacientes.jpeg',
    tint: 'bg-sky-100 dark:bg-sky-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(14,165,233,0.5)]',
    pageBg: 'from-sky-100/80 dark:from-sky-500/[0.12]',
  },
  inventory: {
    icon: Package,
    desc: 'Inventario y lotes',
    text: 'text-violet-700 dark:text-violet-300',
    iconBg: 'bg-violet-500/15',
    img: '/module_pics/insumos.jpeg',
    tint: 'bg-violet-100 dark:bg-violet-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(168,85,247,0.5)]',
    pageBg: 'from-violet-100/80 dark:from-violet-500/[0.12]',
  },
  products: {
    icon: ShoppingBag,
    desc: 'Catálogo de venta',
    text: 'text-emerald-700 dark:text-emerald-300',
    iconBg: 'bg-emerald-500/15',
    img: '/module_pics/tienda.jpeg',
    tint: 'bg-emerald-100 dark:bg-emerald-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(16,185,129,0.5)]',
    pageBg: 'from-emerald-100/80 dark:from-emerald-500/[0.12]',
  },
  vaccination_plans: {
    icon: Syringe,
    desc: 'Esquemas y citas',
    text: 'text-pink-700 dark:text-pink-300',
    iconBg: 'bg-pink-500/15',
    img: '/module_pics/planes_de_vac.jpeg',
    tint: 'bg-pink-100 dark:bg-pink-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(236,72,153,0.5)]',
    pageBg: 'from-pink-100/80 dark:from-pink-500/[0.12]',
  },
  purchase_orders: {
    icon: ShoppingCart,
    desc: 'Órdenes de compra',
    text: 'text-emerald-700 dark:text-emerald-300',
    iconBg: 'bg-emerald-500/15',
    img: '/module_pics/compras.jpeg',
    tint: 'bg-emerald-100 dark:bg-emerald-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(16,185,129,0.5)]',
    pageBg: 'from-emerald-100/80 dark:from-emerald-500/[0.12]',
  },
  automation: {
    icon: BellRing,
    desc: 'Recordatorios',
    text: 'text-purple-700 dark:text-purple-300',
    iconBg: 'bg-purple-500/15',
    img: '/module_pics/recordatorios.jpeg',
    tint: 'bg-purple-100 dark:bg-purple-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(168,85,247,0.5)]',
    pageBg: 'from-purple-100/80 dark:from-purple-500/[0.12]',
  },
  audit: {
    icon: History,
    desc: 'Bitácora',
    text: 'text-slate-700 dark:text-slate-300',
    iconBg: 'bg-slate-500/15',
    pageBg: 'from-slate-100/80 dark:from-slate-500/[0.12]',
  },
  financial: {
    icon: Receipt,
    desc: 'Ingresos y gastos',
    text: 'text-amber-700 dark:text-amber-300',
    iconBg: 'bg-amber-500/15',
    img: '/module_pics/finanzas.jpeg',
    tint: 'bg-amber-100 dark:bg-amber-500/15',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(245,158,11,0.5)]',
    pageBg: 'from-amber-100/80 dark:from-amber-500/[0.12]',
  },
  services: {
    icon: Settings2,
    desc: 'Servicios y precios',
    text: 'text-orange-600 dark:text-orange-300',
    iconBg: 'bg-orange-500/15',
    img: '/module_pics/servicios.jpeg',
    tint: 'bg-[#ffe3d3] dark:bg-[#ffb59c]/20',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(255,160,122,0.55)]',
    pageBg: 'from-[#ffe3d3]/80 dark:from-[#ffb59c]/20',
  },
  invoices: {
    icon: Receipt,
    desc: 'Facturación',
    text: 'text-pink-700 dark:text-pink-300',
    iconBg: 'bg-pink-500/15',
    pageBg: 'from-pink-100/80 dark:from-pink-500/[0.12]',
  },
  hospitalizacion: {
    icon: BedDouble,
    desc: 'Pacientes hospitalizados',
    text: 'text-orange-500 dark:text-orange-200',
    iconBg: 'bg-orange-500/15',
    img: '/module_pics/hospitalizacion.jpeg',
    tint: 'bg-[#fff0e6] dark:bg-[#ffd9c4]/25',
    glow: 'hover:shadow-[0_10px_30px_-6px_rgba(255,180,150,0.5)]',
    pageBg: 'from-[#fff0e6]/80 dark:from-[#ffd9c4]/25',
  },
}

export function routeForPath(pathname: string): NavRoute | undefined {
  return NAV_ROUTES.find((r) =>
    r.end ? pathname === r.to : pathname === r.to || pathname.startsWith(`${r.to}/`),
  )
}

// Color de fondo de página según el módulo activo (mismo color que su tarjeta).
// Las sub-páginas (consulta/venta) heredan el color del módulo relacionado.
export function pageBgForPath(pathname: string): string | undefined {
  if (pathname === '/consultas/nueva') return MODULE_META.pets.pageBg
  if (pathname === '/ventas/nueva') return MODULE_META.products.pageBg
  if (pathname.startsWith('/pets/')) return MODULE_META.pets.pageBg
  const route = routeForPath(pathname)
  return route ? MODULE_META[route.component]?.pageBg : undefined
}

export function firstAllowedRoute(hasComponent: (c: string) => boolean): string {
  const route = NAV_ROUTES.find((r) => hasComponent(r.component))
  return route?.to ?? '/'
}
