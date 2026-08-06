import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, UserRound } from 'lucide-react'

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
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api'

interface BreedsCatalog {
  species: { key: string; label: string }[]
  breeds: Record<string, string[]>
}

export function PetFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [catalog, setCatalog] = useState<BreedsCatalog | null>(null)
  const [name, setName] = useState('')
  const [species, setSpecies] = useState('perro')
  const [breed, setBreed] = useState('')
  const [breedQuery, setBreedQuery] = useState('')
  const [breedOpen, setBreedOpen] = useState(false)
  const breedRef = useRef<HTMLDivElement>(null)
  const [addingBreed, setAddingBreed] = useState(false)
  const [sex, setSex] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [allergies, setAllergies] = useState('')
  const [alertText, setAlertText] = useState('')

  const [ownerName, setOwnerName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [altContactName, setAltContactName] = useState('')
  const [altPhone, setAltPhone] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadCatalog = useCallback(async () => {
    try {
      const res = await apiFetch<BreedsCatalog>('/pets/breeds-catalog')
      setCatalog(res)
    } catch {
      setCatalog(null)
    }
  }, [])

  useEffect(() => {
    if (open) loadCatalog()
  }, [open, loadCatalog])

  const allBreeds = catalog?.breeds[species] ?? ['Mestizo']

  const filteredBreeds = useMemo(() => {
    const q = breedQuery.trim().toLowerCase()
    if (!q) return allBreeds
    return allBreeds.filter((b) => b.toLowerCase().includes(q))
  }, [allBreeds, breedQuery])

  const exactMatch = allBreeds.some((b) => b.toLowerCase() === breedQuery.trim().toLowerCase())
  const canAdd = breedQuery.trim().length > 0 && !exactMatch

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (breedRef.current && !breedRef.current.contains(e.target as Node)) {
        setBreedOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const pickBreed = (value: string) => {
    setBreed(value)
    setBreedQuery(value)
    setBreedOpen(false)
  }

  const addCustomBreed = async () => {
    const value = breedQuery.trim()
    if (!value || addingBreed) return
    setAddingBreed(true)
    setError(null)
    try {
      await apiFetch('/pets/breeds', {
        method: 'POST',
        body: JSON.stringify({ species, breed: value }),
      })
      await loadCatalog()
      pickBreed(value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar la raza')
    } finally {
      setAddingBreed(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const owner =
        ownerName || ownerPhone || ownerEmail
          ? {
              full_name: ownerName || null,
              phone: ownerPhone || null,
              email: ownerEmail || null,
              alt_contact_name: altContactName || null,
              alt_phone: altPhone || null,
            }
          : null
      await apiFetch('/pets', {
        method: 'POST',
        body: JSON.stringify({
          name,
          species,
          breed: breed || breedQuery.trim() || null,
          sex: sex || null,
          birth_date: birthDate || null,
          allergies: allergies || null,
          clinical_alert_text: alertText || null,
          owner,
        }),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la mascota')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva mascota</DialogTitle>
          <DialogDescription>
            Da de alta a un paciente, su expediente clínico y a su dueño.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="species">Especie *</Label>
              <select
                id="species"
                value={species}
                onChange={(e) => {
                  setSpecies(e.target.value)
                  setBreed('')
                  setBreedQuery('')
                  setBreedOpen(false)
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {(
                  catalog?.species ?? [
                    { key: 'perro', label: 'Perro' },
                    { key: 'gato', label: 'Gato' },
                    { key: 'otro', label: 'Otro' },
                  ]
                ).map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="breed">Raza</Label>
              <div className="relative" ref={breedRef}>
                <Input
                  id="breed"
                  value={breedQuery}
                  onChange={(e) => {
                    setBreedQuery(e.target.value)
                    setBreedOpen(true)
                  }}
                  onFocus={() => setBreedOpen(true)}
                  placeholder="Escribe para buscar…"
                  autoComplete="off"
                />
                {breedOpen && (
                  <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-card">
                    {filteredBreeds.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => pickBreed(b)}
                        className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        {b}
                      </button>
                    ))}
                    {filteredBreeds.length === 0 && !canAdd && (
                      <p className="px-2 py-1.5 text-sm text-muted-foreground">Sin resultados.</p>
                    )}
                    {canAdd && (
                      <button
                        type="button"
                        onClick={addCustomBreed}
                        disabled={addingBreed}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-accent"
                      >
                        {addingBreed ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Plus className="size-3.5" aria-hidden="true" />
                        )}
                        Agregar «{breedQuery.trim()}» a la lista
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {exactMatch || breedQuery.trim() === ''
                  ? `${allBreeds.length} razas disponibles`
                  : 'Si no encuentras la raza, agrégala a la lista.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sex">Sexo</Label>
              <select
                id="sex"
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">—</option>
                <option value="M">Macho</option>
                <option value="H">Hembra</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="birth">Nacimiento</Label>
              <Input
                id="birth"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allergies">Alergias</Label>
            <Textarea
              id="allergies"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="Ej. Penicilina, alimentos con maíz…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="alert">Alerta clínica</Label>
            <Textarea
              id="alert"
              value={alertText}
              onChange={(e) => setAlertText(e.target.value)}
              placeholder="Ej. Muerde al ser manipulado; epiléptico…"
            />
          </div>

          <div className="rounded-md border border-border p-4">
            <div className="mb-3 flex items-center gap-2">
              <UserRound className="size-4 text-primary" aria-hidden="true" />
              <p className="text-sm font-medium">Dueño de la mascota</p>
            </div>
            <div className="grid gap-3">
              <div className="space-y-2">
                <Label htmlFor="owner-name">Nombre</Label>
                <Input
                  id="owner-name"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Nombre del dueño"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="owner-phone">Número de contacto</Label>
                  <Input
                    id="owner-phone"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    placeholder="55 1234 5678"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owner-email">Correo</Label>
                  <Input
                    id="owner-email"
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <div className="h-px flex-1 bg-border" aria-hidden="true" />
                <span className="text-xs font-medium text-muted-foreground">
                  Contacto alternativo
                </span>
                <div className="h-px flex-1 bg-border" aria-hidden="true" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="alt-name">Nombre alternativo</Label>
                  <Input
                    id="alt-name"
                    value={altContactName}
                    onChange={(e) => setAltContactName(e.target.value)}
                    placeholder="Nombre de respaldo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="alt-phone">Número alternativo</Label>
                  <Input
                    id="alt-phone"
                    value={altPhone}
                    onChange={(e) => setAltPhone(e.target.value)}
                    placeholder="55 9876 5432"
                  />
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : 'Guardar mascota'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
