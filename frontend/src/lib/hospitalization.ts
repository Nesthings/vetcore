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
