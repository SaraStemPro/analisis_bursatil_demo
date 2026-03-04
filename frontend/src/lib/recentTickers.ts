const STORAGE_KEY = 'recent-tickers'
const MAX_RECENT = 5

export function getRecentTickers(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function addRecentTicker(ticker: string): string[] {
  const recent = getRecentTickers().filter((t) => t !== ticker)
  const updated = [ticker, ...recent].slice(0, MAX_RECENT)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

export function removeRecentTicker(ticker: string): string[] {
  const updated = getRecentTickers().filter((t) => t !== ticker)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}
