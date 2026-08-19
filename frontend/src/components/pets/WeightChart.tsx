import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/** Gráfica de evolución de peso compartida (PetDetail y CartillaShare). */
export function WeightChart({
  data,
  height = '100%',
}: {
  data: { fecha: string; peso: number }[]
  height?: number | `${number}%`
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="fecha"
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={['auto', 'auto']}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip formatter={(v) => [`${v} kg`, 'Peso']} />
        <Line
          type="monotone"
          dataKey="peso"
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          dot={{ r: 4, fill: 'var(--chart-1)' }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
