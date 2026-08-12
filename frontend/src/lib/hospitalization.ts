import { CheckCircle2, CircleAlert, Clock3, Info, TriangleAlert } from 'lucide-react'

export type HospStatus =
  | 'planned'
  | 'admitted'
  | 'active'
  | 'discharge_pending'
  | 'discharged'
  | 'cancelled'

export type OperationalStatus = 'stable' | 'monitoring' | 'delicate' | 'critical'
export type IsolationStatus = 'normal' | 'precaution' | 'isolation'
export type MonitoringLevel = 'basic' | 'intermediate' | 'intensive'

export interface HospPet {
  id: string
  name: string
  species: string | null
  breed: string | null
  sex: string | null
  photo_url: string | null
  birth_date: string | null
  latest_weight_kg: number | null
}

export interface HospOwner {
  owner_id: string
  full_name: string | null
  phone: string | null
}

export interface HospAccommodation {
  id: string
  code: string
  name: string
  type: string
  capacity: number
}

export interface HospVet {
  id: string
  full_name: string
}

export interface HospitalizationItem {
  id: string
  clinic_id: string
  branch_id: string
  pet_id: string
  status: HospStatus
  accommodation_id: string | null
  vet_user_id: string | null
  reason: string | null
  diagnosis: string | null
  monitoring_level: MonitoringLevel | null
  operational_status: OperationalStatus
  isolation_status: IsolationStatus
  admitted_at: string | null
  expected_discharge_at: string | null
  actual_discharge_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  elapsed_minutes: number
  pet: HospPet | null
  owner: HospOwner | null
  accommodation: HospAccommodation | null
  vet: HospVet | null
}

export interface Accommodation {
  id: string
  clinic_id: string
  branch_id: string
  code: string
  name: string
  type: string
  capacity: number
  status: string
  max_isolation: string
  active: boolean
  created_at: string
}

export interface OccupancyAccommodation {
  id: string
  code: string
  name: string
  type: string
  capacity: number
  status: string
  max_isolation: string
  active_count: number
  occupied: boolean
}

export interface HospOverview {
  summary: {
    active: number
    critical: number
    monitoring: number
    delicate: number
    isolation: number
    discharge_pending: number
    admitted_today: number
    expected_discharge_today: number
  }
  accommodations: OccupancyAccommodation[]
}

export const ACCOMMODATION_TYPE_LABELS: Record<string, string> = {
  general: 'General',
  uci: 'UCI',
  isolation: 'Aislamiento',
  recovery: 'Recuperación',
  postop: 'Postoperatorio',
  other: 'Otro',
}

export interface HospTask {
  id: string
  clinic_id: string
  hospitalization_id: string
  type: string
  description: string
  scheduled_at: string
  priority: string
  status: 'pending' | 'completed' | 'overdue' | 'skipped' | 'cancelled'
  assigned_user_id: string | null
  completed_by: string | null
  completed_at: string | null
  observation: string | null
  created_at: string
  overdue?: boolean
}

export const TASK_TYPE_LABELS: Record<string, string> = {
  vitals: 'Signos vitales',
  medication: 'Medicamento',
  feeding: 'Alimentación',
  hydration: 'Hidratación',
  review: 'Revisión',
  procedure: 'Procedimiento',
  cleaning: 'Limpieza',
  photo: 'Fotografía',
  lab: 'Laboratorio',
  visit: 'Visita',
  other: 'Otra',
}

export const TASK_PRIORITY_META: Record<string, { label: string; badge: 'default' | 'secondary' | 'warning' | 'destructive' }> = {
  low: { label: 'Baja', badge: 'secondary' },
  normal: { label: 'Normal', badge: 'default' },
  high: { label: 'Alta', badge: 'warning' },
  critical: { label: 'Crítica', badge: 'destructive' },
}

export interface HospVital {
  id: string
  clinic_id: string
  hospitalization_id: string
  parameter: string
  value: number | null
  unit: string | null
  observed_at: string
  user_id: string | null
  observation: string | null
  created_at: string
}

