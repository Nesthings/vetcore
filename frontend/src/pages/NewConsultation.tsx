import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  ClipboardPlus,
  FileText,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Pet } from '@/pages/Pets'
import { apiFetch } from '@/lib/api'

interface DoseResult {
  dose_mg: number
  volume_ml: number
  formula: string
}

interface Branch {
  id: string
  name: string
}

interface ConsultaBody {
  branch_id: string
  pet_id: string
  vet_user_id: string
  reason: string
  diagnosis: string
  treatment: string
  care_instructions: string
  next_appointment_suggestion?: string | null
  items: { description: string; quantity: number }[]
}

export function NewConsultation() {
  const { id: petId } = useParams<{ id: string }>()
  const [pet, setPet] = useState<Pet | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState('')
  const [vetUserId, setVetUserId] = useState('')

  const [reason, setReason] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [treatment, setTreatment] = useState('')
  const [care, setCare] = useState('')
  const [nextAppt, setNextAppt] = useState('')
  const [items, setItems] = useState<{ description: string; quantity: number }[]>([
    { description: '', quantity: 1 },
  ])

  // Peso y dosis
  const [weight, setWeight] = useState('')
  const [doseMgKg, setDoseMgKg] = useState('')
  const [concentration, setConcentration] = useState('')
  const [doseResult, setDoseResult] = useState<DoseResult | null>(null)
  const [confirmDose, setConfirmDose] = useState(false)

  // Foto
  const [photo, setPhoto] = useState<File | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ pdfUrl: string } | null>(null)

  const load = useCallback(async () => {
    if (!petId) return
    try {
      const [p, br, users] = await Promise.all([
        apiFetch<Pet>(`/pets/${petId}`),
        apiFetch<Branch[]>('/branches'),
        apiFetch<{ id: string; full_name: string }[]>('/users'),
      ])
      setPet(p)
      setBranches(br)
      setWeight(p.latest_weight_kg ? String(p.latest_weight_kg) : '')
      if (br.length > 0) setBranchId(br[0].id)
      // el propio usuario (staff) es quien registra la consulta
      const me = await apiFetch<{ sub: string }>('/auth/me')
      setVetUserId(me.sub)
      void users
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la información')
    }
  }, [petId])

  useEffect(() => {
    load()
  }, [load])

  const calcDose = async () => {
    setError(null)
    try {
      const res = await apiFetch<DoseResult>('/dose/calc', {
        method: 'POST',
        body: JSON.stringify({
          weight_kg: Number(weight),
          dose_mg_kg: Number(doseMgKg),
          concentration_mg_ml: Number(concentration),
        }),
      })
      setDoseResult(res)
      setConfirmDose(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular la dosis')
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (doseResult && !confirmDose) {
      setError('Debes confirmar que el cálculo de dosis es correcto antes de guardar.')
      return
    }
    setSubmitting(true)
    try {
      const validItems = items.filter((i) => i.description.trim())
      const body: ConsultaBody = {
        branch_id: branchId,
        pet_id: petId!,
        vet_user_id: vetUserId,
        reason,
        diagnosis,
        treatment,
        care_instructions: care,
        next_appointment_suggestion: nextAppt || null,
        items: validItems,
      }
      const consultation = await apiFetch<{ id: string }>('/consultations', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (weight && Number(weight) > 0) {
        await apiFetch(`/pets/${petId}/weights`, {
          method: 'POST',
          body: JSON.stringify({ weight_kg: Number(weight), consultation_id: consultation.id }),
        })
      }

      const pdf = await apiFetch<{ pdf_url: string }>(
        `/consultations/${consultation.id}/summary-pdf`,
        { method: 'POST' },
      )

      if (photo) {
        const form = new FormData()
        form.append('file', photo)
        await apiFetch(`/consultations/${consultation.id}/attachments`, {
          method: 'POST',
          body: form,
        })
      }

      setDone({ pdfUrl: pdf.pdf_url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la consulta')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-md py-16">
          <Card className="shadow-card">
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
              <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
              <h1 className="text-xl font-semibold">Consulta guardada</h1>
              <p className="text-sm text-muted-foreground">
                El resumen de consulta quedó sincronizado con la Cartilla digital.
              </p>
              <div className="flex w-full flex-col gap-2">
                <Button asChild>
                  <a href={done.pdfUrl} target="_blank" rel="noreferrer">
                    <FileText /> Ver resumen (PDF)
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <Link to={`/pets/${petId}`}>Volver a la ficha</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="mb-6 flex items-center gap-3">
        <Link
          to={`/pets/${petId}`}
          className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
          aria-label="Volver"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nueva consulta</h1>
          <p className="text-sm text-muted-foreground">
            {pet?.name ?? 'Paciente'} · {pet?.species}
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="max-w-3xl space-y-6">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Datos de la consulta</CardTitle>
            <CardDescription>Motivo, diagnóstico, tratamiento e indicaciones</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Sucursal</Label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Motivo de consulta *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. Vacunación anual, dolor abdominal…"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Diagnóstico</Label>
                <Textarea
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="Diagnóstico presuntivo o definitivo"
                />
              </div>
              <div className="space-y-2">
                <Label>Tratamiento</Label>
                <Textarea
                  value={treatment}
                  onChange={(e) => setTreatment(e.target.value)}
                  placeholder="Fármacos, dosis, frecuencia…"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Indicaciones para el dueño</Label>
              <Textarea
                value={care}
                onChange={(e) => setCare(e.target.value)}
                placeholder="Cuidados en casa, alimentación, reposo…"
              />
            </div>
            <div className="space-y-2">
              <Label>Próxima cita sugerida</Label>
              <Input type="date" value={nextAppt} onChange={(e) => setNextAppt(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Peso registrado</CardTitle>
            <CardDescription>
              El peso es histórico: cada consulta puede registrar uno nuevo
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-end gap-4">
            <div className="space-y-2">
              <Label>Peso (kg)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="Ej. 12.5"
              />
            </div>
            {pet?.latest_weight_kg && (
              <p className="pb-2 text-sm text-muted-foreground">
                Último registrado: {pet.latest_weight_kg} kg
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-info/40 shadow-card">
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Calculator className="size-4 text-info" aria-hidden="true" />
            <div>
              <CardTitle>Calculadora de dosis</CardTitle>
              <CardDescription>
                volumen = peso × dosis ÷ concentración — verifica siempre el resultado
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label>Peso (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Dosis (mg/kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={doseMgKg}
                  onChange={(e) => setDoseMgKg(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Concentración (mg/ml)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={concentration}
                  onChange={(e) => setConcentration(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={calcDose} className="w-full">
                  <Calculator /> Calcular
                </Button>
              </div>
            </div>

            {doseResult && (
              <div className="space-y-3 rounded-md border border-info/30 bg-info/5 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Dosis total</p>
                    <p className="text-lg font-semibold">{doseResult.dose_mg} mg</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Volumen a administrar</p>
                    <p className="text-lg font-semibold text-info">{doseResult.volume_ml} ml</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{doseResult.formula}</p>
                <label className="flex cursor-pointer items-start gap-2 rounded-md bg-background/60 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmDose}
                    onChange={(e) => setConfirmDose(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <ShieldCheck className="mr-1 inline size-4 text-success" aria-hidden="true" />
                    Confirmo que el cálculo de dosis es correcto y lo asumo como responsable.
                  </span>
                </label>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Items aplicados</CardTitle>
              <CardDescription>Procedimientos, fármacos o insumos usados</CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setItems((i) => [...i, { description: '', quantity: 1 }])}
            >
              <Plus /> Agregar
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <Input
                  value={item.description}
                  onChange={(e) =>
                    setItems((list) =>
                      list.map((it, i) =>
                        i === idx ? { ...it, description: e.target.value } : it,
                      ),
                    )
                  }
                  placeholder="Descripción (ej. Amoxicilina 250mg)"
                  className="flex-1"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={item.quantity}
                  onChange={(e) =>
                    setItems((list) =>
                      list.map((it, i) =>
                        i === idx ? { ...it, quantity: Number(e.target.value) } : it,
                      ),
                    )
                  }
                  className="w-20"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Quitar"
                  onClick={() => setItems((list) => list.filter((_, i) => i !== idx))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Foto / nota</CardTitle>
            <CardDescription>Adjunta una foto a esta consulta (máx. 5 MB)</CardDescription>
          </CardHeader>
          <CardContent>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-accent"
            />
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button asChild variant="outline">
            <Link to={`/pets/${petId}`}>Cancelar</Link>
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Guardando…
              </>
            ) : (
              <>
                <ClipboardPlus /> Guardar consulta
              </>
            )}
          </Button>
        </div>
      </form>
    </AppLayout>
  )
}
