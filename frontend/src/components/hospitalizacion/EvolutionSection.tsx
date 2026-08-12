import { useCallback, useEffect, useState } from 'react'
import { Camera, FileText, Loader2, Plus, TriangleAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/api'
import {
  INCIDENT_SEVERITY_META,
  NOTE_CATEGORY_LABELS,
} from '@/lib/hospitalization'
import type {
  HospIncident,
  HospNote,
  HospPhoto,
  TimelineEvent,
} from '@/lib/hospitalization'

export function EvolutionSection({ hospitalizationId }: { hospitalizationId: string }) {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="notes">Notas</TabsTrigger>
          <TabsTrigger value="incidents">Incidencias</TabsTrigger>
          <TabsTrigger value="photos">Fotos</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <TimelineTab hospitalizationId={hospitalizationId} />
        </TabsContent>
        <TabsContent value="notes">
          <NotesTab hospitalizationId={hospitalizationId} />
        </TabsContent>
        <TabsContent value="incidents">
          <IncidentsTab hospitalizationId={hospitalizationId} />
        </TabsContent>
        <TabsContent value="photos">
          <PhotosTab hospitalizationId={hospitalizationId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TimelineTab({ hospitalizationId }: { hospitalizationId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setEvents(await apiFetch<TimelineEvent[]>(`/hospitalization/${hospitalizationId}/timeline`))
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [hospitalizationId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="py-4 text-center text-sm text-muted-foreground">Cargando…</p>
  if (events.length === 0)
    return <EmptyState title="Sin actividad" description="Aún no hay eventos en la timeline." icon={FileText} />

  return (
    <div className="relative space-y-3 pl-5">
      <div className="absolute bottom-2 left-[7px] top-2 w-px bg-gradient-to-b from-primary/40 via-border to-transparent" aria-hidden="true" />
      {events.map((e, i) => (
        <div key={i} className="relative">
          <span className="absolute -left-5 top-1 size-3.5 rounded-full border-2 border-card bg-primary" aria-hidden="true" />
          <div className="rounded-lg border border-border/60 bg-card p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{e.title}</p>
              <span className="text-xs text-muted-foreground">
                {new Date(e.at).toLocaleString('es-MX', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{e.description || '—'}</p>
            {e.photo_url && (
              <img src={e.photo_url} alt={e.title} className="mt-2 max-h-40 rounded-lg border border-border object-cover" />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function NotesTab({ hospitalizationId }: { hospitalizationId: string }) {
  const { toast } = useToast()
  const [items, setItems] = useState<HospNote[]>([])
  const [category, setCategory] = useState('evolution')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await apiFetch<HospNote[]>(`/hospitalization/${hospitalizationId}/notes`))
    } catch {
      setItems([])
    }
  }, [hospitalizationId])

  useEffect(() => {
    load()
  }, [load])

  const submit = async () => {
    if (!text.trim()) return
    setBusy(true)
    try {
      await apiFetch(`/hospitalization/${hospitalizationId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ category, text: text.trim() }),
      })
      toast({ title: 'Nota guardada', variant: 'success' })
      setText('')
      load()
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err instanceof Error ? err.message : 'Error.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          {Object.entries(NOTE_CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe una nota…" className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
        <Button size="sm" variant="outline" onClick={submit} disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <Plus />} Agregar
        </Button>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <EmptyState title="Sin notas" description="Añade la primera nota de evolución." icon={FileText} />
        ) : (
          items.map((n) => (
            <div key={n.id} className="rounded-lg border border-border/60 bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">{NOTE_CATEGORY_LABELS[n.category] ?? n.category}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleString('es-MX')}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm">{n.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function IncidentsTab({ hospitalizationId }: { hospitalizationId: string }) {
  const { toast } = useToast()
  const [items, setItems] = useState<HospIncident[]>([])
  const [severity, setSeverity] = useState('medium')
  const [description, setDescription] = useState('')
  const [actions, setActions] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await apiFetch<HospIncident[]>(`/hospitalization/${hospitalizationId}/incidents`))
    } catch {
      setItems([])
    }
  }, [hospitalizationId])

  useEffect(() => {
    load()
  }, [load])

  const submit = async () => {
    if (!description.trim()) return
    setBusy(true)
    try {
      await apiFetch(`/hospitalization/${hospitalizationId}/incidents`, {
        method: 'POST',
        body: JSON.stringify({ severity, description: description.trim(), actions_taken: actions || null }),
      })
      toast({ title: 'Incidencia registrada', variant: 'success' })
      setDescription('')
      setActions('')
      load()
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err instanceof Error ? err.message : 'Error.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex gap-2">
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe la incidencia…" className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
          <Button size="sm" variant="outline" onClick={submit} disabled={busy || !description.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <TriangleAlert />} Registrar
          </Button>
        </div>
        <input value={actions} onChange={(e) => setActions(e.target.value)} placeholder="Acciones realizadas (opcional)" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <EmptyState title="Sin incidencias" description="No hay incidencias registradas." icon={TriangleAlert} />
        ) : (
          items.map((inc) => {
            const meta = INCIDENT_SEVERITY_META[inc.severity] ?? INCIDENT_SEVERITY_META.medium
            return (
              <div key={inc.id} className="rounded-lg border border-border/60 bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={meta.badge}>{meta.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(inc.observed_at).toLocaleString('es-MX')}
                  </span>
                </div>
                <p className="mt-1.5 text-sm">{inc.description}</p>
                {inc.actions_taken && <p className="mt-1 text-xs text-muted-foreground">Acciones: {inc.actions_taken}</p>}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function PhotosTab({ hospitalizationId }: { hospitalizationId: string }) {
  const { toast } = useToast()
  const [items, setItems] = useState<HospPhoto[]>([])
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState('evolution')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await apiFetch<HospPhoto[]>(`/hospitalization/${hospitalizationId}/photos`))
    } catch {
      setItems([])
    }
  }, [hospitalizationId])

  useEffect(() => {
    load()
  }, [load])

  const onFile = async (file: File) => {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('category', category)
      if (label.trim()) fd.append('label', label.trim())
      await apiFetch(`/hospitalization/${hospitalizationId}/photos`, { method: 'POST', body: fd })
      toast({ title: 'Fotografía subida', variant: 'success' })
      setLabel('')
      load()
    } catch (err) {
      toast({ title: 'No se pudo subir', description: err instanceof Error ? err.message : 'Error.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="evolution">Evolución</option>
          <option value="wound">Herida</option>
          <option value="lesion">Lesión</option>
          <option value="procedure">Procedimiento</option>
          <option value="other">Otro</option>
        </select>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Etiqueta (opcional)" className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm" />
        <label className="inline-flex cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
              e.target.value = ''
            }}
          />
          <Button asChild size="sm" variant="outline" disabled={busy}>
            <span>
              {busy ? <Loader2 className="animate-spin" /> : <Camera />} Subir foto
            </span>
          </Button>
        </label>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Sin fotos" description="Sube fotografías para comparar la evolución." icon={Camera} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((p) => (
            <figure key={p.id} className="overflow-hidden rounded-lg border border-border">
              <img src={p.url} alt={p.label ?? 'Foto'} className="h-32 w-full object-cover" />
              <figcaption className="px-2 py-1.5 text-xs text-muted-foreground">
                {p.label ?? 'Foto'} · {new Date(p.taken_at).toLocaleDateString('es-MX')}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