export const VITAL_PARAM_LABELS: Record<string, string> = {
  temperature: 'Temperatura',
  heart_rate: 'Frec. cardíaca',
  respiratory_rate: 'Frec. respiratoria',
  weight: 'Peso',
  spo2: 'SpO2',
  blood_pressure: 'Presión arterial',
  glucose: 'Glucosa',
  pain: 'Dolor',
  hydration: 'Hidratación',
  mucous_membranes: 'Mucosas',
  crt: 'TRC',
  consciousness: 'Conciencia',
}

export const VITAL_PARAM_UNITS: Record<string, string> = {
  temperature: '°C',
  heart_rate: 'lpm',
  respiratory_rate: 'rpm',
  weight: 'kg',
  spo2: '%',
  blood_pressure: 'mmHg',
  glucose: 'mg/dL',
  pain: '/10',
}

export const MONITORING_VITAL_PARAMS: Record<MonitoringLevel, string[]> = {
  basic: ['temperature', 'heart_rate', 'respiratory_rate'],
  intermediate: ['temperature', 'heart_rate', 'respiratory_rate', 'weight', 'pain'],
  intensive: ['temperature', 'heart_rate', 'respiratory_rate', 'spo2', 'glucose', 'blood_pressure', 'weight', 'pain'],
}

export const CHARTABLE_VITALS = ['temperature', 'heart_rate', 'respiratory_rate', 'weight', 'spo2', 'glucose']

export interface MedAdministration {
  id: string
  scheduled_at: string
  status: 'pending' | 'administered' | 'skipped' | 'refused' | 'cancelled'
  administered_at: string | null
  administered_by: string | null
  dose_actual: string | null
  route_actual: string | null
  observation: string | null
}

export interface MedOrder {
  id: string
  name: string
  inventory_product_id: string | null
  dose: string | null
  unit: string | null
  route: string | null
  interval_hours: number | null
  start_at: string
  end_at: string | null
  observations: string | null
  vet_user_id: string | null
  active: boolean
  administrations: MedAdministration[]
}

export const ADMIN_STATUS_META: Record<
  MedAdministration['status'],
  { label: string; badge: 'default' | 'success' | 'warning' | 'secondary' | 'destructive' }
> = {
  pending: { label: 'Pendiente', badge: 'default' },
  administered: { label: 'Administrada', badge: 'success' },
  skipped: { label: 'Omitida', badge: 'warning' },
  refused: { label: 'Rechazada', badge: 'destructive' },
  cancelled: { label: 'Cancelada', badge: 'secondary' },
}

export interface HospFeed {
  id: string
  diet: string | null
  type: string | null
  amount_offered: number | null
  amount_consumed: number | null
  unit: string | null
  offered_at: string
  rejected: boolean
  vomited: boolean
  observations: string | null
}

export interface HospFluid {
  id: string
  solution: string | null
  route: string | null
  rate: number | null
  rate_unit: string | null
  volume: number | null
  unit: string | null
  started_at: string
  ended_at: string | null
  observations: string | null
}

export interface HospElimination {
  id: string
  kind: 'urine' | 'feces' | 'vomit'
  present: boolean
  quantity: string | null
  consistency: string | null
  observations: string | null
  observed_at: string
}

export interface HospPain {
  id: string
  score: number
  scale: string | null
  observed_at: string
  observations: string | null
}

export const ELIMINATION_LABELS: Record<string, string> = {
  urine: 'Orina',
  feces: 'Heces',
  vomit: 'Vómito',
}

export interface HospNote {
  id: string
  category: string
  text: string
  user_id: string | null
  created_at: string
}

export interface HospIncident {
  id: string
  severity: string
  description: string
  actions_taken: string | null
  observed_at: string
  user_id: string | null
}

export interface HospPhoto {
  id: string
  url: string
  label: string | null
  category: string | null
  description: string | null
  taken_at: string
  user_id: string | null
}

export interface TimelineEvent {
  type: string
  at: string
  title: string
  description: string
  user_id: string | null
  photo_url?: string | null
}

