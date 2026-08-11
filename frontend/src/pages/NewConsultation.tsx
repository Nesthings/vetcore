import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Package,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Syringe,
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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { BrandCombobox } from '@/components/pets/BrandCombobox'
import type { Pet, PetOwner } from '@/pages/Pets'
import { apiFetch } from '@/lib/api'
import type { SaleProduct } from '@/lib/product'
import type { PetVaccinationPlan } from '@/lib/vaccination'

interface Branch {
  id: string
  name: string
}

interface ServiceOption {
  id: string
  name: string
  price: number
  discount_percent: number
}

interface ServiceLine {
  key: string
  service_id: string
  name: string
  price: number
  discount: number
  quantity: number
}

interface ProductLine {
  key: string
  product_id: string
  name: string
  price: number
  stock: number
  quantity: number
}

interface CheckoutResult {
  consultation_id: string
  invoice_id: string
  summary_pdf_url: string
  receipt_pdf_url: string
  total: number
}

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

export function NewConsultation() {
  const params = useParams<{ id: string }>()
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const petParam = searchParams.get('pet') || params.id || ''

  const [branches, setBranches] = useState<Branch[]>([])
  const [vets, setVets] = useState<{ id: string; full_name: string }[]>([])
  const [services, setServices] = useState<ServiceOption[]>([])
  const [products, setProducts] = useState<SaleProduct[]>([])

  const [pet, setPet] = useState<Pet | null>(null)
  const [owner, setOwner] = useState<PetOwner | null>(null)
  const [vaccination, setVaccination] = useState<PetVaccinationPlan[]>([])
  const [carnetVaccines, setCarnetVaccines] = useState<string[]>([])
  const [carnetBrands, setCarnetBrands] = useState<string[]>([])

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Pet[]>([])
  const [searching, setSearching] = useState(false)

  // registro de vacunación durante la consulta
  const [vaccOpen, setVaccOpen] = useState(false)
  const [vaccName, setVaccName] = useState('')
  const [vaccBrand, setVaccBrand] = useState('')
  const [vaccLot, setVaccLot] = useState('')
  const [vaccVet, setVaccVet] = useState('')
  const [vaccDate, setVaccDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [vaccBusy, setVaccBusy] = useState(false)
  const [vaccMsg, setVaccMsg] = useState<string | null>(null)
  const [lastVacc, setLastVacc] = useState<{
    vaccine: string
    brand?: string | null
    date: string
    lot?: string | null
    source: string
  } | null>(null)

  const [branchId, setBranchId] = useState('')
  const [vetUserId, setVetUserId] = useState('')
  const [reason, setReason] = useState('')
  const [weight, setWeight] = useState('')
  const [dateTime, setDateTime] = useState(toLocalInput(new Date()))
  const [sendWhatsapp, setSendWhatsapp] = useState(false)
  const [sendEmail, setSendEmail] = useState(false)

  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([])
  const [productLines, setProductLines] = useState<ProductLine[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<CheckoutResult | null>(null)

  const loadBase = useCallback(async () => {
    try {
      const [br, us, sv, pr] = await Promise.all([
        apiFetch<Branch[]>('/branches'),
        apiFetch<{ id: string; full_name: string; role: string }[]>('/users'),
        apiFetch<ServiceOption[]>('/services'),
        apiFetch<SaleProduct[]>('/products?active_only=true'),
      ])
      setBranches(br)
      setVets(us.filter((u) => u.role === 'admin' || u.role === 'veterinario'))
      setServices(sv)
      setProducts(pr)
      if (br.length > 0) setBranchId((cur) => cur || br[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la información')
    }
  }, [])

  const loadPet = useCallback(async (id: string) => {
    setError(null)
    try {
      const [p, vac, carnet] = await Promise.all([
        apiFetch<Pet>(`/pets/${id}`),
        apiFetch<PetVaccinationPlan[]>(`/vaccination-plans/pets/${id}`),
        apiFetch<{ species: string; vaccines: { name: string }[]; brands: string[] }>(
          `/pets/${id}/carnet`,
        ),
      ])
      setPet(p)
      setVaccination(vac)
      setCarnetVaccines(carnet.vaccines.map((v) => v.name))
      setCarnetBrands(carnet.brands ?? [])
      setVaccOpen(false)
      setVaccMsg(null)
      setLastVacc(null)
      const ow = p.owners?.find((o) => o.is_active) ?? null
      setOwner(ow)
      setWeight('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el paciente')
    }
  }, [])

  const reloadVaccination = useCallback(async () => {
    if (!pet) return
    try {
      const [vac, carnet] = await Promise.all([
        apiFetch<PetVaccinationPlan[]>(`/vaccination-plans/pets/${pet.id}`),
        apiFetch<{ species: string; vaccines: { name: string }[]; brands: string[] }>(
          `/pets/${pet.id}/carnet`,
        ),
      ])
      setVaccination(vac)
      setCarnetVaccines(carnet.vaccines.map((v) => v.name))
      setCarnetBrands(carnet.brands ?? [])
    } catch {
      // sin cambios si falla
    }
  }, [pet])

  useEffect(() => {
    loadBase()
  }, [loadBase])

  useEffect(() => {
    // Al cambiar de paciente (o al montar) se reinicia el formulario para
    // no heredar los valores de la consulta anterior.
    setReason('')
    setWeight('')
    setDateTime(toLocalInput(new Date()))
    setServiceLines([])
    setProductLines([])
    setSendWhatsapp(false)
    setSendEmail(false)
    setDone(null)
    setError(null)
    setPet(null)
    setOwner(null)
    setVaccination([])
    if (petParam) loadPet(petParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petParam])

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

  // Búsqueda en tiempo real mientras se escribe (como en el módulo Pacientes).
  useEffect(() => {
    const term = query.trim()
    if (!term) {
      setResults([])
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch<Pet[]>(`/pets?search=${encodeURIComponent(term)}`)
        setResults(res)
      } catch {
        // sin resultados
      } finally {
        setSearching(false)
      }
    }, 200)
    return () => {
      clearTimeout(t)
    }
  }, [query])

  const registerVacc = async () => {
    if (!pet || !vaccName || !vaccDate) {
      setVaccMsg('Selecciona la vacuna y la fecha.')
      return
    }
    setVaccBusy(true)
    setVaccMsg(null)
    setError(null)
    try {
      // Si la vacuna aplicada corresponde a una dosis programada del plan,
      // se completa esa dosis (refleja el sello y el carnet); si no, se
      // registra como aplicación manual.
      const dose = vaccination
        .flatMap((vp) => vp.doses.map((d) => ({ ...d, planName: vp.plan_name })))
        .find((d) => d.status === 'scheduled' && d.planName === vaccName)
      if (dose) {
        await apiFetch(`/vaccination-plans/doses/${dose.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'completed',
            date_applied: vaccDate,
            brand: vaccBrand || null,
            lot: vaccLot || null,
          }),
        })
      } else {
        await apiFetch(`/pets/${pet.id}/carnet`, {
          method: 'POST',
          body: JSON.stringify({
            vaccine: vaccName,
            brand: vaccBrand || null,
            date_applied: vaccDate,
            lot: vaccLot || null,
            vet_user_id: vaccVet || null,
          }),
        })
      }
      const details = {
        vaccine: vaccName,
        brand: vaccBrand || null,
        date: vaccDate,
        lot: vaccLot || null,
        source: dose ? 'Dosis del esquema completada' : 'Aplicación manual',
      }
      setLastVacc(details)
      setVaccOpen(false)
      setVaccBrand('')
      setVaccLot('')
      setVaccVet('')
      await reloadVaccination()
      setVaccMsg('Vacunación registrada.')
      toast({
        title: 'Vacunación registrada en el carnet',
        description: `${details.vaccine}${details.brand ? ` · ${details.brand}` : ''} · ${fmtDate(
          details.date,
        )}${details.lot ? ` · Lote ${details.lot}` : ''} · ${details.source}`,
        variant: 'success',
        duration: 6000,
      })
    } catch (err) {
      setVaccMsg(err instanceof Error ? err.message : 'No se pudo registrar la vacunación')
    } finally {
      setVaccBusy(false)
    }
  }

  const pickPet = (id: string) => {
    setResults([])
    setQuery('')
    loadPet(id)
  }

  const subtotal = useMemo(() => {
    const servicesTotal = serviceLines.reduce(
      (acc, l) => acc + l.price * l.quantity * (1 - l.discount / 100),
      0,
    )
    const productsTotal = productLines.reduce((acc, l) => acc + l.price * l.quantity, 0)
    return servicesTotal + productsTotal
  }, [serviceLines, productLines])

  const nextDose = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return vaccination
      .flatMap((vp) =>
        vp.doses.map((d) => ({
          ...d,
          plan: vp.plan_name,
          compound: vp.compound,
        })),
      )
      .filter((d) => d.status === 'scheduled' && d.due_date >= today)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
  }, [vaccination])

  const addService = (serviceId: string) => {
    if (!serviceId) return
    const svc = services.find((s) => s.id === serviceId)
    if (!svc) return
    setServiceLines((list) => [
      ...list,
      {
        key: crypto.randomUUID(),
        service_id: svc.id,
        name: svc.name,
        price: svc.price,
        discount: svc.discount_percent,
        quantity: 1,
      },
    ])
  }

  const addProduct = (productId: string) => {
    if (!productId) return
    const prod = products.find((p) => p.id === productId)
    if (!prod) return
    const price = prod.price
    if (price == null) return
    setProductLines((list) => [
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

  const productStock = (productId: string) =>
    products.find((p) => p.id === productId)?.stock_quantity ?? 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!pet) {
      setError('Selecciona una mascota.')
      return
    }
    if (!vetUserId) {
      setError('Selecciona a quién se consultó (veterinario).')
      return
    }
    if (serviceLines.length === 0 && productLines.length === 0) {
      setError('Selecciona al menos un servicio o producto.')
      return
    }
    setSubmitting(true)
    try {
      const res = await apiFetch<CheckoutResult>('/consultations/checkout', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          pet_id: pet.id,
          vet_user_id: vetUserId,
          reason: reason || null,
          weight_kg: weight ? Number(weight) : null,
          performed_at: new Date(dateTime).toISOString(),
          services: serviceLines.map((l) => ({ service_id: l.service_id, quantity: l.quantity })),
          products: productLines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
          send_receipt_whatsapp: sendWhatsapp,
          send_receipt_email: sendEmail,
        }),
      })
      setDone(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la consulta')
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
              <h1 className="text-xl font-semibold">Consulta completada</h1>
              <p className="text-sm text-muted-foreground">
                Se registró la consulta, la factura (${done.total.toFixed(2)}) y el recibo para
                imprimir.
              </p>
              <div className="flex w-full flex-col gap-2">
                <Button asChild>
                  <a href={done.receipt_pdf_url} target="_blank" rel="noreferrer">
                    <Printer /> Imprimir recibo (PDF)
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={done.summary_pdf_url} target="_blank" rel="noreferrer">
                    <FileText /> Ver resumen de consulta
                  </a>
                </Button>
                {sendWhatsapp && (
                  <p className="text-xs text-muted-foreground">
                    Recibo por WhatsApp: pendiente de implementar.
                  </p>
                )}
                {sendEmail && (
                  <p className="text-xs text-muted-foreground">
                    Recibo por correo: pendiente de implementar.
                  </p>
                )}
                <Button asChild variant="ghost">
                  <Link to={`/pets/${pet?.id ?? ''}`}>Volver a la ficha</Link>
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
          to={pet ? `/pets/${pet.id}` : '/'}
          className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
          aria-label="Volver"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nueva consulta</h1>
          <p className="text-sm text-muted-foreground">
            Checkout: completa la consulta, cobra servicios/productos y genera el recibo
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="max-w-4xl space-y-6">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>1. ¿A quién se consultó y qué paciente?</CardTitle>
            <CardDescription>Selecciona el veterinario y busca a la mascota</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Veterinario que atendió *</Label>
                <select
                  value={vetUserId}
                  onChange={(e) => setVetUserId(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  required
                >
                  <option value="">— Selecciona —</option>
                  {vets.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Sucursal</Label>
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
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), search())}
                placeholder="Buscar mascota por nombre…"
              />
              <Button type="button" variant="outline" onClick={search} disabled={searching}>
                {searching ? <Loader2 className="animate-spin" /> : <Search />}
                Buscar
              </Button>
            </div>

            {results.length > 0 && (
              <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border border-border p-2">
                {results.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => pickPet(p.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
                  >
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.species}
                        {p.breed ? ` · ${p.breed}` : ''}
                        {p.sex ? ` · ${p.sex === 'M' ? 'Macho' : 'Hembra'}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {p.owners?.find((o) => o.is_active)?.full_name ?? 'Sin dueño'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.owners?.find((o) => o.is_active)?.phone ?? ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {pet && (
              <div className="flex items-center gap-3 rounded-md border border-border/60 p-3">
                <div className="flex size-10 items-center justify-center rounded-md bg-secondary">
                  <Users className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{pet.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {pet.species}
                    {pet.breed ? ` · ${pet.breed}` : ''}
                    {pet.sex ? ` · ${pet.sex === 'M' ? 'Macho' : 'Hembra'}` : ''}
                    {pet.color_primary ? ` · ${pet.color_primary}` : ''}
                  </p>
                </div>
                <Badge variant="secondary">Seleccionado</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {pet && (
          <>
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>2. Dueño y contacto</CardTitle>
                <CardDescription>
                  Datos del dueño para el recibo — solo visualización (verifícalos)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {owner ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Nombre del dueño</Label>
                      <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
                        {owner.full_name || '—'}
                      </p>
                    </div>
                    <div>
                      <Label>Teléfono</Label>
                      <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
                        {owner.phone || '—'}
                      </p>
                    </div>
                    <div>
                      <Label>Correo</Label>
                      <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
                        {owner.email || '—'}
                      </p>
                    </div>
                    <div>
                      <Label>Contacto alternativo</Label>
                      <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
                        {owner.alt_contact_name || '—'}
                      </p>
                    </div>
                    <div>
                      <Label>Teléfono alternativo</Label>
                      <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
                        {owner.alt_phone || '—'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Esta mascota no tiene un dueño vinculado. Los datos del dueño no aplican.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Último peso de la mascota</CardTitle>
                  <CardDescription>Se registra en esta consulta</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label>Peso (kg)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="Ej. 12.5"
                    />
                  </div>
                  {pet.latest_weight_kg && (
                    <p className="text-xs text-muted-foreground">
                      Último registrado: {pet.latest_weight_kg} kg
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Fecha, hora y motivo</CardTitle>
                  <CardDescription>De la consulta que se está registrando</CardDescription>
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
                  <div className="space-y-2">
                    <Label>Motivo de consulta</Label>
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Ej. Vacunación anual, chequeo…"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>3. Servicios realizados</CardTitle>
                <CardDescription>Del catálogo de servicios — se suman al subtotal</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      addService(e.target.value)
                      e.target.value = ''
                    }}
                    className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">— Agregar servicio —</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · ${s.price}
                        {s.discount_percent > 0 ? ` · -${s.discount_percent}%` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {serviceLines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin servicios seleccionados.</p>
                ) : (
                  serviceLines.map((l) => (
                    <div
                      key={l.key}
                      className="flex items-center gap-2 rounded-md border border-border/60 p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        <p className="text-xs text-muted-foreground">
                          ${l.price}
                          {l.discount > 0 ? ` · -${l.discount}%` : ''}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min="1"
                        value={l.quantity}
                        onChange={(e) =>
                          setServiceLines((list) =>
                            list.map((x) =>
                              x.key === l.key ? { ...x, quantity: Number(e.target.value) || 1 } : x,
                            ),
                          )
                        }
                        className="w-20"
                      />
                      <span className="w-24 text-right text-sm font-semibold">
                        ${(l.price * l.quantity * (1 - l.discount / 100)).toFixed(2)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Quitar"
                        onClick={() =>
                          setServiceLines((list) => list.filter((x) => x.key !== l.key))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>4. Productos que llevó</CardTitle>
                <CardDescription>
                  Del catálogo de Productos — se suman al subtotal y se descuenta stock
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      addProduct(e.target.value)
                      e.target.value = ''
                    }}
                    className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">— Agregar producto —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.stock_quantity <= 0}>
                        {p.name} · ${p.price != null ? p.price.toFixed(2) : '—'}
                        {p.stock_quantity <= 0 ? ' (agotado)' : ` (${p.stock_quantity})`}
                      </option>
                    ))}
                  </select>
                </div>
                {productLines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin productos seleccionados.</p>
                ) : (
                  productLines.map((l) => (
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
                          setProductLines((list) =>
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
                        onClick={() =>
                          setProductLines((list) => list.filter((x) => x.key !== l.key))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-info/40 shadow-card">
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                <div className="flex items-center gap-2">
                  <Syringe className="size-4 text-info" aria-hidden="true" />
                  <div>
                    <CardTitle>Próxima vacunación</CardTitle>
                    <CardDescription>Según el esquema de la mascota</CardDescription>
                  </div>
                </div>
                {pet && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setVaccOpen((o) => !o)
                      setVaccMsg(null)
                      setVaccName(nextDose?.plan ?? '')
                      setVaccDate(new Date().toISOString().slice(0, 10))
                    }}
                  >
                    <Plus /> Registrar vacunación
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {nextDose ? (
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className="font-medium">{nextDose.label}</span>
                      {nextDose.plan ? ` · ${nextDose.plan}` : ''}
                      {nextDose.compound ? ` (${nextDose.compound})` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Programada para el {fmtDate(nextDose.due_date)}
                      {nextDose.appointment_start
                        ? ` · ${new Date(nextDose.appointment_start).toLocaleTimeString('es-MX', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`
                        : ''}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sin dosis de vacunación programadas.
                  </p>
                )}

                {lastVacc && (
                  <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-success">
                        Vacunación registrada en el carnet
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lastVacc.vaccine}
                        {lastVacc.brand ? ` · ${lastVacc.brand}` : ''} · {fmtDate(lastVacc.date)}
                        {lastVacc.lot ? ` · Lote ${lastVacc.lot}` : ''} · {lastVacc.source}
                      </p>
                    </div>
                  </div>
                )}

                {vaccOpen && (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="space-y-1.5">
                      <Label>Vacuna *</Label>
                      <select
                        value={vaccName}
                        onChange={(e) => setVaccName(e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">Selecciona…</option>
                        {[
                          ...new Set([
                            ...(nextDose?.plan ? [nextDose.plan] : []),
                            ...carnetVaccines,
                          ]),
                        ].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Fecha *</Label>
                        <Input
                          type="date"
                          value={vaccDate}
                          onChange={(e) => setVaccDate(e.target.value)}
                          className="w-full"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Lote</Label>
                        <Input
                          value={vaccLot}
                          onChange={(e) => setVaccLot(e.target.value)}
                          placeholder="Ej. L-2026"
                        />
                      </div>
                    </div>
                    <BrandCombobox
                      value={vaccBrand}
                      onChange={setVaccBrand}
                      brands={carnetBrands}
                    />
                    <div className="space-y-1.5">
                      <Label>Veterinario</Label>
                      <select
                        value={vaccVet}
                        onChange={(e) => setVaccVet(e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">—</option>
                        {vets.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {vaccMsg && <p className="text-sm text-muted-foreground">{vaccMsg}</p>}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setVaccOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button type="button" size="sm" onClick={registerVacc} disabled={vaccBusy}>
                        {vaccBusy ? <Loader2 className="animate-spin" /> : <Syringe />} Registrar
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>5. Resumen y cobro</CardTitle>
                <CardDescription>Subtotal de servicios y productos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {serviceLines.length === 0 && productLines.length === 0 ? (
                  <EmptyState
                    title="Sin conceptos"
                    description="Agrega servicios o productos para cobrar."
                    icon={Package}
                  />
                ) : (
                  <div className="space-y-1.5">
                    {serviceLines.map((l) => (
                      <div key={l.key} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {l.name} ×{l.quantity}
                          {l.discount > 0 ? ` (dto ${l.discount}%)` : ''}
                        </span>
                        <span>${(l.price * l.quantity * (1 - l.discount / 100)).toFixed(2)}</span>
                      </div>
                    ))}
                    {productLines.map((l) => (
                      <div key={l.key} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {l.name} ×{l.quantity}
                        </span>
                        <span>${(l.price * l.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                      <span>Total</span>
                      <span>${subtotal.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div className="mt-3 space-y-2">
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
                      disabled={!owner?.email}
                      onChange={(e) => setSendEmail(e.target.checked)}
                      className="size-4 rounded border-border"
                    />
                    Enviar recibo por correo
                    {owner?.email ? (
                      <span className="text-xs text-muted-foreground">(a {owner.email})</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">(sin correo del dueño)</span>
                    )}
                  </label>
                </div>
              </CardContent>
            </Card>

            {error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <Button asChild variant="outline">
                <Link to={pet ? `/pets/${pet.id}` : '/'}>Cancelar</Link>
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    Guardando…
                  </>
                ) : (
                  <>
                    <ShieldCheck /> Guardar y generar recibo
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </form>
    </AppLayout>
  )
}
