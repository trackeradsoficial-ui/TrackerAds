'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface DataPoint {
  date: string
  conversoes: number
}

interface ConversionsChartProps {
  data: DataPoint[]
}

export default function ConversionsChart({ data }: ConversionsChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorConversoes" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#25D366" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#25D366" stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.07} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'var(--text-primary)',
          }}
          labelStyle={{ fontWeight: 600 }}
          formatter={(value) => [Number(value), 'Conversões']}
        />
        <Area
          type="monotone"
          dataKey="conversoes"
          stroke="#25D366"
          strokeWidth={2}
          fill="url(#colorConversoes)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
