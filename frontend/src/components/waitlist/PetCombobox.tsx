import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

interface PetOption {
  id: string
  name: string
  owners?: string[]
}

interface PetSearchResult {
  id: string
  name: string
  owners?: Array<{ full_name?: string | null }> | null
}

const SPECIES_OPTIONS = [
  { value: 'perro', label: 'Perro' },
  { value: 'gato', label: 'Gato' },
  { value: 'ave', label: 'Ave' },
  { value: 'conejo', label: 'Conejo' },
  { value: 'roedor', label: 'Roedor' },
  { value: 'reptil', label: 'Reptil' },
  { value: 'hurones', label: 'Hurón' },
  { value: 'equino', label: 'Equino' },
  { value: 'otro', label: 'Otro' },
]

/** Buscador de pacientes con filtrado en vivo (server-side) y alta rápida
 *  cuando no hay coincidencia. */
export function PetCombobox({
  value,
  selectedName,
  onSelect,
}: {
  value: string
  selectedName?: string | null
  onSelect: (pet: PetOption | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(selectedName ?? '')
  const [results, setResults] = useState<PetOption[]>([])
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)
  const [quickSpecies, setQuickSpecies] = useState('perro')
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    if (value && selectedName) setQuery(selectedName)
    if (!value) setQuery('')
  }, [value, selectedName])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const term = query.trim()
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const params = new URLSearchParams()
        if (term) params.set('search', term)
        params.set('limit', '100')
        const res = await apiFetch<PetSearchResult[]>(`/pets?${params}`)
        if (!cancelled) {
          setResults(
            res.map((p) => ({
              id: p.id,
              name: p.name,
              owners: (p.owners ?? [])
                .map((o) => o.full_name)
                .filter((n): n is string => Boolean(n))
                .slice(0, 2),
            })),
          )
        }
      } catch {
        if (!cancelled) setError('No se pudieron buscar pacientes')
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, term ? 250 : 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, open])

  const term = query.trim()
  const showQuickAdd = Boolean(term) && !searching && results.length === 0

  const createPet = async () => {
    setError(null)
    setCreating(true)
    try {
      const created = await apiFetch<PetOption>('/pets', {
        method: 'POST',
        body: JSON.stringify({ name: term, species: quickSpecies }),
      })
      onSelect({ id: created.id, name: created.name })
      setQuery(created.name)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la mascota')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label>Paciente *</Label>
      <div className="relative" ref={ref}>
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (value) onSelect(null)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Busca por nombre…"
          autoComplete="off"
        />
        {open && (
          <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-card">
            {searching ? (
              <p className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Buscando…
              </p>
            ) : results.length > 0 ? (
              results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect({ id: p.id, name: p.name })
                    setQuery(p.name)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full flex-col rounded px-2 py-1.5 text-left text-sm hover:bg-accent',
                    value === p.id && 'text-primary',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate">{p.name}</span>
                    {value === p.id && (
                      <Check className="ml-auto size-4 shrink-0" aria-hidden="true" />
                    )}
                  </span>
                  {p.owners && p.owners.length > 0 && (
                    <span className="truncate pl-1 text-[11px] text-muted-foreground">
                      Dueño: {p.owners.join(' · ')}
                    </span>
                  )}
                </button>
              ))
            ) : showQuickAdd ? (
              <div className="space-y-2 p-2">
                <p className="text-sm font-medium">Agregar nueva mascota</p>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-2 py-1.5 text-sm">
                    {term}
                  </span>
                  <select
                    value={quickSpecies}
                    onChange={(e) => setQuickSpecies(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {SPECIES_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button
                  size="sm"
                  className="w-full"
                  onClick={createPet}
                  disabled={creating}
                >
                  {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus />} Crear y usar
                </Button>
              </div>
            ) : (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">Sin coincidencias.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}