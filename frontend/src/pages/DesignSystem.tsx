import { Bell, Check, ChevronDown, Info, Inbox, Plus, Search, TriangleAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const palette = [
  { name: 'primary', token: 'bg-primary', hex: '#0f766e' },
  { name: 'primary-hover', token: 'bg-primary-hover', hex: '#0d9488' },
  { name: 'secondary', token: 'bg-secondary', hex: '#e6f5f1' },
  { name: 'muted', token: 'bg-muted', hex: '#eef2f0' },
  { name: 'accent', token: 'bg-accent', hex: '#d9f0ea' },
  { name: 'destructive', token: 'bg-destructive', hex: '#d92d20' },
  { name: 'success', token: 'bg-success', hex: '#21813e' },
  { name: 'warning', token: 'bg-warning', hex: '#b45309' },
  { name: 'info', token: 'bg-info', hex: '#2563eb' },
  { name: 'chart-1', token: 'bg-chart-1', hex: '#0f766e' },
  { name: 'chart-2', token: 'bg-chart-2', hex: '#2dd4bf' },
  { name: 'chart-3', token: 'bg-chart-3', hex: '#eab308' },
  { name: 'chart-4', token: 'bg-chart-4', hex: '#f97316' },
  { name: 'chart-5', token: 'bg-chart-5', hex: '#2563eb' },
]

const typeScale = [
  { label: 'Display / h1', cls: 'text-3xl font-semibold tracking-tight' },
  { label: 'h2', cls: 'text-2xl font-semibold tracking-tight' },
  { label: 'h3', cls: 'text-xl font-semibold' },
  { label: 'h4', cls: 'text-base font-semibold' },
  { label: 'Body', cls: 'text-base' },
  { label: 'Small / caption', cls: 'text-sm text-muted-foreground' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Separator className="flex-1" />
      </div>
      {children}
    </section>
  )
}

export function DesignSystem() {
  return (
    <div className="mx-auto max-w-5xl space-y-14 px-6 py-10">
      <header className="space-y-2">
        <Badge variant="secondary">Subfase 0.4</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Sistema de diseño — VetCore</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Paleta "teal clínico", tipografía Inter, espaciado en múltiplos de 4px y componentes base
          reutilizables. Esta página es transitoria: muestra los componentes que usarán todas las
          pantallas de la Fase 1.
        </p>
      </header>

      <Section title="Paleta">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {palette.map((c) => (
            <div key={c.name} className="space-y-2">
              <div className={`h-16 w-full rounded-lg ${c.token} shadow-card`} />
              <div>
                <p className="text-xs font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.hex}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tipografía (Inter)">
        <div className="space-y-2 rounded-lg border border-border bg-card p-6 shadow-card">
          {typeScale.map((t) => (
            <p key={t.label} className={`${t.cls} py-1`}>
              {t.label} — La salud de tu mascota importa
            </p>
          ))}
        </div>
      </Section>

      <Section title="Botones">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Eliminar</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="xs">XS</Button>
          <Button size="sm">SM</Button>
          <Button size="lg">LG</Button>
          <Button disabled>Deshabilitado</Button>
          <Button>
            <Plus />
            Nuevo
          </Button>
          <Button size="icon" aria-label="Notificaciones">
            <Bell />
          </Button>
        </div>
      </Section>

      <Section title="Inputs y campos">
        <div className="grid max-w-lg gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del paciente</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="name" placeholder="Ej. Firulais" className="pl-9" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sel">Especie</Label>
            <Select>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona una especie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="perro">Perro</SelectItem>
                <SelectItem value="gato">Gato</SelectItem>
                <SelectItem value="ave">Ave</SelectItem>
                <SelectItem value="reptil">Reptil</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section title="Badges de estado">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secundario</Badge>
          <Badge variant="success">Activo</Badge>
          <Badge variant="warning">Pendiente</Badge>
          <Badge variant="destructive">Suspendida</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </Section>

      <Section title="Card">
        <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Citas de hoy</CardTitle>
              <CardDescription>Resumen del día en tu sucursal</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-semibold text-primary">12</p>
              <p className="text-sm text-muted-foreground">
                3 pendientes de confirmar · 2 completadas
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm">
                Ver agenda
              </Button>
            </CardFooter>
          </Card>
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle>Alerta de stock</CardTitle>
              <CardDescription>Productos por agotarse</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-warning" />
              <p className="text-sm text-muted-foreground">Vacuna parvovirus: quedan 3</p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Tabla">
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Especie</TableHead>
                <TableHead>Próxima cita</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { name: 'Firulais', sp: 'Perro', cita: 'Hoy 10:00', st: 'confirmada' },
                { name: 'Michi', sp: 'Gato', cita: 'Hoy 12:30', st: 'pendiente' },
                { name: 'Rex', sp: 'Perro', cita: 'Mañana 09:00', st: 'completada' },
              ].map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.sp}</TableCell>
                  <TableCell>{row.cita}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.st === 'confirmada'
                          ? 'success'
                          : row.st === 'pendiente'
                            ? 'warning'
                            : 'info'
                      }
                    >
                      {row.st}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={`Editar ${row.name}`}>
                      <Search />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Estados diseñados">
        <div className="grid gap-4 lg:grid-cols-3">
          <EmptyState
            title="Sin citas agendadas"
            description="Crea tu primera cita para este día desde la agenda."
            icon={Inbox}
            action={<Button size="sm">Agendar cita</Button>}
          />
          <LoadingState label="Cargando agenda…" />
          <ErrorState description="No pudimos cargar la agenda de hoy." onRetry={() => undefined} />
        </div>
      </Section>

      <Section title="Skeleton (carga esqueleto)">
        <div className="flex max-w-lg items-center gap-4 rounded-lg border border-border bg-card p-6 shadow-card">
          <Skeleton className="size-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </Section>

      <Section title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              Abrir dialog
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar acción</DialogTitle>
              <DialogDescription>
                Esta acción registra el evento en la bitácora de la clínica.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-start gap-3 rounded-md bg-secondary p-4 text-sm text-secondary-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              <p>Los cambios se guardan de inmediato y no se pueden deshacer.</p>
            </div>
            <DialogFooter>
              <Button variant="outline">Cancelar</Button>
              <Button>
                <Check />
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <footer className="flex items-center gap-2 border-t border-border pt-6 text-sm text-muted-foreground">
        <ChevronDown className="size-4" />
        Componentes y tokens listos para la Fase 1.
      </footer>
    </div>
  )
}
