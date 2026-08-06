import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Search, Users } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { PetFormDialog } from '@/components/pets/PetFormDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/ui/loading-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiFetch } from '@/lib/api'

export interface PetOwner {
  owner_id: string
  full_name?: string | null
  phone?: string | null
  email?: string | null
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

export function Pets() {
  const [pets, setPets] = useState<PetWithAlerts[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const load = async (q = search) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q) params.set('search', q)
      const res = await apiFetch<PetWithAlerts[]>(`/pets?${params}`)
      setPets(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los pacientes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pacientes</h1>
          <p className="text-sm text-muted-foreground">Expediente de las mascotas de la clínica</p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus /> Nueva mascota
        </Button>
      </div>

      <div className="mb-4 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(search)}
            placeholder="Buscar por nombre…"
            className="pl-9"
          />
        </div>
      </div>

      {error && <ErrorState description={error} onRetry={() => load()} className="mb-6" />}
      {loading && <LoadingState label="Cargando pacientes…" />}

      {!loading && !error && pets.length === 0 && (
        <EmptyState
          title="Sin pacientes"
          description="Registra tu primera mascota para empezar su expediente."
          icon={Users}
          action={
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus /> Registrar mascota
            </Button>
          }
        />
      )}

      {!loading && !error && pets.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Especie</TableHead>
                <TableHead>Raza</TableHead>
                <TableHead>Sexo</TableHead>
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
                  <TableCell className="capitalize">{p.species}</TableCell>
                  <TableCell>{p.breed ?? '—'}</TableCell>
                  <TableCell>{p.sex ?? '—'}</TableCell>
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
                      onClick={() => setFormOpen(true)}
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
        onOpenChange={setFormOpen}
        onSaved={() => {
          setFormOpen(false)
          load()
        }}
      />
    </AppLayout>
  )
}
