export type Overview = {
  totalUsers: number
  totalSessions: number
  totalEvents: number
  eligibleUsersNow: number
  cooldownUsersNow: number
  totalAdsServed: number
  adsServedLast24h: number
  avgTimeToServeMs: number
  avgSessionDurationMs: number
  avgClicksPerSession: number
  lastUpdatedAt: number
}

export type ClickPoint = { t: number; clicks: number }

export type AdPoint = { t: number; ads: number }

export type UserRow = {
  userId: string
  displayName?: string | null
  device?: string | null
  appVersion?: string | null
  firstSeenAt?: number | null
  lastSeenAt?: number | null
  totalSessions: number
  totalClicks: number
  avgSessionDurationMs: number
  eligible: boolean
  eligibleUntil?: number | null
  cooldownUntil?: number | null
  lastAdServedAt?: number | null
  adServedCount: number
}

export type UserMetrics = {
  userId: string
  from: number
  to: number
  sessions: number
  clicks: number
  avgClicksPerSession: number
  adsServed: number
}
