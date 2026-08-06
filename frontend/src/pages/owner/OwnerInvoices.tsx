import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download, Loader2, Receipt } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { getToken, apiFetch } from '@/lib/api'

interface OwnerInvoice {
  id: string
  pet_name?: string | null
  clinic_name?: string | null
  branch_name?: string | null
  total: string
  status: string
  created_at: string
}

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' }> = {
  paid: { label: 'Pagada', variant: 'success' },
  pending: { label: 'Pendiente', variant: 'warning' },
}

export function OwnerInvoices() {
  const [invoices, setInvoices] = useState<OwnerInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<OwnerInvoice[]>('/owner/invoices')
      setInvoices(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar tus facturas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const downloadReceipt = async (id: string) => {
    setError(null)
    setDownloading(id)
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/owner/invoices/${id}/receipt`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el recibo')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-background/80 px-6 backdrop-blur">
        <Link
          to="/portal"
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Volver a mis mascotas
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Mis facturas</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Recibos de los servicios de tus mascotas
        </p>

        {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
        {loading && <LoadingState label="Cargando facturas…" />}

        {!loading && !error && invoices.length === 0 && (
          <EmptyState
            title="Sin facturas"
            description="Las facturas de tus mascotas aparecerán aquí."
            icon={Receipt}
          />
        )}

        {!loading && !error && invoices.length > 0 && (
          <div className="space-y-3">
            {invoices.map((inv) => {
              const st = STATUS[inv.status] ?? { label: inv.status, variant: 'warning' }
              return (
                <Card key={inv.id} className="shadow-card">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium">
                        {inv.pet_name ?? '—'} · {inv.branch_name ?? inv.clinic_name ?? '—'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(inv.created_at).toLocaleDateString('es-MX', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {' · '}
                        <span className="font-mono">{inv.id.slice(0, 8)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <span className="text-lg font-semibold">${Number(inv.total).toFixed(2)}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={downloading === inv.id}
                        onClick={() => downloadReceipt(inv.id)}
                      >
                        {downloading === inv.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Download />
                        )}
                        Recibo
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
