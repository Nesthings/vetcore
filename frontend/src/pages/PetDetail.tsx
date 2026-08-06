import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  ClipboardPlus,
  FileSignature,
  Loader2,
  MailPlus,
  PawPrint,
  Plus,
  TriangleAlert,
  UserRound,
  UserRoundCog,
  X,
} from 'lucide-react'
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
import { ConsentDialog } from '@/components/pets/ConsentDialog'
import { InviteOwnerDialog } from '@/components/pets/InviteOwnerDialog'
import { PhotoComparison } from '@/components/pets/PhotoComparison'
import { TransferOwnerDialog } from '@/components/pets/TransferOwnerDialog'
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

interface ClinicalAlert {
  id: string
  pet_id: string
  type: string
  description: string
  created_at: string
}

interface PhotoEvolutionItem {
  url: string
  consultation_id: string
  consultation_date: string
  reason?: string | null
}

interface Consent {
  id: string
  pet_id: string
  title: string
  body: string
  signature_url: string
  pdf_url: string
  signed_at: string
}

const ALERT_TYPES = [
  'Alergia',
  'Enfermedad crónica',
  'Comportamiento',
  'Medidas especiales',
  'Otra',
]

export function PetDetail() {
  const { id } = useParams<{ id: string }>()
  const [pet, setPet] = useState<Pet | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [weights, setWeights] = useState<WeightRecord[]>([])
  const [alerts, setAlerts] = useState<ClinicalAlert[]>([])
  const [photos, setPhotos] = useState<PhotoEvolutionItem[]>([])
  const [consents, setConsents] = useState<Consent[]>([])
  const [compareIdx, setCompareIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
  const [alertType, setAlertType] = useState(ALERT_TYPES[0])
  const [alertDesc, setAlertDesc] = useState('')
  const [alertBusy, setAlertBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [p, tl, w, al, ph, cs] = await Promise.all([
        apiFetch<Pet>(`/pets/${id}`),
        apiFetch<TimelineEvent[]>(`/pets/${id}/timeline`),
        apiFetch<WeightRecord[]>(`/pets/${id}/weights`),
        apiFetch<ClinicalAlert[]>(`/pets/${id}/alerts`),
        apiFetch<PhotoEvolutionItem[]>(`/pets/${id}/photo-evolution`),
        apiFetch<Consent[]>(`/consents/pets/${id}`),
      ])
      setPet(p)
      setTimeline(tl)
      setWeights(w)
      setAlerts(al)
      setPhotos(ph)
      setConsents(cs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el paciente')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const addAlert = async () => {
    if (!alertDesc.trim()) return
    setAlertBusy(true)
    setError(null)
    try {
      await apiFetch(`/pets/${id}/alerts`, {
        method: 'POST',
        body: JSON.stringify({ type: alertType, description: alertDesc }),
      })
      setAlertDesc('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la alerta')
    } finally {
      setAlertBusy(false)
    }
  }

  const removeAlert = async (alertId: string) => {
    if (!confirm('¿Eliminar (resolver) esta alerta?')) return
    setError(null)
    try {
      await apiFetch(`/pets/${id}/alerts/${alertId}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la alerta')
    }
  }

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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConsentOpen(true)}>
              <FileSignature /> Consentimiento
            </Button>
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
              <MailPlus /> Invitar dueño
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
              <UserRoundCog /> Transferir dueño
            </Button>
            <Button asChild size="sm">
              <Link to={`/pets/${id}/consultas/nueva`}>
                <ClipboardPlus /> Nueva consulta
              </Link>
            </Button>
          </div>
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
                  <p className="text-xs text-muted-foreground">Color</p>
                  <p className="text-sm font-medium">
                    {pet.color_primary ? (
                      <>
                        {pet.color_primary}
                        {pet.color_secondary ? ` / ${pet.color_secondary}` : ''}
                      </>
                    ) : (
                      '—'
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Características</p>
                  <p className="text-sm font-medium">{pet.markings || '—'}</p>
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

          <Card className="shadow-card">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <UserRound className="size-4 text-primary" aria-hidden="true" />
                  Dueño
                </p>
              </div>
              {!pet.owners || pet.owners.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin dueño registrado. Usa «Invitar dueño» o «Transferir dueño».
                </p>
              ) : (
                <div className="space-y-2">
                  {pet.owners.map((o) => (
                    <div
                      key={o.owner_id}
                      className="rounded-md border border-border/60 px-3 py-2 text-sm"
                    >
                      <p className="font-medium">
                        {o.full_name ?? 'Dueño registrado'}
                        {!o.is_active && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (vínculo inactivo)
                          </span>
                        )}
                      </p>
                      <p className="text-muted-foreground">
                        {o.phone ? `Tel: ${o.phone}` : ''}
                        {o.phone && o.email ? ' · ' : ''}
                        {o.email ? o.email : ''}
                        {!o.phone && !o.email ? 'Sin contacto' : ''}
                      </p>
                      {(o.alt_contact_name || o.alt_phone) && (
                        <p className="text-xs text-muted-foreground">
                          Alternativo:{' '}
                          {[o.alt_contact_name, o.alt_phone].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-warning/40 shadow-card">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <TriangleAlert className="size-4 text-warning" aria-hidden="true" />
                  Alertas clínicas
                </p>
              </div>
              {alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin alertas registradas.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {alerts.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning"
                    >
                      <TriangleAlert className="size-3.5" aria-hidden="true" />
                      <span>
                        <b>{a.type}:</b> {a.description}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAlert(a.id)}
                        aria-label="Resolver alerta"
                        className="text-warning/70 hover:text-warning"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {ALERT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  value={alertDesc}
                  onChange={(e) => setAlertDesc(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addAlert()}
                  placeholder="Describe la alerta…"
                  className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addAlert}
                  disabled={alertBusy}
                >
                  {alertBusy ? <Loader2 className="animate-spin" /> : <Plus />} Agregar
                </Button>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">Línea de tiempo</TabsTrigger>
              <TabsTrigger value="peso">Peso histórico</TabsTrigger>
              <TabsTrigger value="fotos">Fotos de evolución</TabsTrigger>
              <TabsTrigger value="consents">Consentimientos</TabsTrigger>
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

            <TabsContent value="fotos" className="space-y-4">
              {photos.length === 0 ? (
                <EmptyState
                  title="Sin fotos de evolución"
                  description="Las fotos adjuntas a las consultas aparecerán aquí para comparar la evolución."
                  icon={Camera}
                />
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex w-full max-w-md items-center justify-between gap-3">
                    <select
                      value={compareIdx}
                      onChange={(e) => setCompareIdx(Number(e.target.value))}
                      className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {photos.map((p, i) => (
                        <option key={p.consultation_id} value={i}>
                          Antes: {new Date(p.consultation_date).toLocaleDateString('es-MX')}{' '}
                          {p.reason ? `· ${p.reason}` : ''}
                        </option>
                      ))}
                    </select>
                    <span className="text-sm text-muted-foreground">
                      vs.{' '}
                      {new Date(photos[photos.length - 1].consultation_date).toLocaleDateString(
                        'es-MX',
                      )}
                    </span>
                  </div>
                  <PhotoComparison
                    before={photos[compareIdx].url}
                    after={photos[photos.length - 1].url}
                    beforeLabel={new Date(photos[compareIdx].consultation_date).toLocaleDateString(
                      'es-MX',
                    )}
                    afterLabel={new Date(
                      photos[photos.length - 1].consultation_date,
                    ).toLocaleDateString('es-MX')}
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    Arrastra el divisor para comparar la evolución entre dos consultas.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="consents" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Consentimientos informados firmados por el dueño.
                </p>
                <Button size="sm" onClick={() => setConsentOpen(true)}>
                  <FileSignature /> Nuevo consentimiento
                </Button>
              </div>
              {consents.length === 0 ? (
                <EmptyState
                  title="Sin consentimientos"
                  description="Genera el primero para procedimientos como anestesia o cirugía."
                  icon={FileSignature}
                />
              ) : (
                <div className="space-y-2">
                  {consents.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{c.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Firmado{' '}
                          {new Date(c.signed_at).toLocaleString('es-MX', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <a
                        href={c.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-sm font-medium text-primary hover:text-primary-hover"
                      >
                        Ver PDF
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {pet && (
        <InviteOwnerDialog
          petId={pet.id}
          petName={pet.name}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />
      )}

      {pet && (
        <TransferOwnerDialog
          petId={pet.id}
          petName={pet.name}
          open={transferOpen}
          onOpenChange={setTransferOpen}
        />
      )}

      {pet && (
        <ConsentDialog
          petId={pet.id}
          petName={pet.name}
          open={consentOpen}
          onOpenChange={setConsentOpen}
          onSaved={() => {
            setConsentOpen(false)
            load()
          }}
        />
      )}
    </AppLayout>
  )
}
