import { useCallback, useState } from 'react'
import { History } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiFetch } from '@/lib/api'

interface AuditEntry {
  id: string
  actor_type: string
  actor_name?: string | null
  action: string
  entity_type: string
  entity_id: string
  metadata_json?: Record<string, unknown> | null
  created_at: string
}

const FILTER_ALL = '__all'

const ACTIONS: Record<string, string> = {
  appointment_cancelled: 'Cita cancelada',
  appointment_no_show: 'Cita no asistió',
  appointment_completed: 'Cita completada',
  appointment_confirmed: 'Cita confirmada',
  pet_created: 'Mascota creada',
  pet_updated: 'Mascota editada',
  photo_uploaded: 'Foto clínica subida',
  cartilla_photo_updated: 'Foto de cartilla actualizada',
  cartilla_photo_reverted: 'Foto de cartilla restaurada',
  alert_created: 'Alerta creada',
  alert_deleted: 'Alerta resuelta',
  owner_transferred: 'Dueño transferido',
  invoice_cancelled: 'Factura cancelada',
  user_deactivated: 'Usuario desactivado',
  consultation_deleted: 'Consulta eliminada',
  staff_photo_updated: 'Foto del personal actualizada',
  clinic_logo_updated: 'Logo de la clínica actualizado',
  plan_updated: 'Plan de vacunación editado',
  hospitalization_discharged: 'Alta de hospitalización',
  hospitalization_discharge_requested: 'Alta de hospitalización solicitada',
  hospitalization_task_completed: 'Tarea de hospitalización completada',
  cartilla_share_link_created: 'Enlace de cartilla generado',
}

const ACTOR_LABELS: Record<string, string> = {
  user: 'Personal',
  owner: 'Dueño',
}

const ENTITY_LABELS: Record<string, string> = {
  appointment: 'Cita',
  pet: 'Mascota',
  consultation: 'Consulta',
  invoice: 'Factura',
  user: 'Usuario',
  pet_photo: 'Foto clínica',
  cartilla_photo: 'Foto de cartilla',
  clinic: 'Clínica',
  product: 'Producto',
  clinical_alert: 'Alerta clínica',
  alert: 'Alerta',
  owner: 'Dueño',
  carnet_record: 'Registro de vacuna',
  pet_carnet_record: 'Carnet de vacunas',
  smart_alert: 'Alerta inteligente',
  purchase_order: 'Orden de compra',
  inventory_product: 'Insumo',
  appointment_waitlist: 'Lista de espera',
  consultation_item: 'Partida de consulta',
  invoice_item: 'Partida de factura',
  hospitalization: 'Hospitalización',
  hospitalization_task: 'Tarea de hospitalización',
  schedule_block: 'Bloque de horario',
  vaccination_plan: 'Plan de vacunación',
}

const FIELD_LABELS: Record<string, string> = {
  photo_url: 'foto de perfil',
  clinical_photo_url: 'foto clínica',
  cartilla_photo_url: 'foto de cartilla',
  cartilla_photo_prev_url: 'foto anterior',
  color_primary: 'color principal',
  color_secondary: 'color secundario',
  markings: 'marcas',
  breed: 'raza',
  birth_date: 'fecha de nacimiento',
  allergies: 'alergias',
  weight_kg: 'peso',
  name: 'nombre',
  phone: 'teléfono',
  email: 'correo',
  status: 'estado',
  price: 'precio',
  role: 'rol',
  branch_id: 'sucursal',
  description: 'descripción',
  compound: 'compuesto',
  species: 'especie',
  brand: 'marca',
  prevents: 'enfermedades que previene',
  notes: 'notas',
  active: 'activo',
}

const METADATA_LABELS: Record<string, string> = {
  pet_name: 'Mascota',
  pet_id: 'Mascota',
  owner_id: 'Dueño',
  appointment_id: 'Cita',
  consultation_id: 'Consulta',
  invoice_id: 'Factura',
  user_id: 'Usuario',
  source: 'Origen',
  vaccine: 'Vacuna',
  brand: 'Marca',
  lot: 'Lote',
  date_applied: 'Fecha de aplicación',
  from: 'De',
  to: 'A',
  status: 'Estado',
}

function humanize(s: string): string {
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function humanDetail(e: AuditEntry): string {
  const m = e.metadata_json
  if (!m) return '—'
  if (Array.isArray(m.fields)) {
    const labels = (m.fields as string[]).map((f) => FIELD_LABELS[f] ?? humanize(f))
    return `Se actualizó: ${labels.join(', ')}`
  }
  const parts: string[] = []
  for (const [k, v] of Object.entries(m)) {
    if (v === null || v === undefined || v === '') continue
    if (k === 'seed') continue
    if (typeof v === 'object') continue
    const label = METADATA_LABELS[k] ?? humanize(k)
    parts.push(`${label}: ${v}`)
  }
  return parts.length ? parts.join(' · ') : '—'
}

export function Audit() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [action, setAction] = useState(FILTER_ALL)
  const [entityType, setEntityType] = useState(FILTER_ALL)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (entityType && entityType !== FILTER_ALL) params.set('entity_type', entityType)
      if (action && action !== FILTER_ALL) params.set('action', action)
      const res = await apiFetch<AuditEntry[]>(`/audit-log?${params}`)
      setEntries(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la bitácora')
    } finally {
      setLoading(false)
    }
  }, [action, entityType])

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bitácora de auditoría</h1>
          <p className="text-sm text-muted-foreground">
            Registro de cambios: fotos, cancelaciones y ediciones
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Acción</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Todas las acciones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>Todas</SelectItem>
              {Object.entries(ACTIONS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Registro</Label>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>Todos</SelectItem>
              {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={load} disabled={loading}>
          Filtrar
        </Button>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando bitácora…" />}

      {!loading && !error && entries.length === 0 && (
        <EmptyState
          title="Sin registros"
          description="Los cambios (fotos, cancelaciones, ediciones) aparecerán aquí."
          icon={History}
        />
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead>Quién lo hizo</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(e.created_at).toLocaleString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{ACTIONS[e.action] ?? humanize(e.action)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {ENTITY_LABELS[e.entity_type] ?? humanize(e.entity_type)}
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                      #{e.entity_id.slice(0, 6)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-medium">
                      {e.actor_name ?? ACTOR_LABELS[e.actor_type] ?? humanize(e.actor_type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{humanDetail(e)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppLayout>
  )
}