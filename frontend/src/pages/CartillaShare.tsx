import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon as MDIIcon } from '@mdi/react'
import { mdiPaw } from '@mdi/js'
import {
  Camera,
  Cake,
  CalendarDays,
  FileSignature,
  FileText,
  History,
  Loader2,
  Lock,
  Mail,
  PawPrint,
  Phone,
  Plus,
  Stethoscope,
  Syringe,
  TriangleAlert,
  Users,
  Weight,
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

import { SignaturePad } from '@/components/pets/SignaturePad'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SectionHeading } from '@/components/ui/section-heading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiFetch } from '@/lib/api'
import { SPECIES_ICONS, speciesLabel } from '@/lib/species'

interface ShareOwner {
  owner_id: string
  full_name?: string | null
  phone?: string | null
  email?: string | null
  profile_photo_url?: string | null
  alt_contact_name?: string | null
  alt_phone?: string | null
  linked_at: string
  is_active: boolean
}

interface SharePet {
  id: string
  name: string
  species: string
  breed?: string | null
  sex?: string | null
  birth_date?: string | null
  allergies?: string | null
  clinical_photo_url?: string | null
  latest_weight_kg?: number | null
  owners: ShareOwner[]
}

interface ShareAlert {
  id: string
  type: string
  description: string
  created_at: string
}

interface ShareApp {
  id: string
  brand?: string | null
  date_applied: string
  lot?: string | null
  notes?: string | null
  vet_name?: string | null
}

interface ShareVaccine {
  name: string
  prevents?: string | null
  schedule?: string | null
  applications: ShareApp[]
}

interface ShareConsent {
  id: string
  title: string
  body: string
  status: string
  signature_url?: string | null
  pdf_url?: string | null
  signed_at: string
}

interface ShareWeight {
  id: string
  weight_kg: number
  recorded_at: string
}

interface ShareTimelineEvent {
  type: string
  id: string
  title: string
  subtitle: string
  author?: string | null
  date: string
  status?: string | null
  url?: string | null
}

interface SharePhoto {
  url: string
  consultation_date: string
  reason?: string | null
}

interface ShareFamily {
  id: string
  name: string
  species: string
  breed?: string | null
  sex?: string | null
  relation: string
  photo_url?: string | null
}

interface ShareData {
  pet: SharePet
  alerts: ShareAlert[]
  carnet: { species: string; vaccines: ShareVaccine[] }
  consents: ShareConsent[]
  weights: ShareWeight[]
  timeline: ShareTimelineEvent[]
  photos: SharePhoto[]
  family: ShareFamily[]
}

const ALERT_TYPES = [
  'Alergia',
  'Enfermedad crónica',
  'Comportamiento',
  'Medidas especiales',
  'Otra',
]

const ALERT_LIMIT = 20

const CITA_STATUS: Record<
  string,
  { label: string; variant: 'success' | 'info' | 'warning' | 'destructive' | 'secondary' }
> = {
  scheduled: { label: 'Agendada', variant: 'warning' },
  confirmed: { label: 'Confirmada', variant: 'info' },
  completed: { label: 'Completada', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'destructive' },
  no_show: { label: 'No asistió', variant: 'secondary' },
}

function calcAge(birth: string): string {
  const b = new Date(birth)
  const now = new Date()
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
  if (now.getDate() < b.getDate()) months -= 1
  if (months < 1) return 'Menos de 1 mes'
  if (months < 12) return `${months} mes${months === 1 ? '' : 'es'}`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest
    ? `${years} año${years === 1 ? '' : 's'} ${rest} m`
    : `${years} año${years === 1 ? '' : 's'}`
}

function isMale(sex?: string | null): boolean {
  return sex === 'M' || sex === 'macho' || sex === 'Macho'
}

function isFemale(sex?: string | null): boolean {
  return sex === 'H' || sex === 'hembra' || sex === 'Hembra'
}

