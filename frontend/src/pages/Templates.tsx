import { useCallback, useEffect, useState } from 'react'
import { FilePlus2, Pencil, Plus, Trash2 } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { TemplateFormDialog } from '@/components/templates/TemplateFormDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
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

export interface TemplateField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select'
  options?: string[] | null
  required: boolean
}

export interface ConsultationTemplate {
  id: string
  name: string
  species?: string | null
  fields: TemplateField[]
  created_at: string
}

export function Templates() {
  const [templates, setTemplates] = useState<ConsultationTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ConsultationTemplate | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<ConsultationTemplate[]>('/templates')
      setTemplates(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las plantillas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const remove = async (t: ConsultationTemplate) => {
    if (!confirm(`¿Eliminar la plantilla "${t.name}"?`)) return
    try {
      await apiFetch(`/templates/${t.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la plantilla')
    }
  }

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plantillas de consulta</h1>
          <p className="text-sm text-muted-foreground">
            Campos reutilizables que guían la captura de una consulta
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus /> Nueva plantilla
        </Button>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando plantillas…" />}

      {!loading && !error && templates.length === 0 && (
        <EmptyState
          title="Sin plantillas"
          description="Crea plantillas para estandarizar tus consultas."
          icon={FilePlus2}
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus /> Nueva plantilla
            </Button>
          }
        />
      )}

      {!loading && !error && templates.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plantilla</TableHead>
                <TableHead>Especie</TableHead>
                <TableHead>Campos</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    {t.species ? <Badge variant="secondary">{t.species}</Badge> : '—'}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <div className="flex flex-wrap gap-1">
                      {t.fields.map((f) => (
                        <Badge key={f.key} variant="outline">
                          {f.label}
                          {f.required ? ' *' : ''}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${t.name}`}
                      onClick={() => {
                        setEditing(t)
                        setFormOpen(true)
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Eliminar ${t.name}`}
                      className="text-destructive"
                      onClick={() => remove(t)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TemplateFormDialog
        open={formOpen}
        template={editing}
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
