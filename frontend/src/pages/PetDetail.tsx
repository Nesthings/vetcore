import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon as MDIIcon } from '@mdi/react'
import { mdiPaw } from '@mdi/js'
import {
  ArrowLeft,
  Cake,
  CalendarDays,
  Camera,
  ClipboardPlus,
  FileSignature,
  FileText,
  History,
  Loader2,
  Mail,
  MailPlus,
  PawPrint,
  Phone,
  Plus,
  Send,
  Stethoscope,
  Syringe,
  TriangleAlert,
  UserRound,
  UserRoundCog,
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

import { AppLayout } from '@/components/layout/AppLayout'
import { ConsentDialog } from '@/components/pets/ConsentDialog'
import { InviteOwnerDialog } from '@/components/pets/InviteOwnerDialog'
import { PhotoComparison } from '@/components/pets/PhotoComparison'
import { TransferOwnerDialog } from '@/components/pets/TransferOwnerDialog'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { SectionHeading } from '@/components/ui/section-heading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Pet } from '@/pages/Pets'
import { apiFetch } from '@/lib/api'
import { SPECIES_ICONS, speciesLabel } from '@/lib/species'
import { cn } from '@/lib/utils'
import type { PetVaccinationPlan } from '@/lib/vaccination'

interface TimelineEvent {
  type: 'consulta' | 'cita' | 'foto'
  id: string
  title: string
  subtitle: string
  author?: string | null
  date: string
  status?: string | null
  url?: string | null
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
  status: string
  signature_url?: string | null
  pdf_url?: string | null
  signed_at: string
}

interface CarnetApp {
  id: string
  brand?: string | null
  date_applied: string
  lot?: string | null
  notes?: string | null
  vet_name?: string | null
}

interface CarnetVaccine {
  name: string
  prevents?: string | null
  schedule?: string | null
  applications: CarnetApp[]
}

interface FamilyMember {
  id: string
  name: string
  species: string
  breed?: string | null
  sex?: string | null
  relation: string
  photo_url?: string | null
}

const ALERT_TYPES = [
  'Alergia',
  'Enfermedad crónica',
  'Comportamiento',
  'Medidas especiales',
  'Otra',
]

const ALERT_STYLES: Record<string, string> = {
  Alergia: 'border-destructive/40 bg-destructive/10 text-destructive',
  'Enfermedad crónica': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Comportamiento: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'Medidas especiales': 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  Otra: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
}

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

function CarnetApps({ apps, onRemove }: { apps: CarnetApp[]; onRemove: (id: string) => void }) {
  if (apps.length === 0) return <span className="text-sm text-muted-foreground">—</span>
  return (
    <div className="space-y-1.5">
      {apps.map((app) => (
        <div key={app.id} className="rounded-md border border-border/60 bg-muted/30 px-2 py-1">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">
              {new Date(app.date_applied).toLocaleDateString('es-MX')}
            </span>
            <button
              type="button"
              onClick={() => onRemove(app.id)}
              aria-label={`Eliminar aplicación ${new Date(app.date_applied).toLocaleDateString('es-MX')}`}
              className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </div>
          {(app.lot || app.vet_name) && (
            <p className="mt-0.5 break-words text-xs text-muted-foreground">
              {[app.lot && `Lote ${app.lot}`, app.vet_name].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

interface CarnetAppFormProps {
  vaccine: string
  appDate: string
  setAppDate: (v: string) => void
  appBrand: string
  setAppBrand: (v: string) => void
  appBrandQuery: string
  setAppBrandQuery: (v: string) => void
  appBrandOpen: boolean
  setAppBrandOpen: (v: boolean) => void
  appBrandRef: React.RefObject<HTMLDivElement | null>
  filteredBrands: string[]
  appLot: string
  setAppLot: (v: string) => void
  appVet: string
  setAppVet: (v: string) => void
  vets: { id: string; full_name: string }[]
  busy: boolean
  onSave: () => void
  onCancel: () => void
}

function CarnetAppForm(props: CarnetAppFormProps) {
  const {
    appDate,
    setAppDate,
    appBrand,
    setAppBrand,
    setAppBrandQuery,
    appBrandOpen,
    setAppBrandOpen,
    appBrandRef,
    filteredBrands,
    appLot,
    setAppLot,
    appVet,
    setAppVet,
    vets,
    busy,
    onSave,
    onCancel,
  } = props

  return (
    <div className="flex flex-wrap items-end gap-3 py-1">
      <div className="space-y-1.5">
        <Label>Fecha</Label>
        <Input
          type="date"
          value={appDate}
          onChange={(e) => setAppDate(e.target.value)}
          className="w-36"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Marca</Label>
        <div className="relative" ref={appBrandRef}>
          <Input
            value={appBrand}
            onChange={(e) => {
              setAppBrand(e.target.value)
              setAppBrandQuery(e.target.value)
              setAppBrandOpen(true)
            }}
            onFocus={() => setAppBrandOpen(true)}
            placeholder="Busca la marca…"
            className="w-52"
            autoComplete="off"
          />
          {appBrandOpen && (
            <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-card">
              {filteredBrands.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">Sin coincidencias.</p>
              ) : (
                filteredBrands.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setAppBrand(b)
                      setAppBrandQuery(b)
                      setAppBrandOpen(false)
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    {b}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Lote</Label>
        <Input
          value={appLot}
          onChange={(e) => setAppLot(e.target.value)}
          placeholder="Ej. RAB-2026-01"
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Veterinario</Label>
        <select
          value={appVet}
          onChange={(e) => setAppVet(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">—</option>
          {vets.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={busy || !appDate}>
          {busy ? <Loader2 className="animate-spin" /> : 'Guardar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
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

function sexLabel(sex?: string | null): string | null {
  if (isMale(sex)) return 'Macho'
  if (isFemale(sex)) return 'Hembra'
  return null
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/80 px-3 py-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 text-primary" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

export function PetDetail() {
  const { id } = useParams<{ id: string }>()
  const [pet, setPet] = useState<Pet | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [weights, setWeights] = useState<WeightRecord[]>([])
  const [alerts, setAlerts] = useState<ClinicalAlert[]>([])
  const [photos, setPhotos] = useState<PhotoEvolutionItem[]>([])
  const [consents, setConsents] = useState<Consent[]>([])
  const [vaccination, setVaccination] = useState<PetVaccinationPlan[]>([])
  const [carnet, setCarnet] = useState<CarnetVaccine[]>([])
  const [carnetSpecies, setCarnetSpecies] = useState('')
  const [carnetBrands, setCarnetBrands] = useState<string[]>([])
  const [family, setFamily] = useState<FamilyMember[]>([])
  const [vets, setVets] = useState<{ id: string; full_name: string }[]>([])
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [appDate, setAppDate] = useState('')
  const [appBrand, setAppBrand] = useState('')
  const [appBrandQuery, setAppBrandQuery] = useState('')
  const [appBrandOpen, setAppBrandOpen] = useState(false)
  const [appLot, setAppLot] = useState('')
  const [appVet, setAppVet] = useState('')
  const [carnetBusy, setCarnetBusy] = useState(false)
  const [compareIdx, setCompareIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
  const [remoteConsentOpen, setRemoteConsentOpen] = useState(false)
  const [alertType, setAlertType] = useState(ALERT_TYPES[0])
  const [alertDesc, setAlertDesc] = useState('')
  const [alertBusy, setAlertBusy] = useState(false)
  const appBrandRef = useRef<HTMLDivElement>(null)
  const [confirmState, setConfirmState] = useState<{
    title: string
    description?: string
    onConfirm: () => void
  } | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [p, tl, w, al, ph, cs, vp, ca, fm, us] = await Promise.all([
        apiFetch<Pet>(`/pets/${id}`),
        apiFetch<TimelineEvent[]>(`/pets/${id}/timeline`),
        apiFetch<WeightRecord[]>(`/pets/${id}/weights`),
        apiFetch<ClinicalAlert[]>(`/pets/${id}/alerts`),
        apiFetch<PhotoEvolutionItem[]>(`/pets/${id}/photo-evolution`),
        apiFetch<Consent[]>(`/consents/pets/${id}`),
        apiFetch<PetVaccinationPlan[]>(`/vaccination-plans/pets/${id}`),
        apiFetch<{ species: string; vaccines: CarnetVaccine[]; brands: string[] }>(
          `/pets/${id}/carnet`,
        ),
        apiFetch<FamilyMember[]>(`/pets/${id}/family`),
        apiFetch<{ id: string; full_name: string; role: string }[]>('/users'),
      ])
      setPet(p)
      setTimeline(tl)
      setWeights(w)
      setAlerts(al)
      setPhotos(ph)
      setConsents(cs)
      setVaccination(vp)
      setCarnet(ca.vaccines)
      setCarnetSpecies(ca.species)
      setCarnetBrands(ca.brands)
      setFamily(fm)
      setVets(us.filter((u) => u.role === 'admin' || u.role === 'veterinario'))
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
    setConfirmState({
      title: '¿Eliminar (resolver) esta alerta?',
      description: 'La alerta dejará de mostrarse en el expediente.',
      onConfirm: async () => {
        setError(null)
        try {
          await apiFetch(`/pets/${id}/alerts/${alertId}`, { method: 'DELETE' })
          await load()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No se pudo eliminar la alerta')
        }
        setConfirmState(null)
      },
    })
  }

  const saveCarnetApp = async (vaccine: string) => {
    if (!appDate) return
    setCarnetBusy(true)
    setError(null)
    try {
      await apiFetch(`/pets/${id}/carnet`, {
        method: 'POST',
        body: JSON.stringify({
          vaccine,
          brand: appBrand || null,
          date_applied: appDate,
          lot: appLot || null,
          vet_user_id: appVet || null,
        }),
      })
      setAddingFor(null)
      setAppDate('')
      setAppBrand('')
      setAppBrandQuery('')
      setAppLot('')
      setAppVet('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la aplicación')
    } finally {
      setCarnetBusy(false)
    }
  }

  const removeCarnetApp = async (recordId: string) => {
    setConfirmState({
      title: '¿Eliminar esta aplicación del carnet?',
      description: 'Se quitará el registro de esta dosis del carnet.',
      onConfirm: async () => {
        setError(null)
        try {
          await apiFetch(`/pets/${id}/carnet/${recordId}`, { method: 'DELETE' })
          await load()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No se pudo eliminar la aplicación')
        }
        setConfirmState(null)
      },
    })
  }

  const toggleAddRow = (vaccine: string) => {
    setAddingFor(addingFor === vaccine ? null : vaccine)
    setAppDate('')
    setAppBrand('')
    setAppBrandQuery('')
    setAppBrandOpen(false)
    setAppLot('')
    setAppVet('')
  }

  const carnetFormProps = (vaccine: string): CarnetAppFormProps => ({
    vaccine,
    appDate,
    setAppDate,
    appBrand,
    setAppBrand,
    appBrandQuery,
    setAppBrandQuery,
    appBrandOpen,
    setAppBrandOpen,
    appBrandRef,
    filteredBrands,
    appLot,
    setAppLot,
    appVet,
    setAppVet,
    vets,
    busy: carnetBusy,
    onSave: () => saveCarnetApp(vaccine),
    onCancel: () => setAddingFor(null),
  })

  const weightChart = [...weights].reverse().map((w) => ({
    fecha: new Date(w.recorded_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }),
    peso: Number(w.weight_kg),
  }))

  const latestWeight = weights.length > 0 ? Number(weights[0].weight_kg) : null
  const prevWeight = weights.length > 1 ? Number(weights[1].weight_kg) : null
  const weightDelta = latestWeight != null && prevWeight != null ? latestWeight - prevWeight : null

  const filteredBrands = carnetBrands.filter((b) =>
    b.toLowerCase().includes(appBrandQuery.trim().toLowerCase()),
  )

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (appBrandRef.current && !appBrandRef.current.contains(e.target as Node)) {
        setAppBrandOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <AppLayout>
      <div className="mb-5 flex items-center gap-3">
        <Link
          to="/pets"
          className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
          aria-label="Volver a pacientes"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <p className="text-xs text-muted-foreground">
            Pacientes / <span className="font-medium text-foreground">{pet?.name ?? 'Ficha'}</span>
          </p>
        </div>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando ficha…" />}

      {pet && !error && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="relative overflow-hidden">
            {(() => {
              const male = isMale(pet.sex)
              const female = isFemale(pet.sex)
              const accent = male
                ? {
                    gradient: 'from-sky-500/[0.16] via-primary/[0.03] to-transparent',
                    ring: 'border-sky-400/70',
                    speciesBg: 'bg-sky-500',
                    chip: 'bg-sky-500/10 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300',
                    glow: 'shadow-[0_0_30px_-4px_rgba(14,165,233,0.55)]',
                  }
                : female
                  ? {
                      gradient: 'from-pink-500/[0.16] via-primary/[0.03] to-transparent',
                      ring: 'border-pink-400/70',
                      speciesBg: 'bg-pink-500',
                      chip: 'bg-pink-500/10 text-pink-700 hover:bg-pink-500/10 dark:text-pink-300',
                      glow: 'shadow-[0_0_30px_-4px_rgba(236,72,153,0.55)]',
                    }
                  : {
                      gradient: 'from-slate-500/[0.12] via-primary/[0.03] to-transparent',
                      ring: 'border-primary/20',
                      speciesBg: 'bg-primary',
                      chip: 'bg-primary/10 text-primary hover:bg-primary/10',
                      glow: 'shadow-glow',
                    }
              return (
                <>
                  <div
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${accent.gradient}`}
                    aria-hidden="true"
                  />
                  <div className="relative flex flex-col items-center p-6 pt-8 text-center sm:p-8">
                    <div className="relative">
                      <div
                        className={`flex size-44 items-center justify-center overflow-hidden rounded-[2rem] border-4 ${accent.ring} bg-secondary/60 shadow-elevated ${accent.glow}`}
                      >
                        {pet.clinical_photo_url ? (
                          <img
                            src={pet.clinical_photo_url}
                            alt={pet.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          <PawPrint className="size-16 text-primary" aria-hidden="true" />
                        )}
                      </div>
                      <span
                        className={`absolute -bottom-2 -right-2 flex size-10 items-center justify-center rounded-full border-4 border-card ${accent.speciesBg} text-white shadow-glow`}
                        title={speciesLabel(pet.species)}
                      >
                        <MDIIcon
                          path={SPECIES_ICONS[pet.species] ?? mdiPaw}
                          size={0.7}
                          aria-hidden="true"
                        />
                      </span>
                    </div>

                    <h1 className="mt-5 text-3xl font-bold tracking-tight text-foreground">
                      {pet.name}
                    </h1>
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
                      {sexLabel(pet.sex) && (
                        <Badge className={accent.chip}>{sexLabel(pet.sex)}</Badge>
                      )}
                      {pet.markings && (
                        <Badge variant="outline" className="text-muted-foreground">
                          {pet.markings}
                        </Badge>
                      )}
                    </div>
                    {pet.allergies && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Alergias:</span>{' '}
                        {pet.allergies}
                      </p>
                    )}

                    <div className="mt-7 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
                      <Stat
                        icon={Cake}
                        label="Edad"
                        value={pet.birth_date ? calcAge(pet.birth_date) : '—'}
                      />
                      <Stat
                        icon={CalendarDays}
                        label="Nacimiento"
                        value={
                          pet.birth_date
                            ? new Date(pet.birth_date).toLocaleDateString('es-MX', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'
                        }
                      />
                      <Stat
                        icon={Weight}
                        label="Último peso"
                        value={pet.latest_weight_kg ? `${pet.latest_weight_kg} kg` : '—'}
                      />
                      <Stat
                        icon={UserRound}
                        label="Dueño"
                        value={pet.owners?.find((o) => o.is_active)?.full_name ?? '—'}
                      />
                    </div>

                    <div className="mt-7 flex flex-wrap justify-center gap-2">
                      <Button asChild size="sm">
                        <Link to={`/consultas/nueva?pet=${id}`}>
                          <ClipboardPlus /> Nueva consulta
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConsentOpen(true)}>
                        <FileSignature /> Consentimiento
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
                        <MailPlus /> Invitar dueño
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
                        <UserRoundCog /> Transferir dueño
                      </Button>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>

          {pet.clinical_alert_text && (
            <div className="flex items-start gap-3 border-t border-border bg-destructive/5 px-5 py-3 text-sm text-destructive sm:px-6">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Alerta clínica</p>
                <p>{pet.clinical_alert_text}</p>
              </div>
            </div>
          )}

          <div className="grid border-t border-border lg:grid-cols-2 lg:divide-x lg:divide-border">
            <div className="p-5 sm:p-6">
              <SectionHeading icon={UserRound} title="Dueño" />
              <div className="mt-3 space-y-3">
                {!pet.owners || pet.owners.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin dueño registrado. Usa «Invitar dueño» o «Transferir dueño».
                  </p>
                ) : (
                  pet.owners.map((o) => {
                    return (
                      <div
                        key={o.owner_id}
                        className="flex flex-col gap-4 rounded-xl border border-border/60 bg-muted/30 p-4 sm:flex-row sm:items-center"
                      >
                        <Avatar
                          src={o.profile_photo_url}
                          name={o.full_name ?? 'Dueño'}
                          className="size-16 shrink-0 border-2 border-primary/20 self-center"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-foreground">
                              {o.full_name ?? 'Dueño registrado'}
                            </p>
                            {!o.is_active && (
                              <span className="text-xs text-muted-foreground">
                                (vínculo inactivo)
                              </span>
                            )}
                          </div>
                          <div className="mt-2 space-y-1">
                            {o.phone && (
                              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone
                                  className="size-3.5 shrink-0 text-primary"
                                  aria-hidden="true"
                                />
                                {o.phone}
                              </p>
                            )}
                            {o.email && (
                              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Mail
                                  className="size-3.5 shrink-0 text-primary"
                                  aria-hidden="true"
                                />
                                {o.email}
                              </p>
                            )}
                            {!o.phone && !o.email && (
                              <p className="text-sm text-muted-foreground">
                                Sin contacto registrado
                              </p>
                            )}
                            {(o.alt_contact_name || o.alt_phone) && (
                              <p className="text-xs text-muted-foreground">
                                Alternativo:{' '}
                                {[o.alt_contact_name, o.alt_phone].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
                          <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
                            <MailPlus /> Invitar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            onClick={() => setTransferOpen(true)}
                          >
                            <UserRoundCog /> Transferir
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <SectionHeading icon={TriangleAlert} title="Alertas clínicas" tint="warning" />
              <div className="mt-3 space-y-3">
                {alerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin alertas registradas.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {alerts.map((a) => (
                      <span
                        key={a.id}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                          ALERT_STYLES[a.type] ?? 'border-warning/40 bg-warning/10 text-warning'
                        }`}
                      >
                        <TriangleAlert className="size-3.5" aria-hidden="true" />
                        <span>
                          <b>{a.type}:</b> {a.description}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAlert(a.id)}
                          aria-label="Resolver alerta"
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
                    disabled={alertBusy}
                  >
                    {alertBusy ? <Loader2 className="animate-spin" /> : <Plus />} Agregar
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border p-5 sm:p-6">
            <SectionHeading
              icon={Syringe}
              title="Carnet de vacunación"
              subtitle={
                carnet.length > 0
                  ? `Esquema estándar para ${speciesLabel(carnetSpecies)} · Cartilla Nacional de Vacunación (México)`
                  : 'Sin esquema estándar definido para esta especie'
              }
            />
            <div className="mt-3">
              {carnet.length === 0 ? (
                <EmptyState
                  title="Sin esquema de vacunación"
                  description={`No hay un esquema estándar registrado para la especie «${speciesLabel(carnetSpecies)}».`}
                  icon={Syringe}
                />
              ) : (
                <>
                  {/* Tabla (escritorio) */}
                  <div className="hidden overflow-hidden rounded-lg border border-border md:block">
                    <Table className="table-fixed [&_th]:border-l [&_th:first-child]:border-l-0 [&_td]:border-l [&_td:first-child]:border-l-0">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[21%] whitespace-normal">Vacuna</TableHead>
                          <TableHead className="w-[12%] whitespace-normal">Marca</TableHead>
                          <TableHead className="w-[17%] whitespace-normal">
                            Enfermedades que previene
                          </TableHead>
                          <TableHead className="w-[23%] whitespace-normal">
                            Esquema recomendado
                          </TableHead>
                          <TableHead className="w-[15%] whitespace-normal">Aplicaciones</TableHead>
                          <TableHead className="w-[12%] whitespace-normal text-right">
                            Registrar
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {carnet.map((v) => (
                          <Fragment key={v.name}>
                            <TableRow>
                              <TableCell className="whitespace-normal break-words font-medium">
                                {v.name}
                              </TableCell>
                              <TableCell className="whitespace-normal">
                                <div className="space-y-1.5">
                                  {v.applications.length === 0 ? (
                                    <span className="text-sm text-muted-foreground">—</span>
                                  ) : (
                                    v.applications.map((app) => (
                                      <p
                                        key={app.id}
                                        className="break-words rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs font-medium"
                                      >
                                        {app.brand ?? '—'}
                                      </p>
                                    ))
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="whitespace-normal break-words text-muted-foreground">
                                {v.prevents ?? '—'}
                              </TableCell>
                              <TableCell className="whitespace-normal break-words text-xs text-muted-foreground">
                                {v.schedule ?? '—'}
                              </TableCell>
                              <TableCell className="whitespace-normal">
                                <CarnetApps apps={v.applications} onRemove={removeCarnetApp} />
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleAddRow(v.name)}
                                >
                                  <Plus /> Añadir
                                </Button>
                              </TableCell>
                            </TableRow>
                            {addingFor === v.name && (
                              <TableRow>
                                <TableCell colSpan={6} className="bg-muted/30">
                                  <CarnetAppForm {...carnetFormProps(v.name)} />
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Tarjetas (móvil) */}
                  <div className="space-y-3 md:hidden">
                    {carnet.map((v) => (
                      <div key={v.name} className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{v.name}</p>
                            {v.prevents && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{v.prevents}</p>
                            )}
                          </div>
                          <Button variant="outline" size="sm" onClick={() => toggleAddRow(v.name)}>
                            <Plus /> Añadir
                          </Button>
                        </div>
                        {v.schedule && (
                          <p className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                            Esquema: {v.schedule}
                          </p>
                        )}
                        {v.applications.length > 0 && (
                          <div className="mt-3">
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Marca
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {v.applications.map((app) => (
                                <span
                                  key={app.id}
                                  className="rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs font-medium"
                                >
                                  {app.brand ?? '—'}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="mt-3">
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Aplicaciones
                          </p>
                          <CarnetApps apps={v.applications} onRemove={removeCarnetApp} />
                        </div>
                        {addingFor === v.name && (
                          <div className="mt-3 border-t border-border pt-3">
                            <CarnetAppForm {...carnetFormProps(v.name)} />
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
                  <History className="size-4" aria-hidden="true" />
                  Línea de tiempo
                </TabsTrigger>
                <TabsTrigger value="peso" className="gap-1.5">
                  <Weight className="size-4" aria-hidden="true" />
                  Peso
                </TabsTrigger>
                <TabsTrigger value="fotos" className="gap-1.5">
                  <Camera className="size-4" aria-hidden="true" />
                  Fotos
                </TabsTrigger>
                <TabsTrigger value="consents" className="gap-1.5">
                  <FileSignature className="size-4" aria-hidden="true" />
                  Consentimientos
                </TabsTrigger>
                <TabsTrigger value="vacunacion" className="gap-1.5">
                  <Syringe className="size-4" aria-hidden="true" />
                  Vacunación
                </TabsTrigger>
                <TabsTrigger value="familia" className="gap-1.5">
                  <Users className="size-4" aria-hidden="true" />
                  Familia
                </TabsTrigger>
              </TabsList>

              <TabsContent value="timeline">
                {timeline.length === 0 ? (
                  <EmptyState
                    title="Sin actividad"
                    description="Aún no hay consultas ni citas para este paciente."
                    icon={History}
                  />
                ) : (
                  <div className="relative space-y-4 pl-10">
                    <div className="absolute bottom-2 left-4 top-2 w-px bg-gradient-to-b from-primary/40 via-border to-transparent" />
                    {timeline.map((e) => {
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
                          <Card className="overflow-hidden shadow-card transition-shadow hover:shadow-elevated">
                            <CardContent className="p-4">
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
                              {e.author && (
                                <p className="mt-1.5 text-xs text-muted-foreground/70">
                                  {e.author}
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="peso">
                <Card className="shadow-card">
                  <CardHeader className="flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle>Peso histórico</CardTitle>
                      <CardDescription>
                        Serie de tiempo por consulta (el default visual es el último valor)
                      </CardDescription>
                    </div>
                    {latestWeight != null && (
                      <div className="text-right">
                        <p className="text-3xl font-bold tracking-tight text-foreground">
                          {latestWeight} <span className="text-lg font-semibold">kg</span>
                        </p>
                        {weightDelta != null && (
                          <p
                            className={`text-xs font-medium ${
                              weightDelta > 0
                                ? 'text-success'
                                : weightDelta < 0
                                  ? 'text-destructive'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {weightDelta > 0 ? '▲ +' : weightDelta < 0 ? '▼ ' : '= '}
                            {Math.abs(weightDelta).toFixed(2)} kg vs. registro anterior
                          </p>
                        )}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="h-72">
                    {weights.length === 0 ? (
                      <EmptyState
                        title="Sin registros de peso"
                        description="Aún no hay pesajes registrados."
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

              <TabsContent value="fotos" className="space-y-4">
                {photos.length === 0 ? (
                  <EmptyState
                    title="Sin fotos de evolución"
                    description="Las fotos adjuntas a las consultas aparecerán aquí para comparar la evolución."
                    icon={Camera}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Comparar
                      </span>
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
                      <span className="shrink-0 text-sm font-medium text-foreground">
                        vs.{' '}
                        {new Date(photos[photos.length - 1].consultation_date).toLocaleDateString(
                          'es-MX',
                        )}
                      </span>
                    </div>
                    <PhotoComparison
                      before={photos[compareIdx].url}
                      after={photos[photos.length - 1].url}
                      beforeLabel={new Date(
                        photos[compareIdx].consultation_date,
                      ).toLocaleDateString('es-MX')}
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    Consentimientos informados firmados por el dueño.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setRemoteConsentOpen(true)}>
                      <Send /> Para firma del dueño
                    </Button>
                    <Button size="sm" onClick={() => setConsentOpen(true)}>
                      <FileSignature /> Nuevo consentimiento
                    </Button>
                  </div>
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
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
                              c.status === 'pending'
                                ? 'bg-warning/10 text-warning'
                                : 'bg-primary/10 text-primary'
                            }`}
                          >
                            <FileSignature className="size-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{c.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.status === 'pending' ? (
                                'Pendiente de firma del dueño'
                              ) : (
                                <>
                                  Firmado{' '}
                                  {new Date(c.signed_at).toLocaleString('es-MX', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        {c.status === 'pending' ? (
                          <Badge variant="warning">Pendiente</Badge>
                        ) : (
                          <a
                            href={c.pdf_url ?? '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-accent"
                          >
                            <FileText className="size-3.5" aria-hidden="true" />
                            Ver PDF
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="vacunacion" className="space-y-4">
                {vaccination.length === 0 ? (
                  <EmptyState
                    title="Sin plan de vacunación"
                    description="Asigna un plan al dar de alta a la mascota para generar sus citas de vacunación automáticamente."
                    icon={Syringe}
                  />
                ) : (
                  vaccination.map((vp) => (
                    <div
                      key={vp.id}
                      className="space-y-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-300">
                          <Syringe className="size-4" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">
                            {vp.plan_name}
                            {vp.compound ? ` · ${vp.compound}` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {vp.branch_name}
                            {vp.vet_name ? ` · ${vp.vet_name}` : ''} · Inicia{' '}
                            {new Date(`${vp.start_date}T00:00:00`).toLocaleDateString('es-MX')}
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {vp.doses.map((d) => (
                          <div
                            key={d.id}
                            className={cn(
                              'flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5',
                              d.status === 'completed'
                                ? 'border-success/30 bg-success/5'
                                : 'border-border/60 bg-muted/20',
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span
                                className={cn(
                                  'size-2.5 shrink-0 rounded-full',
                                  d.status === 'completed'
                                    ? 'bg-success'
                                    : d.status === 'skipped'
                                      ? 'bg-muted-foreground/50'
                                      : 'bg-warning',
                                )}
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{d.label}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(`${d.due_date}T00:00:00`).toLocaleDateString('es-MX')}
                                  {d.appointment_start
                                    ? ` · ${new Date(d.appointment_start).toLocaleTimeString(
                                        'es-MX',
                                        {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        },
                                      )}`
                                    : ''}
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant={
                                d.status === 'completed'
                                  ? 'success'
                                  : d.status === 'skipped'
                                    ? 'outline'
                                    : 'warning'
                              }
                            >
                              {d.status === 'completed'
                                ? 'Completada'
                                : d.status === 'skipped'
                                  ? 'Omitida'
                                  : 'Programada'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="familia">
                {family.length === 0 ? (
                  <EmptyState
                    title="Sin familia registrada"
                    description="Otras mascotas con el mismo nombre de dueño aparecerán aquí como hermano o hermana."
                    icon={Users}
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {family.map((m) => {
                      const esHermano = m.relation === 'hermano'
                      return (
                        <Link
                          key={m.id}
                          to={`/pets/${m.id}`}
                          className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent"
                        >
                          <Avatar
                            src={m.photo_url}
                            name={m.name}
                            className={cn(
                              'size-12 shrink-0 border-2',
                              esHermano
                                ? 'border-sky-400/60 bg-sky-500/10 text-sky-600 dark:text-sky-300'
                                : 'border-pink-400/60 bg-pink-500/10 text-pink-600 dark:text-pink-300',
                            )}
                          />
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
                        </Link>
                      )
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      {pet && (
        <InviteOwnerDialog
          petId={pet.id}
          petName={pet.name}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          defaultOwner={{
            name: pet.owners?.find((o) => o.is_active)?.full_name ?? null,
            phone: pet.owners?.find((o) => o.is_active)?.phone ?? null,
            email: pet.owners?.find((o) => o.is_active)?.email ?? null,
          }}
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

      {pet && (
        <ConsentDialog
          petId={pet.id}
          petName={pet.name}
          open={remoteConsentOpen}
          onOpenChange={setRemoteConsentOpen}
          remote
          onSaved={() => {
            setRemoteConsentOpen(false)
            load()
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmState)}
        onOpenChange={(open) => {
          if (!open) setConfirmState(null)
        }}
        title={confirmState?.title ?? ''}
        description={confirmState?.description}
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={() => confirmState?.onConfirm()}
      />
    </AppLayout>
  )
}
