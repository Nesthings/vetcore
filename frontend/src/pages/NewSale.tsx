import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Package,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Users,
} from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Pet } from '@/pages/Pets'
import { apiFetch } from '@/lib/api'
import type { SaleProduct } from '@/lib/product'

interface Branch {
  id: string
  name: string
}

interface ProductLine {
  key: string
  product_id: string
  name: string
  price: number
  stock: number
  quantity: number
}

interface SaleResult {
  invoice_id: string
  receipt_pdf_url: string
  total: number
}

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function NewSale() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [products, setProducts] = useState<SaleProduct[]>([])
  const [branchId, setBranchId] = useState('')
  const [lines, setLines] = useState<ProductLine[]>([])
  const [dateTime, setDateTime] = useState(toLocalInput(new Date()))
  const [sendWhatsapp, setSendWhatsapp] = useState(false)
  const [sendEmail, setSendEmail] = useState(false)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Pet[]>([])
  const [searching, setSearching] = useState(false)
  const [pet, setPet] = useState<Pet | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<SaleResult | null>(null)

  const load = useCallback(async () => {
    try {
      const [br, pr] = await Promise.all([
        apiFetch<Branch[]>('/branches'),
        apiFetch<SaleProduct[]>('/products?active_only=true'),
      ])
      setBranches(br)
      setProducts(pr)
      if (br.length > 0) setBranchId((cur) => cur || br[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la información')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const subtotal = useMemo(() => lines.reduce((acc, l) => acc + l.price * l.quantity, 0), [lines])

  const productStock = (productId: string) =>
    products.find((p) => p.id === productId)?.stock_quantity ?? 0

  const addProduct = (productId: string) => {
    if (!productId) return
    const prod = products.find((p) => p.id === productId)
    if (!prod) return
    const price = prod.price
    if (price == null) return
    setLines((list) => [
      ...list,
      {
        key: crypto.randomUUID(),
        product_id: prod.id,
        name: prod.name,
        price,
        stock: prod.stock_quantity,
        quantity: 1,
      },
    ])
  }

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    try {
      const res = await apiFetch<Pet[]>(`/pets?search=${encodeURIComponent(query.trim())}`)
      setResults(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar la mascota')
    } finally {
      setSearching(false)
    }
  }

  const pickPet = (id: string) => {
    const found = results.find((p) => p.id === id)
    setPet(found ?? null)
    setResults([])
    setQuery('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (lines.length === 0) {
      setError('Agrega al menos un producto.')
      return
    }
    setSubmitting(true)
    try {
      const res = await apiFetch<SaleResult>('/sales', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          pet_id: pet?.id ?? null,
          products: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
          performed_at: new Date(dateTime).toISOString(),
          send_receipt_whatsapp: sendWhatsapp,
          send_receipt_email: sendEmail,
        }),
      })
      setDone(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la venta')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-md py-16">
          <Card className="shadow-card">
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
              <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
              <h1 className="text-xl font-semibold">Venta registrada</h1>
              <p className="text-sm text-muted-foreground">
                Se cobraron ${done.total.toFixed(2)} y se descontó el stock del catálogo.
              </p>
              <div className="flex w-full flex-col gap-2">
                <Button asChild>
                  <a href={done.receipt_pdf_url} target="_blank" rel="noreferrer">
                    <Printer /> Imprimir recibo (PDF)
                  </a>
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/">Volver al dashboard</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/"
          className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
          aria-label="Volver"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nueva venta</h1>
          <p className="text-sm text-muted-foreground">
            Venta de mostrador de productos — descuenta el stock real
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="max-w-3xl space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Sucursal</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Paciente (opcional)</CardTitle>
              <CardDescription>
                Si el cliente trae mascota, vincula la venta a su expediente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), search())}
                  placeholder="Buscar mascota por nombre…"
                />
                <Button type="button" variant="outline" onClick={search} disabled={searching}>
                  {searching ? <Loader2 className="animate-spin" /> : <Search />}
                </Button>
              </div>
              {results.length > 0 && (
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border p-1">
                  {results.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => pickPet(p.id)}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.owners?.find((o) => o.is_active)?.full_name ?? ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {pet && (
                <div className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2">
                  <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span className="font-medium">{pet.name}</span>
                  <Badge variant="secondary" className="ml-auto">
                    Seleccionado
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Productos</CardTitle>
            <CardDescription>
              Del catálogo de Productos — al cobrar se descuenta la existencia
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              defaultValue=""
              onChange={(e) => {
                addProduct(e.target.value)
                e.target.value = ''
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Agregar producto —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id} disabled={p.stock_quantity <= 0}>
                  {p.name} · ${p.price != null ? p.price.toFixed(2) : '—'}
                  {p.stock_quantity <= 0 ? ' (agotado)' : ` (${p.stock_quantity})`}
                </option>
              ))}
            </select>

            {lines.length === 0 ? (
              <EmptyState
                title="Sin productos"
                description="Selecciona los productos que lleva el cliente."
                icon={Package}
              />
            ) : (
              <div className="space-y-2">
                {lines.map((l) => (
                  <div
                    key={l.key}
                    className="flex items-center gap-2 rounded-md border border-border/60 p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ${l.price} · quedan {productStock(l.product_id)}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      max={productStock(l.product_id)}
                      value={l.quantity}
                      onChange={(e) =>
                        setLines((list) =>
                          list.map((x) =>
                            x.key === l.key ? { ...x, quantity: Number(e.target.value) || 1 } : x,
                          ),
                        )
                      }
                      className="w-20"
                    />
                    <span className="w-24 text-right text-sm font-semibold">
                      ${(l.price * l.quantity).toFixed(2)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Quitar"
                      onClick={() => setLines((list) => list.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Resumen y cobro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Fecha y hora</Label>
              <Input
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
              />
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>Total</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sendWhatsapp}
                  onChange={(e) => setSendWhatsapp(e.target.checked)}
                  className="size-4 rounded border-border"
                />
                Enviar recibo por WhatsApp
                <span className="text-xs text-muted-foreground">(lógica pendiente)</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  disabled={!pet?.owners?.find((o) => o.is_active)?.email}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="size-4 rounded border-border"
                />
                Enviar recibo por correo
                {pet?.owners?.find((o) => o.is_active)?.email ? (
                  <span className="text-xs text-muted-foreground">
                    (a {pet.owners.find((o) => o.is_active)?.email})
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">(sin correo del dueño)</span>
                )}
              </label>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <Button asChild variant="outline">
                <Link to="/">Cancelar</Link>
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    Guardando…
                  </>
                ) : (
                  <>
                    <ShieldCheck /> Cobrar y generar recibo
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </AppLayout>
  )
}
