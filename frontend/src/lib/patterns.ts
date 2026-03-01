import type { OHLCV } from '../types'

export interface PatternMatch {
  index: number
  date: string
  type: 'bullish_engulfing' | 'bearish_engulfing' | 'bullish_marubozu' | 'bearish_marubozu'
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

/**
 * Engulfing: la segunda vela envuelve completamente el cuerpo de la primera.
 * Bullish engulfing: vela 1 bajista, vela 2 alcista y cuerpo 2 envuelve cuerpo 1.
 * Bearish engulfing: vela 1 alcista, vela 2 bajista y cuerpo 2 envuelve cuerpo 1.
 */
function detectEngulfing(data: OHLCV[]): PatternMatch[] {
  const results: PatternMatch[] = []
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1]
    const curr = data[i]

    // Bullish engulfing
    if (
      isBearish(prev) && isBullish(curr) &&
      curr.open <= prev.close && curr.close >= prev.open &&
      bodySize(curr) > bodySize(prev)
    ) {
      results.push({
        index: i,
        date: curr.date,
        type: 'bullish_engulfing',
        label: 'Envolvente alcista',
        color: '#10b981',
        position: 'belowBar',
      })
    }

    // Bearish engulfing
    if (
      isBullish(prev) && isBearish(curr) &&
      curr.open >= prev.close && curr.close <= prev.open &&
      bodySize(curr) > bodySize(prev)
    ) {
      results.push({
        index: i,
        date: curr.date,
        type: 'bearish_engulfing',
        label: 'Envolvente bajista',
        color: '#ef4444',
        position: 'aboveBar',
      })
    }
  }
  return results
}

/**
 * Marubozu / Long Line: vela con cuerpo grande y mechas muy pequeñas.
 * El cuerpo representa al menos el 90% del rango total.
 * Además, el cuerpo debe ser significativo respecto al rango medio de las últimas 20 velas.
 */
function detectMarubozu(data: OHLCV[]): PatternMatch[] {
  const results: PatternMatch[] = []
  const lookback = 20

  for (let i = 0; i < data.length; i++) {
    const c = data[i]
    const range = totalRange(c)
    if (range === 0) continue

    const body = bodySize(c)
    const bodyRatio = body / range

    // Body must be >= 90% of total range
    if (bodyRatio < 0.9) continue

    // Body must be significant (> 1.5x average body of last N candles)
    const start = Math.max(0, i - lookback)
    let avgBody = 0
    let count = 0
    for (let j = start; j < i; j++) {
      avgBody += bodySize(data[j])
      count++
    }
    if (count > 0) {
      avgBody /= count
      if (body < avgBody * 1.5) continue
    }

    if (isBullish(c)) {
      results.push({
        index: i,
        date: c.date,
        type: 'bullish_marubozu',
        label: 'Marubozu alcista',
        color: '#10b981',
        position: 'belowBar',
      })
    } else if (isBearish(c)) {
      results.push({
        index: i,
        date: c.date,
        type: 'bearish_marubozu',
        label: 'Marubozu bajista',
        color: '#ef4444',
        position: 'aboveBar',
      })
    }
  }
  return results
}

export function detectPatterns(data: OHLCV[]): PatternMatch[] {
  if (data.length < 2) return []
  return [...detectEngulfing(data), ...detectMarubozu(data)]
    .sort((a, b) => a.index - b.index)
}
