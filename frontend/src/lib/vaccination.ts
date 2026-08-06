export interface VaccinationPlanStep {
  id?: string
  label: string
  offset_days: number
  position: number
}

export interface VaccinationPlan {
  id: string
  clinic_id: string
  name: string
  compound: string
  notes: string | null
  active: boolean
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
