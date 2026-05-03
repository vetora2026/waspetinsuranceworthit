import type { OutcomeBucket } from '../lib/calculator';

interface Props {
  data: OutcomeBucket[];
  breed: string;
}

export default function OutcomeDistributionChart({ data, breed }: Props) {
  const total = data.reduce((s, d) => s + d.pct, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
        Outcome Distribution — {breed}
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Estimated share of {breed}s in each annual claims bucket
      </p>

      {/* Stacked bar */}
      <div className="flex rounded-lg overflow-hidden h-8 mb-4">
        {data.map((d) => (
          <div
            key={d.label}
            style={{ width: `${(d.pct / total) * 100}%`, backgroundColor: d.color }}
            title={`${d.label}: ${d.pct}%`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-xs text-gray-700">
              <strong>{d.pct}%</strong> {d.label}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Estimates derived from claim frequency patterns in the dataset. Individual results vary widely.
      </p>
    </div>
  );
}
