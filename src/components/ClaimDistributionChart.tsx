import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import type { BreedPercentileData } from '../lib/calculator';

interface Props {
  percentileData: BreedPercentileData;
  breed: string;
  userAnnualSpend: number;
}

const USD = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

export default function ClaimDistributionChart({ percentileData, breed, userAnnualSpend }: Props) {
  const { n, mean, median, p25, p50, p75, p90, p95, limitedData, bucket } = percentileData;

  const points = [
    { label: 'p25', value: p25 ?? 0, pctile: '25th' },
    { label: 'p50', value: p50 ?? median, pctile: '50th' },
    { label: 'p75', value: p75 ?? mean, pctile: '75th' },
    { label: 'p90', value: p90 ?? mean * 1.5, pctile: '90th' },
    { label: 'p95', value: p95 ?? mean * 2, pctile: '95th' },
  ].filter((p) => p.value !== undefined);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
        Claim Distribution — {breed}, age {bucket}
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        {limitedData
          ? `Limited data (n=${n} pets at this age range) — use as rough reference only`
          : `Based on ${n.toLocaleString()} ${breed}s in our dataset`}
        {' · '}Amber line = your reported annual spend
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={points} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="pctile" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={48} />
          <Tooltip formatter={(val: number) => [USD(val), 'Annual claims at percentile']} />
          <ReferenceLine
            y={userAnnualSpend}
            stroke="#D4943A"
            strokeWidth={2}
            strokeDasharray="4 4"
            label={{ value: 'Your spend', position: 'insideTopRight', fontSize: 11, fill: '#D4943A' }}
          />
          <Bar dataKey="value" name="Annual claims" radius={[4, 4, 0, 0]}>
            {points.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.value <= userAnnualSpend ? '#1B6B6D' : '#CBD5E1'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
