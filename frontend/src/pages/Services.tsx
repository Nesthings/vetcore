import { useCallback, useEffect, useState } from 'react'
import { BadgePercent, Pencil, Plus, Stethoscope } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { StatChip } from '@/components/ui/stat-chip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ServiceFormDialog } from '@/components/services/ServiceFormDialog'
import { apiFetch } from '@/lib/api'

export interface Service {
  id: string
  name: string
  price: number
  discount_percent: number
}

export function Services() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<Service[]>('/services')
      setServices(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el catálogo')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catálogo de servicios</h1>
          <p className="text-sm text-muted-foreground">
            Servicios y precios — el descuento configurado se aplica automáticamente al facturar
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus /> Nuevo servicio
        </Button>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando catálogo…" />}

      {!loading && !error && services.length === 0 && (
        <EmptyState
          title="Sin servicios"
          description="Agrega servicios con su precio para poder facturarlos."
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus /> Nuevo servicio
            </Button>
          }
        />
      )}

      {!loading && !error && services.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatChip
            label="Servicios en catálogo"
            value={services.length}
            icon={Stethoscope}
            tint="bg-info/10 text-info"
          />
          <StatChip
            label="Con descuento automático"
            value={services.filter((s) => Number(s.discount_percent) > 0).length}
            icon={BadgePercent}
            tint="bg-warning/10 text-warning"
          />
        </div>
      )}

      {!loading && !error && services.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Servicio</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Descuento automático</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>${Number(s.price).toFixed(2)}</TableCell>
                  <TableCell>
                    {Number(s.discount_percent) > 0 ? `${s.discount_percent}%` : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${s.name}`}
                      onClick={() => {
                        setEditing(s)
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

      <ServiceFormDialog
        open={formOpen}
        service={editing}
        onOpenChange={setFormOpen}
        onSaved={() => {
          setFormOpen(false)
          setEditing(null)
          load()
        }}
      />
    </AppLayout>
  )
}
