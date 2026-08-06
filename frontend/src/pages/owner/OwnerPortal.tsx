import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BellRing, LogOut, PawPrint } from 'lucide-react'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Preferences | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [res, p] = await Promise.all([
        apiFetch<OwnerPet[]>('/owner/pets'),
        apiFetch<Preferences>('/owner/preferences'),
      ])
      setPets(res)
      setPrefs(p)
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
