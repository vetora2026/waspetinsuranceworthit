import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { ChartYearPoint } from '../lib/calculator';

interface Props {
  data: ChartYearPoint[];
  ageNow: number;
}

const USD = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

export default function PremiumVsClaimsChart({ data, ageNow }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
        Annual Premium vs. Median Claims by Age
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Dashed portion shows extrapolated estimates beyond typical lifespan
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="age"
            label={{ value: 'Age (years)', position: 'insideBottom', offset: -2, fontSize: 11 }}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11 }}
            width={48}
          />
          <Tooltip
            formatter={(val: number, name: string) => [USD(val), name]}
            labelFormatter={(l) => `Age ${l}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine x={ageNow} stroke="#D4943A" strokeDasharray="4 4" label={{ value: 'Now', fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="premium"
            name="Est. annual premium"
            stroke="#1B6B6D"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="avgClaims"
            name="Median annual claims"
            stroke="#D4943A"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            strokeDasharray={(d: { isExtrapolated?: boolean }) => (d?.isExtrapolated ? '5 5' : '0')}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
