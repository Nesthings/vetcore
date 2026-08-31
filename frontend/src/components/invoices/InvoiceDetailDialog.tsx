import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Invoice } from '@/pages/Invoices'
import { getToken } from '@/lib/api'

export function InvoiceDetailDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: Invoice
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const downloadReceipt = async () => {
    setError(null)
    setDownloading(true)
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/invoices/${invoice.id}/receipt`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        throw new Error(`Error ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el recibo')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalle de factura</DialogTitle>
          <DialogDescription>
            Folio <span className="font-mono">{invoice.id.slice(0, 8)}</span> ·{' '}
            {invoice.pet_name ?? 'Sin paciente'} · {invoice.branch_name}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">P. unit.</TableHead>
                <TableHead className="text-right">Dto</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{it.description}</TableCell>
                  <TableCell className="text-right">{it.quantity}</TableCell>
                  <TableCell className="text-right">${Number(it.unit_price).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {Number(it.discount_percent) > 0 ? `${it.discount_percent}%` : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    ${Number(it.line_total ?? 0).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="text-right font-medium">
                  Total
                </TableCell>
                <TableCell className="text-right font-semibold">
                  ${Number(invoice.total).toFixed(2)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <Badge
            variant={
              invoice.status === 'paid'
                ? 'success'
                : invoice.status === 'pending'
                  ? 'warning'
                  : 'destructive'
            }
          >
            {invoice.status}
          </Badge>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={downloadReceipt} disabled={downloading}>
            {downloading ? <Loader2 className="animate-spin" /> : <Download />} Recibo (PDF)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
