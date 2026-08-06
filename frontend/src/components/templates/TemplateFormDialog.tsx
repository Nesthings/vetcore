import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ConsultationTemplate, TemplateField } from '@/pages/Templates'
import { apiFetch } from '@/lib/api'

const FIELD_TYPES = ['text', 'textarea', 'number', 'select']

const emptyField = (): TemplateField => ({
  key: '',
  label: '',
  type: 'text',
  options: [],
  required: false,
})

export function TemplateFormDialog({
  open,
  template,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  template: ConsultationTemplate | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [species, setSpecies] = useState('')
  const [fields, setFields] = useState<TemplateField[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(template?.name ?? '')
      setSpecies(template?.species ?? '')
      setFields(
        template?.fields?.length
          ? template.fields.map((f) => ({ ...f, options: [...(f.options ?? [])] }))
          : [emptyField()],
      )
      setError(null)
    }
  }, [open, template])

  const updateField = (idx: number, patch: Partial<TemplateField>) => {
    setFields((list) => list.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  }

  const updateOptions = (idx: number, value: string) => {
    setFields((list) =>
      list.map((f, i) =>
        i === idx
          ? {
              ...f,
              options: value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : f,
      ),
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const validFields = fields.filter((f) => f.key.trim() && f.label.trim())
    for (const f of validFields) {
      if (!/^[a-z0-9_]+$/.test(f.key)) {
        setError(`La clave "${f.key}" solo admite minúsculas, números y guion bajo.`)
        return
      }
    }
    setSubmitting(true)
    try {
      const body = JSON.stringify({ name, species: species || null, fields: validFields })
      if (template) {
        await apiFetch(`/templates/${template.id}`, { method: 'PATCH', body })
      } else {
        await apiFetch('/templates', { method: 'POST', body })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la plantilla')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
          <DialogDescription>Define los campos que guiarán la consulta.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Especie</Label>
              <Input
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                placeholder="Ej. perro"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Campos</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setFields((l) => [...l, emptyField()])}
              >
                <Plus /> Agregar campo
              </Button>
            </div>
            {fields.map((f, idx) => (
              <div key={idx} className="space-y-2 rounded-md border border-border p-3">
                <div className="grid grid-cols-[1fr_1fr_130px_auto] gap-2">
                  <Input
                    placeholder="clave (minúsculas)"
                    value={f.key}
                    onChange={(e) => updateField(idx, { key: e.target.value })}
                  />
                  <Input
                    placeholder="Etiqueta"
                    value={f.label}
                    onChange={(e) => updateField(idx, { label: e.target.value })}
                  />
                  <select
                    value={f.type}
                    onChange={(e) =>
                      updateField(idx, { type: e.target.value as TemplateField['type'] })
                    }
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setFields((l) => l.filter((_, i) => i !== idx))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  {f.type === 'select' && (
                    <Input
                      className="flex-1"
                      placeholder="Opciones separadas por coma"
                      value={f.options?.join(', ') ?? ''}
                      onChange={(e) => updateOptions(idx, e.target.value)}
                    />
                  )}
                  <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) => updateField(idx, { required: e.target.checked })}
                    />
                    Obligatorio
                  </label>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : 'Guardar plantilla'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
