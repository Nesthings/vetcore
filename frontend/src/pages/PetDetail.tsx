import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, ClipboardPlus, PawPrint, TriangleAlert } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { AppLayout } from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Pet } from '@/pages/Pets'
import { apiFetch } from '@/lib/api'

interface TimelineEvent {
  type: 'consulta' | 'cita'
  id: string
  title: string
  subtitle: string
  author?: string | null
  date: string
  status?: string | null
}

interface WeightRecord {
  id: string
  weight_kg: number
  recorded_at: string
}

export function PetDetail() {
  const { id } = useParams<{ id: string }>()
  const [pet, setPet] = useState<Pet | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [weights, setWeights] = useState<WeightRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [p, tl, w] = await Promise.all([
        apiFetch<Pet>(`/pets/${id}`),
        apiFetch<TimelineEvent[]>(`/pets/${id}/timeline`),
        apiFetch<WeightRecord[]>(`/pets/${id}/weights`),
      ])
      setPet(p)
      setTimeline(tl)
      setWeights(w)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el paciente')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const weightChart = [...weights].reverse().map((w) => ({
    fecha: new Date(w.recorded_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }),
    peso: Number(w.weight_kg),
  }))

  return (
    <AppLayout>
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/pets"
          className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
          aria-label="Volver a pacientes"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{pet?.name ?? 'Cargando…'}</h1>
          <p className="text-sm text-muted-foreground">
            {pet
              ? `${pet.species}${pet.breed ? ` · ${pet.breed}` : ''}${pet.sex ? ` · ${pet.sex === 'M' ? 'Macho' : 'Hembra'}` : ''}`
              : ''}
          </p>
        </div>
        {pet && (
          <Button asChild size="sm">
            <Link to={`/pets/${id}/consultas/nueva`}>
              <ClipboardPlus /> Nueva consulta
            </Link>
          </Button>
        )}
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando ficha…" />}

      {pet && !error && (
        <div className="space-y-6">
          <Card className="shadow-card">
            <CardContent className="flex flex-col gap-6 p-6 sm:flex-row">
              <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-secondary text-primary">
                {pet.clinical_photo_url ? (
                  <img
                    src={pet.clinical_photo_url}
                    alt={pet.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <PawPrint className="size-10" aria-hidden="true" />
                )}
              </div>
              <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Nacimiento</p>
                  <p className="text-sm font-medium">
                    {pet.birth_date ? new Date(pet.birth_date).toLocaleDateString('es-MX') : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Último peso</p>
                  <p className="text-sm font-medium">
                    {pet.latest_weight_kg ? `${pet.latest_weight_kg} kg` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Alergias</p>
                  <p className="text-sm font-medium">{pet.allergies || '—'}</p>
                </div>
                {pet.clinical_alert_text && (
                  <div className="col-span-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{pet.clinical_alert_text}</span>
                  </div>
                )}
                <div className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Camera className="size-4" aria-hidden="true" />
                  Foto clínica del expediente (la de la Cartilla del dueño llega en 1.7)
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">Línea de tiempo</TabsTrigger>
              <TabsTrigger value="peso">Peso histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="space-y-4">
              {timeline.length === 0 ? (
                <EmptyState
                  title="Sin actividad"
                  description="Aún no hay consultas ni citas para este paciente."
                />
              ) : (
                <div className="relative space-y-4 pl-6">
                  <div className="absolute bottom-0 left-2 top-0 w-px bg-border" />
                  {timeline.map((e) => (
                    <div key={`${e.type}-${e.id}`} className="relative">
                      <span
                        className={`absolute -left-6 top-1.5 size-3 rounded-full border-2 border-background ${
                          e.type === 'consulta' ? 'bg-primary' : 'bg-info'
                        }`}
                      />
                      <Card className="shadow-card">
                        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                          <div>
                            <p className="text-sm font-medium">{e.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(e.date).toLocaleString('es-MX', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {e.author ? ` · ${e.author}` : ''}
                            </p>
                            {e.subtitle && (
                              <p className="mt-1 text-xs text-muted-foreground">{e.subtitle}</p>
                            )}
                          </div>
                          {e.type === 'cita' && e.status && (
                            <Badge variant="secondary">{e.status}</Badge>
                          )}
                          {e.type === 'consulta' && <Badge variant="success">Consulta</Badge>}
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="peso">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Peso histórico</CardTitle>
                  <CardDescription>
                    Serie de tiempo por consulta (el default visual es el último valor)
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  {weights.length === 0 ? (
                    <EmptyState
                      title="Sin registros de peso"
                      description="Aún no hay pesajes registrados."
                    />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={weightChart}
                        margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="fecha"
                          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          domain={['auto', 'auto']}
                          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip formatter={(v) => [`${v} kg`, 'Peso']} />
                        <Line
                          type="monotone"
                          dataKey="peso"
                          stroke="var(--chart-1)"
                          strokeWidth={2}
                          dot={{ r: 4, fill: 'var(--chart-1)' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </AppLayout>
  )
}
