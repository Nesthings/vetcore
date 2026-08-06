import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, CalendarDays, FileText, Loader2, RotateCcw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import type { OwnerPet } from '@/pages/owner/OwnerPortal'
import { apiFetch } from '@/lib/api'

interface ConsultationView {
  id: string
  date: string
  reason?: string | null
  diagnosis?: string | null
  treatment?: string | null
  care_instructions?: string | null
  vet_name?: string | null
  items: { description: string; quantity: number }[]
  summary_pdf_url?: string | null
}

interface AppointmentView {
  id: string
  procedure_type: string
  start_time: string
  status: string
}

interface OwnerPetDetailData extends OwnerPet {
  consultations: ConsultationView[]
  appointments: AppointmentView[]
}

export function OwnerPetDetail() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<OwnerPetDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<OwnerPetDetailData>(`/owner/pets/${id}`)
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la cartilla')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const uploadPhoto = async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await apiFetch(`/owner/pets/${id}/photo`, { method: 'PUT', body: form })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto')
    } finally {
      setUploading(false)
    }
  }

  const revertPhoto = async () => {
    setError(null)
    try {
      await apiFetch(`/owner/pets/${id}/photo/revert`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restaurar la foto')
    }
  }

  const pet = data?.pet

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-background/80 px-6 backdrop-blur">
        <Link
          to="/portal"
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Volver a mis mascotas
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
        {loading && <LoadingState label="Cargando cartilla…" />}

        {data && pet && !error && (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-secondary text-primary">
                {pet.cartilla_photo_url ? (
                  <img
                    src={pet.cartilla_photo_url}
                    alt={pet.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Camera className="size-10" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <h1 className="text-2xl font-semibold tracking-tight">{pet.name}</h1>
                  {data.read_only && <Badge variant="warning">Solo lectura</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {pet.species}
                  {pet.breed ? ` · ${pet.breed}` : ''}
                  {pet.sex ? ` · ${pet.sex === 'M' ? 'Macho' : 'Hembra'}` : ''}
                  {pet.birth_date
                    ? ` · Nac. ${new Date(pet.birth_date).toLocaleDateString('es-MX')}`
                    : ''}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {data.clinic_name} ·{' '}
                  {pet.latest_weight_kg ? `${pet.latest_weight_kg} kg` : 'sin peso registrado'}
                </p>
                {data.read_only && (
                  <p className="mt-1 text-xs text-warning">
                    Esta clínica está suspendida temporalmente; puedes ver la información pero no
                    modificar la foto.
                  </p>
                )}
              </div>
            </div>

            {!data.read_only && (
              <Card className="shadow-card">
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) uploadPhoto(f)
                        e.target.value = ''
                      }}
                    />
                    <span className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover">
                      {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
                      {uploading ? 'Subiendo…' : 'Cambiar foto'}
                    </span>
                  </label>
                  <Button variant="outline" size="sm" onClick={revertPhoto}>
                    <RotateCcw /> Restaurar foto anterior
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Se comprime, se recorta a cuadrado y se limpian los datos de ubicación (EXIF).
                  </p>
                </CardContent>
              </Card>
            )}

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Historial de consultas</CardTitle>
                <CardDescription>Resúmenes de las consultas realizadas</CardDescription>
              </CardHeader>
              <CardContent>
                {data.consultations.length === 0 ? (
                  <EmptyState
                    title="Sin consultas"
                    description="Aún no hay consultas registradas."
                  />
                ) : (
                  <div className="space-y-4">
                    {data.consultations.map((c) => (
                      <div key={c.id} className="rounded-md border border-border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">{c.reason ?? 'Consulta'}</p>
                          <span className="text-xs text-muted-foreground">
                            {new Date(c.date).toLocaleDateString('es-MX', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                            {c.vet_name ? ` · ${c.vet_name}` : ''}
                          </span>
                        </div>
                        {c.diagnosis && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Diagnóstico:</span>{' '}
                            {c.diagnosis}
                          </p>
                        )}
                        {c.items.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {c.items.map((it, i) => (
                              <Badge key={i} variant="secondary">
                                {it.description} ×{it.quantity}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {c.summary_pdf_url && (
                          <a
                            href={c.summary_pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover"
                          >
                            <FileText className="size-4" /> Ver resumen (PDF)
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Próximas citas</CardTitle>
              </CardHeader>
              <CardContent>
                {data.appointments.length === 0 ? (
                  <EmptyState title="Sin citas próximas" description="No hay citas agendadas." />
                ) : (
                  <div className="space-y-2">
                    {data.appointments.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <CalendarDays className="size-4 text-primary" />
                          {a.procedure_type}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(a.start_time).toLocaleString('es-MX', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
