export interface VaccinationPlanStep {
  id?: string
  label: string
  offset_days: number
  position: number
}

/** Convierte días en una frase legible para humanos (ej. 182 → "6 meses"). */
export function humanizeLapso(days: number): string {
  if (days <= 0) return 'el día de la asignación'
  if (days % 365 === 0) return `${days / 365} año${days / 365 > 1 ? 's' : ''}`
  const months = Math.round(days / 30.44)
  if (months >= 1 && Math.abs(days - months * 30.44) <= 8) {
    return `${months} mes${months > 1 ? 'es' : ''}`
  }
  if (days % 7 === 0) return `${days / 7} semana${days / 7 > 1 ? 's' : ''}`
  return `${days} día${days > 1 ? 's' : ''}`
}

export interface VaccinationPlan {
  id: string
  clinic_id: string
  name: string
  compound: string
  species: string | null
  brand: string | null
  prevents: string | null
  notes: string | null
  active: boolean
  is_standard: boolean
  created_at: string
  steps: VaccinationPlanStep[]
}

export interface VaccinationDose {
  id: string
  label: string
  due_date: string
  status: string
  appointment_id: string | null
  appointment_start: string | null
}

export interface PetVaccinationPlan {
  id: string
  pet_id: string
  plan_id: string
  plan_name: string | null
  compound: string | null
  branch_id: string
  branch_name: string | null
  vet_user_id: string | null
  vet_name: string | null
  start_date: string
  start_time: string
  duration_minutes: number
  doses: VaccinationDose[]
}
