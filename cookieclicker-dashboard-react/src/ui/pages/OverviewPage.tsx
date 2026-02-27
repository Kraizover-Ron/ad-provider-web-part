import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../api/client'
import type { Overview, ClickPoint, AdPoint } from '../../api/types'
import { Card } from '../components/Card'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

function msToHuman(ms: number) {
  if (!ms || ms < 0) return '0s'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export default function OverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [clicks, setClicks] = useState<ClickPoint[]>([])
  const [ads, setAds] = useState<AdPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<'hour' | 'day' | 'week'>('hour')

  async function load() {
    setError(null)
    try {
      const o = await apiGet<Overview>('/admin/overview')
      const c = await apiGet<ClickPoint[]>(`/admin/charts/clicks?range=${range}`)
      const a = await apiGet<AdPoint[]>(`/admin/charts/ads?range=${range}`)
      setOverview(o)
      setClicks(c)
      setAds(a)
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    }
  }

  useEffect(() => { load() }, [range])

  const chartData = useMemo(() => clicks.map(p => ({
    t: p.t,
    clicks: p.clicks
  })), [clicks])

  const adsData = useMemo(() => ads.map(p => ({
    t: p.t,
    ads: p.ads
  })), [ads])

  function formatXAxis(ts: number) {
    const d = new Date(ts)
    if (range === 'week') return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
    if (range === 'day') return d.toLocaleTimeString('en-US', { hour: '2-digit' })
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  function formatTooltip(ts: any) {
    const n = typeof ts === 'number' ? ts : Number(ts)
    const d = new Date(n)
    if (range === 'week') return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' })
    return d.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const rangeLabel = range === 'hour' ? 'last 60 minutes' : range === 'day' ? 'last 24 hours' : 'last 7 days'

  function RangeTabs() {
    const items: Array<{ key: 'hour' | 'day' | 'week'; label: string }> = [
      { key: 'hour', label: 'Hour' },
      { key: 'day', label: 'Day' },
      { key: 'week', label: 'Week' }
    ]
    return (
      <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950/50 p-1">
        {items.map(it => (
          <button
            key={it.key}
            onClick={() => setRange(it.key)}
            className={
              `px-3 py-1.5 text-xs rounded-lg transition ${
                range === it.key ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`
            }
          >
            {it.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      {error ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
          <button className="ml-3 underline" onClick={load}>Retry</button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <Card title="Total users" value={overview?.totalUsers ?? '—'} />
        <Card title="Total sessions" value={overview?.totalSessions ?? '—'} />
        <Card title="Eligible now" value={overview?.eligibleUsersNow ?? '—'} sub="users who can see an ad" />
        <Card title="Cooldown now" value={overview?.cooldownUsersNow ?? '—'} sub="users waiting before next ad" />
        <Card title="Total ads served" value={overview?.totalAdsServed ?? '—'} />
        <Card title="Ads (24h)" value={overview?.adsServedLast24h ?? '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card title="Avg clicks/session" value={overview ? overview.avgClicksPerSession.toFixed(1) : '—'} />
        <Card title="Avg session time" value={overview ? msToHuman(overview.avgSessionDurationMs) : '—'} />
        <Card title="Avg time to serve ad" value={overview ? msToHuman(overview.avgTimeToServeMs) : '—'} sub="from eligibility to serve" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-sm text-zinc-300">Clicks per minute ({rangeLabel})</div>
              <div className="mt-2"><RangeTabs /></div>
            </div>
            <div className="text-xs text-zinc-500">{overview ? new Date(overview.lastUpdatedAt).toLocaleString() : ''}</div>
          </div>

          <div className="mt-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={formatXAxis}
                  tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12 }}
                  stroke="rgba(255,255,255,0.15)"
                  minTickGap={24}
                />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12 }} stroke="rgba(255,255,255,0.15)" allowDecimals={false} />
                <Tooltip labelFormatter={formatTooltip} contentStyle={{ backgroundColor: 'rgba(9,9,11,0.95)', border: '1px solid rgba(63,63,70,0.6)', borderRadius: 12 }} />
                <Line type="monotone" dataKey="clicks" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-sm text-zinc-300">Ads served per minute ({rangeLabel})</div>
              <div className="mt-2"><RangeTabs /></div>
            </div>
            <div className="text-xs text-zinc-500">{overview ? new Date(overview.lastUpdatedAt).toLocaleString() : ''}</div>
          </div>

          <div className="mt-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={adsData}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={formatXAxis}
                  tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12 }}
                  stroke="rgba(255,255,255,0.15)"
                  minTickGap={24}
                />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12 }} stroke="rgba(255,255,255,0.15)" allowDecimals={false} />
                <Tooltip labelFormatter={formatTooltip} contentStyle={{ backgroundColor: 'rgba(9,9,11,0.95)', border: '1px solid rgba(63,63,70,0.6)', borderRadius: 12 }} />
                <Line type="monotone" dataKey="ads" stroke="#60a5fa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
