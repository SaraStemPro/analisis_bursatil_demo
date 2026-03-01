import type { OHLCV } from '../types'

export interface PatternMatch {
  index: number
  date: string
  type: 'bullish_engulfing' | 'bearish_engulfing' | 'bullish_marubozu' | 'bearish_marubozu' | 'bullish_longline' | 'bearish_longline'
  label: string
  color: string
  position: 'aboveBar' | 'belowBar'
}

function bodySize(c: OHLCV): number {
  return Math.abs(c.close - c.open)
}

function totalRange(c: OHLCV): number {
  return c.high - c.low
}

function isBullish(c: OHLCV): boolean {
  return c.close > c.open
}

function isBearish(c: OHLCV): boolean {
  return c.close < c.open
}

function avgBodySize(data: OHLCV[], end: number, lookback: number): number {
  const start = Math.max(0, end - lookback)
  let sum = 0
  let count = 0
  for (let j = start; j < end; j++) {
    sum += bodySize(data[j])
    count++
  }
  return count > 0 ? sum / count : 0
}

/**
 * Engulfing: la segunda vela envuelve completamente el cuerpo de la primera.
 */
function detectEngulfing(data: OHLCV[]): PatternMatch[] {
  const results: PatternMatch[] = []
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1]
    const curr = data[i]

    if (
      isBearish(prev) && isBullish(curr) &&
      curr.open <= prev.close && curr.close >= prev.open &&
      bodySize(curr) > bodySize(prev)
    ) {
      results.push({
        index: i, date: curr.date,
        type: 'bullish_engulfing', label: 'EA',
        color: '#10b981', position: 'belowBar',
      })
    }

    if (
      isBullish(prev) && isBearish(curr) &&
      curr.open >= prev.close && curr.close <= prev.open &&
      bodySize(curr) > bodySize(prev)
    ) {
      results.push({
        index: i, date: curr.date,
        type: 'bearish_engulfing', label: 'EB',
        color: '#ef4444', position: 'aboveBar',
      })
    }
  }
  return results
}

/**
 * Marubozu: vela con cuerpo >= 95% del rango total y cuerpo significativo.
 * Prácticamente sin mechas.
 */
function detectMarubozu(data: OHLCV[]): PatternMatch[] {
  const results: PatternMatch[] = []
  for (let i = 0; i < data.length; i++) {
    const c = data[i]
    const range = totalRange(c)
    if (range === 0) continue

    const body = bodySize(c)
    if (body / range < 0.95) continue

    const avg = avgBodySize(data, i, 20)
    if (avg > 0 && body < avg * 1.5) continue

    if (isBullish(c)) {
      results.push({
        index: i, date: c.date,
        type: 'bullish_marubozu', label: 'MA',
        color: '#10b981', position: 'belowBar',
      })
    } else if (isBearish(c)) {
      results.push({
        index: i, date: c.date,
        type: 'bearish_marubozu', label: 'MB',
        color: '#ef4444', position: 'aboveBar',
      })
    }
  }
  return results
}

/**
 * Long Line: vela con cuerpo grande (>= 70% del rango) y cuerpo significativo,
 * pero con mechas más visibles que el marubozu.
 * Se excluyen las velas que ya son marubozu (>= 95%).
 */
function detectLongLine(data: OHLCV[]): PatternMatch[] {
  const results: PatternMatch[] = []
  for (let i = 0; i < data.length; i++) {
    const c = data[i]
    const range = totalRange(c)
    if (range === 0) continue

    const body = bodySize(c)
    const ratio = body / range

    // Long line: 70%-95% body ratio (above 95% is marubozu)
    if (ratio < 0.70 || ratio >= 0.95) continue

    const avg = avgBodySize(data, i, 20)
    if (avg > 0 && body < avg * 1.5) continue

    if (isBullish(c)) {
      results.push({
        index: i, date: c.date,
        type: 'bullish_longline', label: 'LLA',
        color: '#10b981', position: 'belowBar',
      })
    } else if (isBearish(c)) {
      results.push({
        index: i, date: c.date,
        type: 'bearish_longline', label: 'LLB',
        color: '#ef4444', position: 'aboveBar',
      })
    }
  }
  return results
}

export function detectPatterns(data: OHLCV[]): PatternMatch[] {
  if (data.length < 2) return []
  return [...detectEngulfing(data), ...detectMarubozu(data), ...detectLongLine(data)]
    .sort((a, b) => a.index - b.index)
}
