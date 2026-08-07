import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon as MDIIcon } from '@mdi/react'
import {
  mdiBird,
  mdiCat,
  mdiDog,
  mdiFish,
  mdiHorse,
  mdiPaw,
  mdiRabbit,
  mdiRodent,
  mdiSnake,
  mdiTurtle,
} from '@mdi/js'
import { Pencil, Plus, Users } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { PetFormDialog } from '@/components/pets/PetFormDialog'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { SearchInput } from '@/components/ui/search-input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

export interface PetOwner {
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

export interface Pet {
  id: string
  clinic_id: string
  name: string
  species: string
  breed?: string | null
  color_primary?: string | null
  color_secondary?: string | null
  markings?: string | null
  sex?: string | null
  birth_date?: string | null
  allergies?: string | null
  clinical_alert_text?: string | null
  clinical_photo_url?: string | null
  is_active: boolean
  created_at: string
  latest_weight_kg?: number | null
  owners?: PetOwner[] | null
}

interface PetWithAlerts extends Pet {
  alert_count?: number
}

const SPECIES_ICONS: Record<string, string> = {
  perro: mdiDog,
  gato: mdiCat,
  ave: mdiBird,
  conejo: mdiRabbit,
  reptil: mdiSnake,
  roedor: mdiRodent,
  hurones: mdiPaw,
  peces: mdiFish,
  anfibio: mdiTurtle,
  equino: mdiHorse,
  otro: mdiPaw,
}

interface SpeciesOption {
  species: string
  count: number
}

export function Pets() {
  const [pets, setPets] = useState<PetWithAlerts[]>([])
  const [search, setSearch] = useState('')
  const [speciesFilter, setSpeciesFilter] = useState<string | null>(null)
  const [speciesOptions, setSpeciesOptions] = useState<SpeciesOption[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PetWithAlerts | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiFetch<SpeciesOption[]>('/pets/species')
      .then((res) => {
        if (!cancelled) setSpeciesOptions(res)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(
      () => {
        ;(async () => {
          try {
            const params = new URLSearchParams()
            if (search.trim()) params.set('search', search.trim())
            if (speciesFilter) params.set('species', speciesFilter)
            params.set('limit', '100')
            const res = await apiFetch<PetWithAlerts[]>(`/pets?${params}`)
            if (!cancelled) {
              setPets(res)
              setLoaded(true)
            }
          } catch (err) {
            if (!cancelled) {
              setError(err instanceof Error ? err.message : 'No se pudieron cargar los pacientes')
            }
          }
        })()
      },
      search.trim() || speciesFilter ? 250 : 0,
    )
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [search, speciesFilter, refreshKey])

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pacientes</h1>
          <p className="text-sm text-muted-foreground">Expediente de las mascotas de la clínica</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus /> Nueva mascota
        </Button>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          placeholder="Buscar por nombre…"
          className="max-w-md"
        />
        {speciesOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Especie
            </span>
            <button
              type="button"
              onClick={() => setSpeciesFilter(null)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                !speciesFilter
                  ? 'border-primary bg-primary text-primary-foreground shadow-glow'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              Todas
            </button>
            {speciesOptions.map((s) => {
              const active = speciesFilter === s.species
              return (
                <button
                  key={s.species}
                  type="button"
                  onClick={() => setSpeciesFilter(active ? null : s.species)}
                  title={s.species}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground shadow-glow'
                      : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <MDIIcon
                    path={SPECIES_ICONS[s.species] ?? mdiPaw}
                    size={0.85}
                    className="shrink-0"
                    aria-hidden="true"
                  />
                  {s.species}
                  <span
                    className={cn(
                      'text-xs',
                      active ? 'text-primary-foreground/70' : 'text-muted-foreground',
                    )}
                  >
                    {s.count}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {error && <ErrorState description={error} onRetry={refresh} className="mb-6" />}
      {!loaded && !error && <LoadingState label="Cargando pacientes…" />}

      {loaded && !error && pets.length === 0 && (
        <EmptyState
          title="Sin pacientes"
          description="Registra tu primera mascota para empezar su expediente."
          icon={Users}
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus /> Registrar mascota
            </Button>
          }
        />
      )}

      {loaded && !error && pets.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Dueño</TableHead>
                <TableHead>Especie</TableHead>
                <TableHead>Raza</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="hidden xl:table-cell">Características</TableHead>
                <TableHead className="hidden lg:table-cell">Sexo</TableHead>
                <TableHead>Último peso</TableHead>
                <TableHead>Alertas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pets.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      to={`/pets/${p.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const owner = p.owners?.find((o) => o.is_active)
                      return owner?.full_name ? (
                        <span className="inline-flex items-center gap-2">
                          <Avatar
                            src={owner.profile_photo_url}
                            name={owner.full_name}
                            className="size-6"
                          />
                          <span className="truncate text-sm">{owner.full_name}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )
                    })()}
                  </TableCell>
                  <TableCell className="capitalize">{p.species}</TableCell>
                  <TableCell>{p.breed ?? '—'}</TableCell>
                  <TableCell>
                    {p.color_primary ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block size-2.5 rounded-full border border-border"
                          aria-hidden="true"
                        />
                        {p.color_primary}
                        {p.color_secondary ? ` / ${p.color_secondary}` : ''}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">{p.markings ?? '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell">{p.sex ?? '—'}</TableCell>
                  <TableCell>{p.latest_weight_kg ? `${p.latest_weight_kg} kg` : '—'}</TableCell>
                  <TableCell>
                    {p.clinical_alert_text || (p.alert_count && p.alert_count > 0) ? (
                      <Badge variant="destructive">
                        Alerta{p.alert_count && p.alert_count > 0 ? ` ×${p.alert_count}` : ''}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${p.name}`}
                      onClick={() => {
                        setEditing(p)
                        setFormOpen(true)
                      }}
                    >
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PetFormDialog
        open={formOpen}
        pet={editing}
        onOpenChange={setFormOpen}
        onSaved={() => {
          setFormOpen(false)
          setEditing(null)
          refresh()
        }}
      />
    </AppLayout>
  )
}
