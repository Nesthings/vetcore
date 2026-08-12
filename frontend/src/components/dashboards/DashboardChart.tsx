import { memo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { CHART_COLORS } from '@/lib/dashboards'
import { cn } from '@/lib/utils'
import { SmartAlertsList } from '@/components/dashboards/SmartAlertsList'
import type { SmartAlertsData } from '@/lib/smart-alerts'

const AXIS_TICK = { fontSize: 11, fill: 'var(--muted-foreground)' }

interface NameValue {
  name: string
  value: number
}

function Donut({ data }: { data: NameValue[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={100}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
          strokeWidth={0}
          isAnimationActive={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function PieChartCard({ data }: { data: NameValue[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={100}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          outerRadius={85}
          strokeWidth={0}
          isAnimationActive={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function BarsH({ data }: { data: NameValue[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={100}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={90}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip />
        <Bar
          dataKey="value"
          fill="var(--chart-1)"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

function AreaChartCard({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={100}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="dashArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#dashArea)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function Heatmap({
  data,
}: {
  data: { days: string[]; hours: number[]; data: { day: number; hour: number; value: number }[] }
}) {
  const max = Math.max(1, ...data.data.map((c) => c.value))
  const map = new Map(data.data.map((c) => [`${c.day}-${c.hour}`, c.value]))
  return (
    <div className="flex h-full flex-col gap-1 overflow-auto text-xs">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `3rem repeat(${data.days.length}, 1fr)` }}
      >
        <span />
        {data.days.map((d) => (
          <span key={d} className="text-center font-medium text-muted-foreground">
            {d}
          </span>
        ))}
      </div>
      {data.hours.map((h) => (
        <div
          key={h}
          className="grid gap-1"
          style={{ gridTemplateColumns: `3rem repeat(${data.days.length}, 1fr)` }}
        >
          <span className="pr-1 text-right text-muted-foreground">{h}:00</span>
          {data.days.map((_, di) => {
            const v = map.get(`${di}-${h}`) ?? 0
            const intensity = v === 0 ? 0 : 0.25 + 0.75 * (v / max)
            return (
              <span
                key={`${di}-${h}`}
                title={v > 0 ? `${data.days[di]} ${h}:00 — ${v} citas` : undefined}
                className="h-5 rounded"
                style={{
                  backgroundColor:
                    v === 0
                      ? 'var(--muted)'
                      : `color-mix(in srgb, var(--primary) ${Math.round(intensity * 100)}%, transparent)`,
                }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

function RadarCard({
  data,
}: {
  data: { vets: string[]; data: Record<string, number | string>[] }
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={100}>
      <RadarChart data={data.data}>
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="metric" tick={AXIS_TICK} />
        <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} />
        {data.vets.map((vet, i) => (
          <Radar
            key={vet}
            name={vet}
            dataKey={vet}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            fillOpacity={0.12}
          />
        ))}
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Tooltip />
      </RadarChart>
    </ResponsiveContainer>
  )
}

function StackedBars({ data }: { data: { label: string; in: number; out: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={100}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="in"
          name="Entradas"
          stackId="a"
          fill="var(--success)"
          radius={[0, 0, 0, 0]}
          isAnimationActive={false}
        />
        <Bar
          dataKey="out"
          name="Salidas"
          stackId="a"
          fill="var(--destructive)"
          radius={[0, 0, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export const DashboardChart = memo(function DashboardChart({
  slug,
  data,
}: {
  slug: string
  data: unknown
}) {
  switch (slug) {
    case 'species':
    case 'vaccination':
      return <Donut data={data as NameValue[]} />
    case 'procedures':
      return <PieChartCard data={data as NameValue[]} />
    case 'breeds':
    case 'reasons':
      return <BarsH data={data as NameValue[]} />
    case 'new_pets':
      return <AreaChartCard data={data as { label: string; value: number }[]} />
    case 'appt_heatmap':
      return <Heatmap data={data as never} />
    case 'vet_load':
      return <RadarCard data={data as never} />
    case 'stock_alerts':
      return (
        <StockAlertsList
          data={data as { product_id: string; name: string; stock: number; threshold: number }[]}
        />
      )
    case 'inv_movements':
      return <StackedBars data={data as never} />
    case 'smart_alerts':
      return <SmartAlertsList data={data as SmartAlertsData} />
    default:
      return <p className={cn('text-sm text-muted-foreground')}>Sin datos.</p>
  }
})

function StockAlertsList({
  data,
}: {
  data: { product_id: string; name: string; stock: number; threshold: number }[]
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
        Sin alertas de stock
      </div>
    )
  }
  return (
    <div className="h-full space-y-1.5 overflow-y-auto pr-1">
      {data.map((p) => (
        <div
          key={p.product_id}
          className="flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-2.5 py-1.5 text-sm"
        >
          <span className="min-w-0 truncate font-medium">{p.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{p.stock} en stock</span>
        </div>
      ))}
    </div>
  )
}
