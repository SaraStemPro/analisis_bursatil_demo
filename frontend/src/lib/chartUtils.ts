import { ColorType } from 'lightweight-charts'
import type { Time } from 'lightweight-charts'

export const INTRADAY_INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h'])

export const CHART_THEME = {
  layout: { background: { type: ColorType.Solid as const, color: '#ffffff' }, textColor: '#374151' },
  grid: { vertLines: { color: '#e5e7eb' }, horzLines: { color: '#e5e7eb' } },
  timeScale: { borderColor: '#d1d5db' },
  rightPriceScale: { borderColor: '#d1d5db' },
} as const

/** Get Madrid (Europe/Madrid) UTC offset in seconds for a given date.
 *  Accounts for CET (+1) / CEST (+2) transitions automatically. */
function getMadridOffsetSec(date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const madridStr = date.toLocaleString('en-US', { timeZone: 'Europe/Madrid' })
  return (new Date(madridStr).getTime() - new Date(utcStr).getTime()) / 1000
}

/** Convert ISO date string to lightweight-charts Time value.
 *  For intraday intervals: Unix timestamp adjusted to Madrid timezone.
 *  For daily+: 'YYYY-MM-DD' string. */
export function toChartTime(dateStr: string, currentInterval: string): Time {
  if (INTRADAY_INTERVALS.has(currentInterval)) {
    const date = new Date(dateStr)
    const utcSec = Math.floor(date.getTime() / 1000)
    return (utcSec + getMadridOffsetSec(date)) as unknown as Time
  }
  return dateStr.split('T')[0] as unknown as Time
}

export const INDICATOR_COLORS = [
  '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#a78bfa', '#fb7185', '#22d3ee', '#a3e635',
]
