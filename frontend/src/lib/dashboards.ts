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
    slug: 'stock_alerts',
    title: 'Alertas de stock',
    desc: 'Productos de inventario bajo el umbral',
    chart: 'stacked',
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
  {
    slug: 'smart_alerts',
    title: 'Alertas inteligentes',
    desc: 'Pacientes que requieren atención',
    chart: 'stacked',
  },
  {
    slug: 'hosp_admissions',
    title: 'Ingresos de hospitalización',
    desc: 'Pacientes internados por día',
    chart: 'area',
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
