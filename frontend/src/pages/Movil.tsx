import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon as MDIIcon } from '@mdi/react'
import { mdiPaw } from '@mdi/js'
import {
  ArrowLeft,
  Camera,
  FileText,
  Home,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api'
import { SPECIES_ICONS, speciesLabel } from '@/lib/species'

interface PetHit {
  id: string
  name: string
  species: string
  breed?: string | null
}

interface PhotoItem {
  id: string
  url: string
  label?: string | null
  taken_at: string
}

type Session = { kind: 'pet'; petId: string; name: string } | { kind: 'walkin'; name: string }

const SPECIES_OPTIONS = [
  'perro',
  'gato',
  'ave',
  'conejo',
  'reptil',
  'roedor',
  'hurones',
  'peces',
  'anfibio',
  'equino',
  'otro',
]

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function dateFromAge(years: number, months: number): Date {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  d.setMonth(d.getMonth() - months)
  return d
}

export function Movil() {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<PetHit[]>([])
  const [searching, setSearching] = useState(false)
  const [session, setSession] = useState<Session | null>(null)

  // alta rápida / walk-in
  const [mode, setMode] = useState<'search' | 'register' | 'walkin'>('search')
  const [name, setName] = useState('')
  const [species, setSpecies] = useState('perro')
  const [ageYears, setAgeYears] = useState('')
  const [ageMonths, setAgeMonths] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // sesión de fotos
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [label, setLabel] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const runSearch = useCallback(async (q: string) => {
    setSearching(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('search', q.trim())
      params.set('limit', '20')
      setHits(await apiFetch<PetHit[]>(`/pets?${params}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar')
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), query.trim() ? 250 : 0)
    return () => clearTimeout(t)
  }, [query, runSearch])

  const startPetSession = (pet: PetHit) => {
    setSession({ kind: 'pet', petId: pet.id, name: pet.name })
    setMode('search')
    setQuery('')
    setHits([])
    setPhotos([])
    setLabel('')
  }

  const registerAndStart = async () => {
    setFormError(null)
    if (!name.trim()) {
      setFormError('Escribe el nombre de la mascota')
      return
    }
    setSaving(true)
    try {
      const y = Number(ageYears) || 0
      const m = Number(ageMonths) || 0
      const pet = await apiFetch<PetHit>('/pets', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          species,
          birth_date: y || m ? toDateInput(dateFromAge(y, m)) : null,
        }),
      })
      startPetSession(pet)
      setName('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo registrar')
    } finally {
      setSaving(false)
    }
  }

  const loadPhotos = useCallback(async (s: Session) => {
    setError(null)
    try {
      if (s.kind === 'pet') {
        setPhotos(await apiFetch<PhotoItem[]>(`/pets/${s.petId}/photos`))
      } else {
        const params = new URLSearchParams({ name: s.name })
        const res = await apiFetch<(PhotoItem & { walk_in_name?: string })[]>(
          `/pets/photos/walkin?${params}`,
        )
        setPhotos(res.map((p) => ({ id: p.id, url: p.url, label: p.label, taken_at: p.taken_at })))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las fotos')
    }
  }, [])

  useEffect(() => {
    if (session) loadPhotos(session)
  }, [session, loadPhotos])

  const upload = async (file: File) => {
    if (!session) return
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (label.trim()) fd.append('label', label.trim())
      if (session.kind === 'pet') {
        await apiFetch(`/pets/${session.petId}/photos`, { method: 'POST', body: fd })
      } else {
        fd.append('name', session.name)
        await apiFetch('/pets/photos/walkin', { method: 'POST', body: fd })
      }
      setLabel('')
      await loadPhotos(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto')
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = async (p: PhotoItem) => {
    if (!session) return
    if (!confirm('¿Eliminar esta foto?')) return
    setError(null)
    try {
      if (session.kind === 'pet') {
        await apiFetch(`/pets/${session.petId}/photos/${p.id}`, { method: 'DELETE' })
      } else {
        await apiFetch(`/pets/photos/walkin/${p.id}`, { method: 'DELETE' })
      }
      await loadPhotos(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la foto')
    }
  }

  if (session) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setSession(null)}
            className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground"
            aria-label="Volver"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold">{session.name}</p>
            <p className="text-xs text-muted-foreground">
              {session.kind === 'walkin' ? 'Sin registro (walk-in)' : 'Sesión de fotos'}
            </p>
          </div>
          <Link
            to="/"
            className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground"
            aria-label="Inicio"
          >
            <Home className="size-4" />
          </Link>
        </header>

        <main className="flex flex-1 flex-col gap-5 p-4">
          {session.kind === 'walkin' && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              El paciente no quedó registrado. Las fotos se guardan con este nombre; la recepción
              puede registrar a la mascota después y finalizar su consulta.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="movil-label">Etiqueta (opcional)</Label>
            <Input
              id="movil-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej. herida pata trasera, post-curación…"
            />
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload(f)
              e.target.value = ''
            }}
          />
          <Button
            size="lg"
            className="h-16 gap-2 text-base"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <Camera className="size-5" />}
            {uploading ? 'Subiendo…' : 'Tomar foto'}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Fotos de esta sesión ({photos.length})
            </p>
            {photos.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                <Camera className="size-6 text-muted-foreground/50" aria-hidden="true" />
                Aún no hay fotos. Toma la primera con la cámara.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {photos.map((p) => (
                  <div
                    key={p.id}
                    className="group relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
                  >
                    <img
                      src={p.url}
                      alt={p.label ?? 'Foto'}
                      className="aspect-square w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(p)}
                      className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-destructive"
                      aria-label="Eliminar foto"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    {p.label && (
                      <p className="border-t border-border/60 bg-card px-2 py-1.5 text-xs font-medium">
                        {p.label}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Modo veterinario</h1>
            <p className="text-xs text-muted-foreground">Fotos de la consulta</p>
          </div>
          <Link
            to="/"
            className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground"
            aria-label="Inicio"
          >
            <Home className="size-4" />
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4">
        {mode === 'search' && (
          <>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre…"
                className="h-14 pl-11 text-base"
                autoFocus
                autoComplete="off"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {searching && <Loader2 className="mx-auto animate-spin text-primary" />}

            {!searching && query.trim() && hits.length === 0 && (
              <div className="space-y-2 rounded-xl border border-border/60 p-4">
                <p className="text-sm font-medium">No se encontró «{query.trim()}».</p>
                <div className="grid gap-2">
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => {
                      setName(query.trim())
                      setMode('register')
                    }}
                  >
                    <UserPlus /> Registrar mascota
                  </Button>
                  <Button
                    variant="ghost"
                    className="justify-start text-muted-foreground"
                    onClick={() => {
                      setName(query.trim())
                      setMode('walkin')
                    }}
                  >
                    <FileText /> Continuar sin registro
                  </Button>
                </div>
              </div>
            )}

            {hits.length > 0 && (
              <div className="space-y-2">
                {hits.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => startPetSession(p)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-300">
                      <MDIIcon
                        path={SPECIES_ICONS[p.species] ?? mdiPaw}
                        size={0.9}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold">{p.name}</span>
                      <span className="block truncate text-xs capitalize text-muted-foreground">
                        {speciesLabel(p.species)}
                        {p.breed ? ` · ${p.breed}` : ''}
                      </span>
                    </span>
                    <Badge variant="outline">Abrir</Badge>
                  </button>
                ))}
              </div>
            )}

            {!query.trim() && !searching && (
              <p className="text-center text-sm text-muted-foreground">
                Escribe el nombre del paciente para empezar la sesión de fotos.
              </p>
            )}
          </>
        )}

        {mode === 'register' && (
          <div className="space-y-4 rounded-xl border border-border/60 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Registrar mascota</p>
              <button
                type="button"
                onClick={() => setMode('search')}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Especie</Label>
              <select
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
              >
                {SPECIES_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {speciesLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Edad (años)</Label>
                <Input
                  type="number"
                  min={0}
                  value={ageYears}
                  onChange={(e) => setAgeYears(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Edad (meses)</Label>
                <Input
                  type="number"
                  min={0}
                  max={11}
                  value={ageMonths}
                  onChange={(e) => setAgeMonths(e.target.value)}
                />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button className="w-full" onClick={registerAndStart} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Plus />} Registrar y continuar
            </Button>
          </div>
        )}

        {mode === 'walkin' && (
          <div className="space-y-4 rounded-xl border border-border/60 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Continuar sin registro</p>
              <button
                type="button"
                onClick={() => setMode('search')}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-2">
              <Label>Nombre del paciente *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button
              className="w-full"
              onClick={() => {
                if (!name.trim()) {
                  setFormError('Escribe el nombre del paciente')
                  return
                }
                setFormError(null)
                setSession({ kind: 'walkin', name: name.trim() })
                setName('')
              }}
            >
              <FileText /> Continuar
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
