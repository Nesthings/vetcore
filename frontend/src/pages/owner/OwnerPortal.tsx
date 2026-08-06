import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BellRing, CalendarDays, LogOut, PawPrint, Receipt } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface Preferences {
  owner_id: string
  preferred_channel: string
  accepts_reminders: boolean
  accepts_reminders_at?: string | null
}

interface OwnerAppointment {
  id: string
  pet_name?: string | null
  clinic_name?: string | null
  procedure_type: string
  start_time: string
  status: string
}

export interface OwnerPet {
  pet: {
    id: string
    name: string
    species: string
    breed?: string | null
    sex?: string | null
    birth_date?: string | null
    cartilla_photo_url?: string | null
    latest_weight_kg?: number | null
  }
  clinic_id: string
  clinic_name: string
  clinic_status: string
  read_only: boolean
}

export function OwnerPortal() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [pets, setPets] = useState<OwnerPet[]>([])
  const [appointments, setAppointments] = useState<OwnerAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Preferences | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [res, p, appts] = await Promise.all([
        apiFetch<OwnerPet[]>('/owner/pets'),
        apiFetch<Preferences>('/owner/preferences'),
        apiFetch<OwnerAppointment[]>('/owner/appointments'),
      ])
      setPets(res)
      setPrefs(p)
      setAppointments(appts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar tus mascotas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const updatePrefs = async (patch: Partial<Preferences>) => {
    setError(null)
    try {
      const res = await apiFetch<Preferences>('/owner/preferences', {
        method: 'PUT',
        body: JSON.stringify(patch),
      })
      setPrefs(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar las preferencias')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PawPrint className="size-4" aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold">VetCore · Portal del Dueño</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            logout()
            navigate('/login', { replace: true })
          }}
        >
          <LogOut /> Cerrar sesión
        </Button>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Tus mascotas</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Cartilla digital: historial y salud de tus mascotas en la red VetCore
        </p>

        {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
        {loading && <LoadingState label="Cargando tus mascotas…" />}

        {prefs && (
          <Card className="mb-6 shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BellRing className="size-4 text-primary" aria-hidden="true" />
                Preferencias de contacto
              </CardTitle>
              <CardDescription>
                Recordatorios de citas por WhatsApp (opt-in). Sin tu consentimiento no se envían.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={prefs.accepts_reminders}
                  onChange={(e) => updatePrefs({ accepts_reminders: e.target.checked })}
                  className="size-4"
                />
                Recibir recordatorios
              </label>
              {prefs.accepts_reminders_at && (
                <span className="text-xs text-muted-foreground">
                  Desde el {new Date(prefs.accepts_reminders_at).toLocaleDateString('es-MX')}
                </span>
              )}
              <select
                value={prefs.preferred_channel}
                onChange={(e) => updatePrefs({ preferred_channel: e.target.value })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Correo</option>
                <option value="sms">SMS</option>
              </select>
            </CardContent>
          </Card>
        )}

        {!loading && !error && pets.length === 0 && (
          <EmptyState
            title="Aún no tienes mascotas vinculadas"
            description="Cuando una clínica te invite por token, tu mascota aparecerá aquí."
          />
        )}

        {appointments.length > 0 && (
          <Card className="mb-6 shadow-card">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="size-4 text-primary" aria-hidden="true" />
                  Próximas citas
                </CardTitle>
                <CardDescription>Todas tus mascotas</CardDescription>
              </div>
              <Link
                to="/portal/invoices"
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover"
              >
                <Receipt className="size-4" /> Mis facturas
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {appointments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">{a.pet_name ?? '—'}</span>
                      <span className="text-muted-foreground"> · {a.procedure_type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{a.clinic_name}</Badge>
                      <span className="text-muted-foreground">
                        {new Date(a.start_time).toLocaleString('es-MX', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && !error && pets.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {pets.map((item) => (
              <Link key={item.pet.id} to={`/portal/pets/${item.pet.id}`}>
                <Card className="h-full transition-shadow hover:shadow-elevated">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary text-primary">
                      {item.pet.cartilla_photo_url ? (
                        <img
                          src={item.pet.cartilla_photo_url}
                          alt={item.pet.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <PawPrint className="size-7" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{item.pet.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {item.pet.species}
                        {item.pet.breed ? ` · ${item.pet.breed}` : ''}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{item.clinic_name}</Badge>
                        {item.pet.latest_weight_kg && (
                          <span className="text-xs text-muted-foreground">
                            {item.pet.latest_weight_kg} kg
                          </span>
                        )}
                        {item.read_only && <Badge variant="warning">Solo lectura</Badge>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