export function CartillaShare() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [data, setData] = useState<ShareData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // foto de perfil
  const [photoBusy, setPhotoBusy] = useState(false)
  const [ownerPhotoBusy, setOwnerPhotoBusy] = useState(false)

  // alertas
  const [alertType, setAlertType] = useState(ALERT_TYPES[0])
  const [alertDesc, setAlertDesc] = useState('')
  const [alertBusy, setAlertBusy] = useState(false)

  // firma de consentimiento
  const [signing, setSigning] = useState<ShareConsent | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [signBusy, setSignBusy] = useState(false)
  const [confirm, setConfirm] = useState<{ title: string; onConfirm: () => void } | null>(null)

  const load = useCallback(async () => {
    if (!token) {
      setError('Falta el enlace de la cartilla.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<ShareData>(`/share/cartilla?token=${encodeURIComponent(token)}`)
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la cartilla')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const uploadPhoto = async (file: File) => {
    setPhotoBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('token', token)
      fd.append('file', file)
      await apiFetch('/share/cartilla/photo', { method: 'POST', body: fd })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto')
    } finally {
      setPhotoBusy(false)
    }
  }

  const uploadOwnerPhoto = async (file: File) => {
    setOwnerPhotoBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('token', token)
      fd.append('file', file)
      await apiFetch('/share/cartilla/owner-photo', { method: 'POST', body: fd })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir tu foto')
    } finally {
      setOwnerPhotoBusy(false)
    }
  }

  const addAlert = async () => {
    if (!alertDesc.trim() || (data?.alerts.length ?? 0) >= ALERT_LIMIT) return
    setAlertBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('token', token)
      fd.append('type', alertType)
      fd.append('description', alertDesc.trim())
      await apiFetch('/share/cartilla/alerts', { method: 'POST', body: fd })
      setAlertDesc('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar la alerta')
    } finally {
      setAlertBusy(false)
    }
  }

  const removeAlert = async (id: string) => {
    setConfirm({
      title: '¿Eliminar esta alerta?',
      onConfirm: async () => {
        try {
          await apiFetch(`/share/cartilla/alerts/${id}?token=${encodeURIComponent(token)}`, {
            method: 'DELETE',
          })
          await load()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No se pudo eliminar la alerta')
        }
        setConfirm(null)
      },
    })
  }

  const submitSignature = async () => {
    if (!signing || !signature) return
    setSignBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('token', token)
      fd.append('signature_base64', signature)
      await apiFetch(`/share/cartilla/consents/${signing.id}/sign`, { method: 'POST', body: fd })
      setSigning(null)
      setSignature(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo firmar')
    } finally {
      setSignBusy(false)
    }
  }

  const weightChart = useMemo(
    () =>
      [...(data?.weights ?? [])].reverse().map((w) => ({
        fecha: new Date(w.recorded_at).toLocaleDateString('es-MX', {
          day: '2-digit',
          month: 'short',
        }),
        peso: w.weight_kg,
      })),
    [data],
  )

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-4">
        <Loader2 className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Cargando la cartilla…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <TriangleAlert className="size-10 text-destructive" aria-hidden="true" />
        <h1 className="text-lg font-semibold">No se pudo abrir la cartilla</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
        <Link to="/" className="text-sm font-medium text-primary hover:underline">
          Ir al inicio
        </Link>
      </div>
    )
  }

  const pet = data.pet
  const pendingConsents = data.consents.filter((c) => c.status === 'pending')
  const male = isMale(pet.sex)
  const female = isFemale(pet.sex)
  const accent = male
    ? {
        gradient: 'from-sky-500/[0.16] via-primary/[0.03] to-transparent',
        ring: 'border-sky-400/70',
        chip: 'bg-sky-500/10 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300',
      }
    : female
      ? {
          gradient: 'from-pink-500/[0.16] via-primary/[0.03] to-transparent',
          ring: 'border-pink-400/70',
          chip: 'bg-pink-500/10 text-pink-700 hover:bg-pink-500/10 dark:text-pink-300',
        }
      : {
          gradient: 'from-slate-500/[0.12] via-primary/[0.03] to-transparent',
          ring: 'border-primary/20',
          chip: 'bg-primary/10 text-primary hover:bg-primary/10',
        }

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl bg-background pb-16">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold">Cartilla de {pet.name}</h1>
        <p className="text-xs text-muted-foreground">Compartida por tu clínica</p>
      </header>

      <main className="p-4">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="relative overflow-hidden">
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${accent.gradient}`}
              aria-hidden="true"
            />
            <div className="relative flex flex-col items-center p-8 text-center">
              <div className="relative">
                <div
                  className={`flex size-36 items-center justify-center overflow-hidden rounded-[2rem] border-4 ${accent.ring} bg-secondary/60 shadow-elevated`}
                >
                  {pet.clinical_photo_url ? (
                    <img
                      src={pet.clinical_photo_url}
                      alt={pet.name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <PawPrint className="size-12 text-primary" aria-hidden="true" />
                  )}
                </div>
                <label
                  className={`absolute -bottom-2 -right-2 flex size-9 cursor-pointer items-center justify-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-card transition-colors hover:bg-primary-hover ${
                    photoBusy ? 'pointer-events-none opacity-70' : ''
                  }`}
                  title="Subir foto de perfil de la mascota"
                >
                  {photoBusy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Camera className="size-4" aria-hidden="true" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) uploadPhoto(f)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>

              <h2 className="mt-5 text-3xl font-bold tracking-tight">{pet.name}</h2>
              <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                <Badge className={`gap-1.5 ${accent.chip}`}>
                  <MDIIcon
                    path={SPECIES_ICONS[pet.species] ?? mdiPaw}
                    size={0.6}
                    aria-hidden="true"
                  />
                  {speciesLabel(pet.species)}
                </Badge>
                {pet.breed && <Badge variant="secondary">{pet.breed}</Badge>}
                {male && <Badge className={accent.chip}>Macho</Badge>}
                {female && <Badge className={accent.chip}>Hembra</Badge>}
              </div>
              {pet.allergies && (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Alergias:</span> {pet.allergies}
                </p>
              )}

              <div className="mt-6 grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-card/80 px-3 py-2.5 text-left">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Cake className="size-3.5 text-primary" aria-hidden="true" /> Edad
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold">
                    {pet.birth_date ? calcAge(pet.birth_date) : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/80 px-3 py-2.5 text-left">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="size-3.5 text-primary" aria-hidden="true" /> Nacimiento
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold">
                    {pet.birth_date
                      ? new Date(pet.birth_date).toLocaleDateString('es-MX', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/80 px-3 py-2.5 text-left">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Weight className="size-3.5 text-primary" aria-hidden="true" /> Último peso
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold">
                    {pet.latest_weight_kg != null ? `${pet.latest_weight_kg} kg` : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <p className="mx-5 mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="border-t border-border p-5 sm:p-6">
            <SectionHeading icon={Phone} title="Dueño" />
            <div className="mt-3 space-y-3">
              {!pet.owners || pet.owners.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin dueño registrado.</p>
              ) : (
                pet.owners.map((o) => {
                  const initials =
                    (o.full_name ?? 'D')
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0]?.toUpperCase() ?? '')
                      .join('') || 'D'
                  return (
                    <div
                      key={o.owner_id}
                      className="flex flex-col items-center gap-4 rounded-xl border border-border/60 bg-muted/30 p-4 sm:flex-row"
                    >
                      <div className="relative shrink-0">
                        <div className="flex size-20 items-center justify-center overflow-hidden rounded-full border-2 border-primary/20 bg-secondary text-xl font-semibold text-primary shadow-card">
                          {o.profile_photo_url ? (
                            <img
                              src={o.profile_photo_url}
                              alt={o.full_name ?? 'Dueño'}
                              className="size-full object-cover"
                            />
                          ) : (
                            initials
                          )}
                        </div>
                        <label
                          className={`absolute -bottom-1 -right-1 flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-card transition-colors hover:bg-primary-hover ${
                            ownerPhotoBusy ? 'pointer-events-none opacity-70' : ''
                          }`}
                          title="Subir tu foto de perfil"
                        >
                          {ownerPhotoBusy ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Camera className="size-4" aria-hidden="true" />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) uploadOwnerPhoto(f)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                      <div className="min-w-0 flex-1 text-center sm:text-left">
                        <p className="text-base font-semibold">
                          {o.full_name ?? 'Dueño registrado'}
                        </p>
                        <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                          {o.phone && (
                            <p className="flex items-center justify-center gap-2 sm:justify-start">
                              <Phone
                                className="size-3.5 shrink-0 text-primary"
                                aria-hidden="true"
                              />
                              {o.phone}
                            </p>
                          )}
                          {o.email && (
                            <p className="flex items-center justify-center gap-2 sm:justify-start">
                              <Mail className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                              {o.email}
                            </p>
                          )}
                          {!o.phone && !o.email && <p>Sin contacto registrado</p>}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                <Lock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                Por seguridad, tu información de contacto no se puede modificar desde aquí (solo tu
                foto de perfil). Si necesitas actualizar tus datos, acude a la clínica o contáctala
                directamente.
              </p>
            </div>
          </div>

          <div className="border-t border-border p-5 sm:p-6">
            <SectionHeading
              icon={TriangleAlert}
              title="Alertas clínicas"
              tint="warning"
              subtitle="Agrega información que el veterinario debe conocer (alergias, comportamiento, etc.)"
              right={
                <span className="text-xs font-medium text-muted-foreground">
                  {data.alerts.length}/{ALERT_LIMIT}
                </span>
              }
            />
            <div className="mt-3 space-y-3">
              {data.alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin alertas registradas.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.alerts.map((a) => (
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
                        aria-label="Eliminar alerta"
                        className="text-current opacity-60 hover:opacity-100"
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
                  disabled={alertBusy || data.alerts.length >= ALERT_LIMIT || !alertDesc.trim()}
                >
                  {alertBusy ? <Loader2 className="animate-spin" /> : <Plus />} Agregar
                </Button>
              </div>
            </div>
          </div>

          <div className="border-t border-border p-5 sm:p-6">
            <SectionHeading
              icon={Syringe}
              title="Carnet de vacunación"
              subtitle={`Esquema estándar para ${speciesLabel(data.carnet.species)} · solo lectura`}
            />
            <div className="mt-3">
              {data.carnet.vaccines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay esquema estándar definido para esta especie.
                </p>
              ) : (
                <>
                  {/* Tabla (escritorio) */}
                  <div className="hidden overflow-hidden rounded-lg border border-border md:block">
                    <Table className="table-fixed [&_th]:border-l [&_th:first-child]:border-l-0 [&_td]:border-l [&_td:first-child]:border-l-0">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[24%] whitespace-normal">Vacuna</TableHead>
                          <TableHead className="w-[13%] whitespace-normal">Marca</TableHead>
                          <TableHead className="w-[21%] whitespace-normal">
                            Enfermedades que previene
                          </TableHead>
                          <TableHead className="w-[27%] whitespace-normal">
                            Esquema recomendado
                          </TableHead>
                          <TableHead className="w-[15%] whitespace-normal">Aplicaciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.carnet.vaccines.map((v) => (
                          <TableRow key={v.name}>
                            <TableCell className="whitespace-normal break-words font-medium">
                              {v.name}
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              {v.applications.length === 0 ? (
                                <span className="text-sm text-muted-foreground">—</span>
                              ) : (
                                <div className="space-y-1.5">
                                  {v.applications.map((app) => (
                                    <p
                                      key={app.id}
                                      className="break-words rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs font-medium"
                                    >
                                      {app.brand ?? '—'}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-normal break-words text-muted-foreground">
                              {v.prevents ?? '—'}
                            </TableCell>
                            <TableCell className="whitespace-normal break-words text-xs text-muted-foreground">
                              {v.schedule ?? '—'}
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              {v.applications.length === 0 ? (
                                <span className="text-sm text-muted-foreground">—</span>
                              ) : (
                                <div className="space-y-1.5">
                                  {v.applications.map((app) => (
                                    <div
                                      key={app.id}
                                      className="rounded-md border border-border/60 bg-muted/30 px-2 py-1"
                                    >
                                      <p className="font-medium">
                                        {new Date(app.date_applied).toLocaleDateString('es-MX')}
                                      </p>
                                      {(app.lot || app.vet_name) && (
                                        <p className="mt-0.5 break-words text-xs text-muted-foreground">
                                          {[app.lot && `Lote ${app.lot}`, app.vet_name]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Tarjetas (móvil) */}
                  <div className="space-y-3 md:hidden">
                    {data.carnet.vaccines.map((v) => (
                      <div key={v.name} className="rounded-xl border border-border/60 bg-card p-4">
                        <p className="text-sm font-semibold">{v.name}</p>
                        {v.prevents && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{v.prevents}</p>
                        )}
                        {v.schedule && (
                          <p className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                            Esquema: {v.schedule}
                          </p>
                        )}
                        {v.applications.length > 0 && (
                          <div className="mt-3">
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Aplicaciones
                            </p>
                            <div className="space-y-1.5">
                              {v.applications.map((app) => (
                                <p key={app.id} className="text-xs text-muted-foreground">
                                  <span className="font-medium">
                                    {new Date(app.date_applied).toLocaleDateString('es-MX')}
                                  </span>
                                  {app.brand ? ` · ${app.brand}` : ''}
                                  {app.lot ? ` · Lote ${app.lot}` : ''}
                                  {app.vet_name ? ` · ${app.vet_name}` : ''}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-border p-5 sm:p-6">
            <Tabs defaultValue="timeline" className="space-y-5">
              <TabsList className="w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 sm:w-auto sm:overflow-visible">
                <TabsTrigger value="timeline" className="gap-1.5">
                  <History className="size-4" aria-hidden="true" /> Línea de tiempo
                </TabsTrigger>
                <TabsTrigger value="peso" className="gap-1.5">
                  <Weight className="size-4" aria-hidden="true" /> Peso
                </TabsTrigger>
                <TabsTrigger value="fotos" className="gap-1.5">
                  <Camera className="size-4" aria-hidden="true" /> Fotos
                </TabsTrigger>
                <TabsTrigger value="consents" className="gap-1.5">
                  <FileSignature className="size-4" aria-hidden="true" /> Consentimientos
                  {pendingConsents.length > 0 && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {pendingConsents.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="vacunacion" className="gap-1.5">
                  <Syringe className="size-4" aria-hidden="true" /> Vacunación
                </TabsTrigger>
                <TabsTrigger value="familia" className="gap-1.5">
                  <Users className="size-4" aria-hidden="true" /> Familia
                </TabsTrigger>
              </TabsList>

              <TabsContent value="timeline">
                {data.timeline.length === 0 ? (
                  <EmptyState
                    title="Sin actividad"
                    description="Aún no hay registros."
                    icon={History}
                  />
                ) : (
                  <div className="relative space-y-4 pl-10">
                    <div className="absolute bottom-2 left-4 top-2 w-px bg-gradient-to-b from-primary/40 via-border to-transparent" />
                    {data.timeline.map((e) => {
                      const isConsulta = e.type === 'consulta'
                      const isFoto = e.type === 'foto'
                      const st = CITA_STATUS[e.status ?? ''] ?? {
                        label: e.status ?? '',
                        variant: 'secondary',
                      }
                      return (
                        <div key={`${e.type}-${e.id}`} className="relative">
                          <span
                            className={`absolute -left-10 top-1 flex size-8 items-center justify-center rounded-full border-4 border-background shadow-card ${
                              isConsulta
                                ? 'bg-sky-500 text-white'
                                : isFoto
                                  ? 'bg-violet-500 text-white'
                                  : 'bg-primary text-primary-foreground'
                            }`}
                          >
                            {isConsulta ? (
                              <Stethoscope className="size-3.5" aria-hidden="true" />
                            ) : isFoto ? (
                              <Camera className="size-3.5" aria-hidden="true" />
                            ) : (
                              <CalendarDays className="size-3.5" aria-hidden="true" />
                            )}
                          </span>
                          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold">{e.title}</p>
                                {isConsulta ? (
                                  <Badge variant="success">Consulta</Badge>
                                ) : isFoto ? (
                                  <Badge
                                    variant="outline"
                                    className="text-violet-600 dark:text-violet-300"
                                  >
                                    Foto
                                  </Badge>
                                ) : (
                                  st.label && <Badge variant={st.variant}>{st.label}</Badge>
                                )}
                              </div>
                              <span className="rounded-md bg-muted/60 px-2 py-1 text-xs font-medium text-muted-foreground">
                                {new Date(e.date).toLocaleString('es-MX', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            {e.subtitle && (
                              <p className="mt-2 text-xs text-muted-foreground">{e.subtitle}</p>
                            )}
                            {isFoto && e.url && (
                              <img
                                src={e.url}
                                alt={e.title}
                                className="mt-2 aspect-video w-full max-w-xs rounded-lg border border-border/60 object-cover"
                              />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="peso">
                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle>Peso histórico</CardTitle>
                    <CardDescription>Solo lectura</CardDescription>
                  </CardHeader>
                  <CardContent className="h-72">
                    {data.weights.length === 0 ? (
                      <EmptyState
                        title="Sin registros de peso"
                        description="Aún no hay pesajes."
                        icon={Weight}
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
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: 'var(--chart-1)' }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="fotos">
                {data.photos.length === 0 ? (
                  <EmptyState
                    title="Sin fotos de evolución"
                    description="Las fotos de la consulta aparecerán aquí."
                    icon={Camera}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {data.photos.map((p, i) => (
                      <div
                        key={i}
                        className="overflow-hidden rounded-xl border border-border/60 bg-card"
                      >
                        <img
                          src={p.url}
                          alt={p.reason ?? 'Foto'}
                          className="aspect-square w-full object-cover"
                        />
                        {(p.reason || p.consultation_date) && (
                          <p className="border-t border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
                            {p.reason ? `${p.reason} · ` : ''}
                            {new Date(p.consultation_date).toLocaleDateString('es-MX')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="consents" className="space-y-4">
                {pendingConsents.length > 0 && (
                  <div className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-warning">
                    Tienes {pendingConsents.length} consentimiento
                    {pendingConsents.length > 1 ? 's' : ''} pendiente
                    {pendingConsents.length > 1 ? 's' : ''} de firma.
                  </div>
                )}
                {data.consents.length === 0 ? (
                  <EmptyState
                    title="Sin consentimientos"
                    description="Aún no hay documentos."
                    icon={FileSignature}
                  />
                ) : (
                  <div className="space-y-2">
                    {data.consents.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${c.status === 'pending' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'}`}
                          >
                            <FileSignature className="size-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{c.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.status === 'pending' ? 'Pendiente de tu firma' : 'Firmado'}
                            </p>
                          </div>
                        </div>
                        {c.status === 'pending' ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSigning(c)
                              setSignature(null)
                            }}
                          >
                            <FileSignature /> Firmar
                          </Button>
                        ) : (
                          <a
                            href={c.pdf_url ?? '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-accent"
                          >
                            <FileText className="size-3.5" aria-hidden="true" /> Ver PDF
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="vacunacion" className="space-y-4">
                <EmptyState
                  title="Planes de vacunación"
                  description="Los planes asignados a la mascota se muestran aquí (solo lectura)."
                  icon={Syringe}
                />
              </TabsContent>

              <TabsContent value="familia">
                {data.family.length === 0 ? (
                  <EmptyState
                    title="Sin familia registrada"
                    description="Otras mascotas con el mismo dueño aparecerán aquí."
                    icon={Users}
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {data.family.map((m) => {
                      const esHermano = m.relation === 'hermano'
                      return (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm"
                        >
                          <div
                            className={`flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 ${esHermano ? 'border-sky-400/60 bg-sky-500/10 text-sky-600 dark:text-sky-300' : 'border-pink-400/60 bg-pink-500/10 text-pink-600 dark:text-pink-300'}`}
                          >
                            {m.photo_url ? (
                              <img
                                src={m.photo_url}
                                alt={m.name}
                                className="size-full object-cover"
                              />
                            ) : (
                              <PawPrint className="size-5" aria-hidden="true" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{m.name}</p>
                            <p className="truncate text-xs capitalize text-muted-foreground">
                              {speciesLabel(m.species)}
                              {m.breed ? ` · ${m.breed}` : ''}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              esHermano
                                ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
                                : 'bg-pink-500/10 text-pink-700 dark:text-pink-300'
                            }
                          >
                            {m.relation === 'hermana'
                              ? 'Hermana'
                              : m.relation === 'hermano'
                                ? 'Hermano'
                                : 'Hermano(a)'}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      <Dialog
        open={Boolean(signing)}
        onOpenChange={(o) => {
          if (!o) setSigning(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Firmar consentimiento</DialogTitle>
            <DialogDescription>
              {signing?.title} · Dibuja tu firma y envíala. El documento se completará con tu firma.
            </DialogDescription>
          </DialogHeader>
          {signing && (
            <div className="space-y-4">
              <p className="max-h-40 overflow-y-auto rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                {signing.body}
              </p>
              <div className="rounded-md border border-border p-4">
                <SignaturePad onDataUrl={setSignature} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSigning(null)}>
                  Cancelar
                </Button>
                <Button onClick={submitSignature} disabled={signBusy || !signature}>
                  {signBusy ? <Loader2 className="animate-spin" /> : <FileSignature />} Firmar y
                  enviar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.title ?? ''}
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={() => confirm?.onConfirm()}
      />
    </div>
  )
}
