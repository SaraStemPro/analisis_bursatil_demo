import { ColorType } from 'lightweight-charts'
import type { Time } from 'lightweight-charts'

export const INTRADAY_INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h'])

export const CHART_THEME = {
  layout: { background: { type: ColorType.Solid as const, color: '#0f172a' }, textColor: '#94a3b8' },
  grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
  timeScale: { borderColor: '#334155' },
  rightPriceScale: { borderColor: '#334155' },
} as const

/** Convert ISO date string to lightweight-charts Time value.
 *  For intraday intervals: Unix timestamp (seconds).
 *  For daily+: 'YYYY-MM-DD' string. */
export function toChartTime(dateStr: string, currentInterval: string): Time {
  if (INTRADAY_INTERVALS.has(currentInterval)) {
    return Math.floor(new Date(dateStr).getTime() / 1000) as unknown as Time
  }
  return dateStr.split('T')[0] as unknown as Time
}

export const INDICATOR_COLORS = [
  '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#a78bfa', '#fb7185', '#22d3ee', '#a3e635',
]
