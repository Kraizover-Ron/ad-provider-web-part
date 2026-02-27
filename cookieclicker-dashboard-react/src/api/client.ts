export type ApiError = { error: string }

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const adminKey = import.meta.env.VITE_ADMIN_KEY || ''

export async function apiGet<T>(path: string): Promise<T> {
  const url = `${baseUrl}${path}`
  const res = await fetch(url, {
    headers: adminKey ? { 'X-ADMIN-KEY': adminKey } : undefined
  })
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const data = (await res.json()) as ApiError
      if (data?.error) msg = data.error
    } catch {}
    throw new Error(msg)
  }
  return (await res.json()) as T
}

export function getBaseUrl() {
  return baseUrl
}
