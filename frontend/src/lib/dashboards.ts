export type ChartKind =
  'donut' | 'barh' | 'area' | 'heatmap' | 'funnel' | 'pie' | 'radar' | 'line' | 'radial' | 'stacked'

export interface DashboardDef {
  slug: string
  title: string
  desc: string
  chart: ChartKind
}

export const DASHBOARD_CATALOG: DashboardDef[] = [
  {
    slug: 'species',
    title: 'Población por especie',
    desc: 'Distribución de pacientes por especie',
    chart: 'donut',
  },
  {
    slug: 'new_pets',
    title: 'Altas de pacientes',
    desc: 'Nuevos pacientes por mes (6 meses)',
    chart: 'area',
  },
  {
    slug: 'appt_heatmap',
    title: 'Ocupación de la agenda',
    desc: 'Citas por día de la semana y hora (14 días)',
    chart: 'heatmap',
  },
  {
    slug: 'appt_funnel',
    title: 'Embudo de la cita',
    desc: 'Agendadas → confirmadas → completadas → encuestadas',
    chart: 'funnel',
  },
  {
    slug: 'procedures',
    title: 'Procedimientos de citas',
    desc: 'Tipos de cita más frecuentes',
    chart: 'pie',
  },
  {
    slug: 'vet_load',
    title: 'Carga por veterinario',
    desc: 'Citas, completadas, consultas y no-show',
    chart: 'radar',
  },
  {
    slug: 'breeds',
    title: 'Razas top',
    desc: 'Las 8 razas más registradas',
    chart: 'barh',
  },
  {
    slug: 'vaccination',
    title: 'Cumplimiento de vacunación',
    desc: 'Dosis completadas / programadas / omitidas',
    chart: 'donut',
  },
  {
    slug: 'upcoming_doses',
    title: 'Próximas dosis',
    desc: 'Dosis de vacunación por día (60 días)',
    chart: 'line',
  },
  {
    slug: 'stock_levels',
    title: 'Niveles de stock',
    desc: 'Productos agotados, bajos y sanos',
    chart: 'radial',
  },
  {
    slug: 'inv_movements',
    title: 'Movimientos de inventario',
    desc: 'Entradas vs salidas por mes (6 meses)',
    chart: 'stacked',
  },
  {
    slug: 'reasons',
    title: 'Motivos de consulta',
    desc: 'Motivos más frecuentes (30 días)',
    chart: 'barh',
  },
]

export const CHART_LABELS: Record<ChartKind, string> = {
  donut: 'Dona',
  barh: 'Barras',
  area: 'Área',
  heatmap: 'Mapa de calor',
  funnel: 'Embudo',
  pie: 'Pastel',
  radar: 'Radar',
  line: 'Línea',
  radial: 'Radial',
  stacked: 'Apilada',
}

export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f59e0b',
  '#3b82f6',
]

export function getDashboard(slug: string): DashboardDef | undefined {
  return DASHBOARD_CATALOG.find((d) => d.slug === slug)
}
