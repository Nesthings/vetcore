import { useEffect, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Combobox de marca autocontenido: cada instancia maneja su propio estado y
 * cierre por clic externo, así funciona tanto en la tabla como en las tarjetas. */
export function BrandCombobox({
  value,
  onChange,
  brands,
  className,
}: {
  value: string
  onChange: (v: string) => void
  brands: string[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const filtered = brands.filter((b) => b.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label>Marca</Label>
      <div className="relative" ref={ref}>
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Busca la marca…"
          className="w-52"
          autoComplete="off"
        />
        {open && (
          <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-card">
            {filtered.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">Sin coincidencias.</p>
            ) : (
              filtered.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    onChange(b)
                    setQuery(b)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  {b}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
