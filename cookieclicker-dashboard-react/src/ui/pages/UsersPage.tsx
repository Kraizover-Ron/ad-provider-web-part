import { useEffect, useMemo, useState, Fragment } from 'react'
import { apiGet } from '../../api/client'
import type { UserRow, ClickPoint, AdPoint, UserMetrics } from '../../api/types'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

function msToHuman(ms: number) {
  if (!ms || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [range, setRange] = useState<'hour' | 'day' | 'week'>('hour')
  const [metrics, setMetrics] = useState<UserMetrics | null>(null)
  const [clicks, setClicks] = useState<ClickPoint[]>([])
  const [ads, setAds] = useState<AdPoint[]>([])
  const [detailsError, setDetailsError] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const data = await apiGet<UserRow[]>('/admin/users')
      setRows(data)
    } catch (e: any) {
      setError(e?.message || 'Failed to load users')
    }
  }

  useEffect(() => { load() }, [])

  async function loadUserDetails(userId: string, nextRange = range) {
    setDetailsError(null)
    try {
      const m = await apiGet<UserMetrics>(`/admin/users/${encodeURIComponent(userId)}/metrics?range=${nextRange}`)
      const c = await apiGet<ClickPoint[]>(`/admin/users/${encodeURIComponent(userId)}/charts/clicks?range=${nextRange}`)
      const a = await apiGet<AdPoint[]>(`/admin/users/${encodeURIComponent(userId)}/charts/ads?range=${nextRange}`)
      setMetrics(m)
      setClicks(c)
      setAds(a)
    } catch (e: any) {
      setDetailsError(e?.message || 'Failed to load user details')
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(r =>
      r.userId.toLowerCase().includes(s) ||
      (r.displayName || '').toLowerCase().includes(s) ||
      (r.device || '').toLowerCase().includes(s)
    )
  }, [rows, q])

  const clicksData = useMemo(() => clicks.map(p => ({
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
            onClick={() => {
              setRange(it.key)
              if (expandedUserId) loadUserDetails(expandedUserId, it.key)
            }}
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

  function toggleUser(userId: string) {
    if (expandedUserId === userId) {
      setExpandedUserId(null)
      setMetrics(null)
      setClicks([])
      setAds([])
      setDetailsError(null)
      return
    }
    setExpandedUserId(userId)
    setRange('hour')
    loadUserDetails(userId, 'hour')
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
      {error ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
          <button className="ml-3 underline" onClick={load}>Retry</button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-zinc-300">Users</div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by userId / name / device"
          className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-zinc-700"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-zinc-950/50 text-zinc-400">
              <tr>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Device</th>
                <th className="text-right px-4 py-3">Sessions</th>
                <th className="text-right px-4 py-3">Clicks</th>
                <th className="text-right px-4 py-3">Avg session</th>
                <th className="text-left px-4 py-3">Eligible</th>
                <th className="text-left px-4 py-3">Cooldown</th>
                <th className="text-right px-4 py-3">Ads served</th>
                <th className="text-left px-4 py-3">Last ad</th>
                <th className="text-left px-4 py-3">Last seen</th>
              </tr>
            </thead>
            <tbody className="text-zinc-200">
              {filtered.map((r) => (
                <Fragment key={r.userId}>
                <tr className="border-t border-zinc-800/60 hover:bg-zinc-950/30 cursor-pointer" onClick={() => toggleUser(r.userId)}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.displayName || '—'}</div>
                    <div className="text-xs text-zinc-500">{r.userId}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{r.device || '—'}</td>
                  <td className="px-4 py-3 text-right">{r.totalSessions}</td>
                  <td className="px-4 py-3 text-right">{r.totalClicks}</td>
                  <td className="px-4 py-3 text-right">{msToHuman(r.avgSessionDurationMs)}</td>
                  <td className="px-4 py-3">
                    {r.eligible ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-950/60 border border-emerald-900 px-2 py-1 text-xs text-emerald-200">
                        Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-zinc-950/60 border border-zinc-800 px-2 py-1 text-xs text-zinc-300">
                        No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.cooldownUntil && Date.now() < r.cooldownUntil ? (
                      <span className="inline-flex items-center rounded-full bg-amber-950/50 border border-amber-900 px-2 py-1 text-xs text-amber-200">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-zinc-950/60 border border-zinc-800 px-2 py-1 text-xs text-zinc-300">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{r.adServedCount}</td>
                  <td className="px-4 py-3 text-zinc-300">
                    {r.lastAdServedAt ? new Date(r.lastAdServedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString() : '—'}
                  </td>
                </tr>
                {expandedUserId === r.userId ? (
                  <tr className="border-t border-zinc-800/60 bg-black/20">
                    <td colSpan={10} className="px-4 py-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm text-zinc-200 font-medium">User analytics</div>
                            <div className="text-xs text-zinc-500">{r.userId}</div>
                          </div>
                          <RangeTabs />
                        </div>

                        {detailsError ? (
                          <div className="rounded-xl border border-red-900 bg-red-950/40 p-3 text-xs text-red-200">
                            {detailsError}
                            <button className="ml-3 underline" onClick={(e) => { e.stopPropagation(); loadUserDetails(r.userId) }}>Retry</button>
                          </div>
                        ) : null}

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
                            <div className="text-xs text-zinc-400">Ads served ({rangeLabel})</div>
                            <div className="mt-2 text-2xl font-semibold text-zinc-100">{metrics ? metrics.adsServed : '—'}</div>
                          </div>
                          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
                            <div className="text-xs text-zinc-400">Sessions ({rangeLabel})</div>
                            <div className="mt-2 text-2xl font-semibold text-zinc-100">{metrics ? metrics.sessions : '—'}</div>
                          </div>
                          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
                            <div className="text-xs text-zinc-400">Clicks ({rangeLabel})</div>
                            <div className="mt-2 text-2xl font-semibold text-zinc-100">{metrics ? metrics.clicks : '—'}</div>
                          </div>
                          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
                            <div className="text-xs text-zinc-400">Avg clicks / session</div>
                            <div className="mt-2 text-2xl font-semibold text-zinc-100">{metrics ? metrics.avgClicksPerSession.toFixed(1) : '—'}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
                            <div className="text-sm text-zinc-300">Clicks per minute ({rangeLabel})</div>
                            <div className="mt-4 h-[260px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={clicksData}>
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
                            <div className="text-sm text-zinc-300">Ads served per minute ({rangeLabel})</div>
                            <div className="mt-4 h-[260px]">
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
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-zinc-500">No users</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