export const NOTE_CATEGORY_LABELS: Record<string, string> = {
  evolution: 'Evolución',
  incident: 'Incidencia',
  review: 'Revisión',
  procedure: 'Procedimiento',
  communication: 'Comunicación',
  other: 'Otra',
}

export const INCIDENT_SEVERITY_META: Record<
  string,
  { label: string; badge: 'secondary' | 'info' | 'warning' | 'destructive' }
> = {
  low: { label: 'Baja', badge: 'secondary' },
  medium: { label: 'Media', badge: 'info' },
  high: { label: 'Alta', badge: 'warning' },
  critical: { label: 'Crítica', badge: 'destructive' },
}

export interface ShiftRow {
  hospitalization_id: string
  pet_id: string
  pet_name: string
  status: string
  operational_status: string
  isolation_status: string
  accommodation: string | null
  last_vitals_at: string | null
  next_task_at: string | null
  overdue_count: number
  pending_meds: number
  incidents_24h: number
}

export interface ShiftSummary {
  rows: ShiftRow[]
  counts: { patients: number; overdue: number; pending_meds: number }
}

export interface CurrentShift {
  shift: { id: string; user_id: string | null; started_at: string; handover_note: string | null } | null
  summary: ShiftSummary
}

export interface ShiftHistoryItem {
  id: string
  user_id: string | null
  user_name: string | null
  started_at: string
  ended_at: string | null
  handover_note: string | null
}

export interface HospCosts {
  stay: {
    days: number
    price_per_day: number
    total: number
    accommodation_type: string | null
    monitoring_level: string | null
  }
  breakdown: Record<string, number>
  total: number
}

export interface DischargeChecklistItem {
  item: string
  done: boolean
}

export interface HospDischarge {
  id: string
  hospitalization_id: string
  user_id: string | null
  reason: string | null
  summary: string | null
  checklist: DischargeChecklistItem[]
  follow_up_date: string | null
  follow_up_reason: string | null
  follow_up_vet_user_id: string | null
  discharged_at: string
}

export const STATUS_META: Record<
  HospStatus,
  { label: string; badge: 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive' }
> = {
  planned: { label: 'Planeada', badge: 'secondary' },
  admitted: { label: 'Admitido', badge: 'info' },
  active: { label: 'Activo', badge: 'default' },
  discharge_pending: { label: 'Alta pendiente', badge: 'warning' },
  discharged: { label: 'Dado de alta', badge: 'success' },
  cancelled: { label: 'Cancelado', badge: 'destructive' },
}

export const OPERATIONAL_META: Record<
  OperationalStatus,
  { label: string; text: string; dot: string; badge: 'success' | 'info' | 'warning' | 'destructive' }
> = {
  stable: { label: 'Estable', text: 'text-success', dot: 'bg-success', badge: 'success' },
  monitoring: { label: 'Vigilancia', text: 'text-info', dot: 'bg-info', badge: 'info' },
  delicate: { label: 'Delicado', text: 'text-warning', dot: 'bg-warning', badge: 'warning' },
  critical: { label: 'Crítico', text: 'text-destructive', dot: 'bg-destructive', badge: 'destructive' },
}

export const ISOLATION_META: Record<
  IsolationStatus,
  { label: string; text: string; dot: string }
> = {
  normal: { label: 'Normal', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  precaution: { label: 'Precaución', text: 'text-warning', dot: 'bg-warning' },
  isolation: { label: 'Aislamiento', text: 'text-destructive', dot: 'bg-destructive' },
}

export const MONITORING_LABELS: Record<MonitoringLevel, string> = {
  basic: 'Básico',
  intermediate: 'Intermedio',
  intensive: 'Intensivo',
}

export function elapsedLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  if (h < 24) return `${h} h ${minutes % 60} min`
  const d = Math.floor(h / 24)
  return `${d} d ${h % 24} h`
}

export const DISCHARGE_ICON = CheckCircle2
export const CRITICAL_ICON = CircleAlert
export const WARNING_ICON = TriangleAlert
export const INFO_ICON = Info
export const CLOCK_ICON = Clock3
