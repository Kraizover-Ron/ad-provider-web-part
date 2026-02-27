import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../api/client'
import type { ClickPoint, AdPoint } from '../../api/types'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

type RangeKey = '60m' | '1d' | '7d' | '30d'

const RANGES: Array<{ key: RangeKey; label: string; minutes: number }> = [
  { key: '60m', label: '60m', minutes: 60 },
  { key: '1d', label: 'Day', minutes: 1440 },
  { key: '7d', label: 'Week', minutes: 10080 },
  { key: '30d', label: 'Month', minutes: 43200 }
]

function formatLabel(ts: number, range: RangeKey) {
  const d = new Date(ts)
  if (range === '60m') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (range === '1d') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: '2-digit', day: '2-digit' })
}

export default function ChartsPage() {
  const [range, setRange] = useState<RangeKey>('60m')
  const [mode, setMode] = useState<'clicks' | 'ads'>('clicks')
  const [data, setData] = useState<Array<ClickPoint | AdPoint>>([])
  const [error, setError] = useState<string | null>(null)

  const minutes = useMemo(() => RANGES.find(r => r.key === range)!.minutes, [range])

  async function load(m: number, md: 'clicks' | 'ads') {
    setError(null)
    try {
      if (md === 'clicks') {
        const c = await apiGet<ClickPoint[]>(`/admin/charts/clicks?minutes=${m}`)
        setData(c)
      } else {
        const a = await apiGet<AdPoint[]>(`/admin/charts/ads?minutes=${m}`)
        setData(a)
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    }
  }

  useEffect(() => { load(minutes, mode) }, [minutes, mode])

  const chartData = useMemo(() => data.map((p: any) => ({
    t: p.t,
    label: formatLabel(p.t, range),
    value: mode === 'clicks' ? p.clicks : p.ads
  })), [data, mode, range])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-zinc-300">Charts</div>
        <div className="flex items-center gap-2">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
          >
            <option value="clicks">Clicks</option>
            <option value="ads">Ads served</option>
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
          <button className="ml-3 underline" onClick={() => load(minutes, mode)}>Retry</button>
        </div>
      ) : null}

      <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-300">{mode === 'clicks' ? 'Clicks' : 'Ads served'}</div>

          <div className="inline-flex rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
            {RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={
                  'px-3 py-1.5 text-xs font-semibold rounded-xl transition ' +
                  (range === r.key
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-300 hover:bg-zinc-900')
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12 }} stroke="rgba(255,255,255,0.15)" minTickGap={24} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12 }} stroke="rgba(255,255,255,0.15)" allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: 'rgba(9,9,11,0.95)', border: '1px solid rgba(63,63,70,0.6)', borderRadius: 12 }} />
              <Bar dataKey="value" fill={mode === 'clicks' ? '#22c55e' : '#60a5fa'} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
