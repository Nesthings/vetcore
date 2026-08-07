import { useCallback, useEffect, useState } from 'react'
import { Bell, Play } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiFetch } from '@/lib/api'

interface PendingReminder {
  appointment_id: string
  pet_name?: string | null
  procedure_type: string
  start_time: string
  next_stage: string | null
  consent: boolean
}

const STAGE_LABELS: Record<string, string> = {
  '48h': '48h antes',
  '24h': '24h antes',
  '2h': '2h antes',
}

export function Automation() {
  const [pending, setPending] = useState<PendingReminder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [lastResult, setLastResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<PendingReminder[]>('/automation/reminders/pending')
      setPending(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los recordatorios')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const run = async () => {
    setRunning(true)
    setError(null)
    setLastResult(null)
    try {
      const res = await apiFetch<{ processed: number; skipped_no_consent: number }>(
        '/automation/reminders/run',
        { method: 'POST' },
      )
      setLastResult(
        `${res.processed} recordatorio(s) enviado(s) · ${res.skipped_no_consent} omitido(s) por falta de consentimiento`,
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ejecutar el motor')
    } finally {
      setRunning(false)
    }
  }

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recordatorios</h1>
          <p className="text-sm text-muted-foreground">
            Recordatorios escalonados WhatsApp 48h / 24h / 2h (respeta el opt-in del dueño)
          </p>
        </div>
        <Button size="sm" onClick={run} disabled={running}>
          <Play /> {running ? 'Ejecutando…' : 'Ejecutar recordatorios ahora'}
        </Button>
      </div>

      {lastResult && (
        <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {lastResult}
        </div>
      )}
      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando recordatorios…" />}

      {!loading && !error && pending.length === 0 && (
        <EmptyState
          title="Sin recordatorios pendientes"
          description="No hay citas en las próximas 48 horas o ya se enviaron sus recordatorios."
          icon={Bell}
        />
      )}

      {!loading && !error && pending.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Procedimiento</TableHead>
                <TableHead>Cita</TableHead>
                <TableHead>Consentimiento</TableHead>
                <TableHead>Siguiente etapa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((p) => (
                <TableRow key={p.appointment_id}>
                  <TableCell className="font-medium">{p.pet_name ?? '—'}</TableCell>
                  <TableCell>{p.procedure_type}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(p.start_time).toLocaleString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell>
                    {p.consent ? (
                      <Badge variant="success">Opt-in</Badge>
                    ) : (
                      <Badge variant="secondary">Sin consentimiento</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.next_stage ? (
                      <Badge variant="warning">{STAGE_LABELS[p.next_stage]}</Badge>
                    ) : p.consent ? (
                      <span className="text-muted-foreground">Ninguna por ahora</span>
                    ) : (
                      <span className="text-muted-foreground">No se enviará</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppLayout>
  )
}
