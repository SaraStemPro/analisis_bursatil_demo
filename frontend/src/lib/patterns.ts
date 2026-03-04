import type { OHLCV } from '../types'

export type PatternType =
  | 'bullish_engulfing' | 'bearish_engulfing'
  | 'bullish_marubozu' | 'bearish_marubozu'
  | 'bullish_longline' | 'bearish_longline'
  | 'bullish_hammer' | 'bearish_hammer'

export interface PatternMatch {
  index: number
  date: string
  type: PatternType
  label: string
  color: string
  position: 'aboveBar' | 'belowBar'
}

export interface PatternCatalogEntry {
  type: PatternType
  label: string
  description: string
}

export const PATTERN_CATALOG: PatternCatalogEntry[] = [
  { type: 'bullish_engulfing', label: 'EA — Envolvente Alcista', description: 'La segunda vela alcista envuelve el cuerpo de la primera bajista' },
  { type: 'bearish_engulfing', label: 'EB — Envolvente Bajista', description: 'La segunda vela bajista envuelve el cuerpo de la primera alcista' },
  { type: 'bullish_marubozu', label: 'MA — Marubozu Alcista', description: 'Vela alcista sin mechas (cuerpo ≥ 95% del rango)' },
  { type: 'bearish_marubozu', label: 'MB — Marubozu Bajista', description: 'Vela bajista sin mechas (cuerpo ≥ 95% del rango)' },
  { type: 'bullish_longline', label: 'LLA — Long Line Alcista', description: 'Vela alcista con cuerpo grande (70-95% del rango)' },
  { type: 'bearish_longline', label: 'LLB — Long Line Bajista', description: 'Vela bajista con cuerpo grande (70-95% del rango)' },
  { type: 'bullish_hammer', label: 'MaA — Martillo Alcista', description: 'Cuerpo pequeño arriba, sombra inferior larga (señal de reversión alcista)' },
  { type: 'bearish_hammer', label: 'MaB — Shooting Star', description: 'Cuerpo pequeño abajo, sombra superior larga (señal de reversión bajista)' },
]

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

/**
 * Hammer / Shooting Star:
 * - Martillo alcista (MaA): cuerpo < 35% del rango, sombra inferior >= 2x cuerpo, sombra superior <= 0.5x cuerpo
 * - Shooting star (MaB): cuerpo < 35% del rango, sombra superior >= 2x cuerpo, sombra inferior <= 0.5x cuerpo
 */
function detectHammer(data: OHLCV[]): PatternMatch[] {
  const results: PatternMatch[] = []
  for (let i = 0; i < data.length; i++) {
    const c = data[i]
    const range = totalRange(c)
    if (range === 0) continue

    const body = bodySize(c)
    if (body / range >= 0.35) continue

    const upperBody = Math.max(c.open, c.close)
    const lowerBody = Math.min(c.open, c.close)
    const upperShadow = c.high - upperBody
    const lowerShadow = lowerBody - c.low

    // Martillo alcista: sombra inferior larga, superior corta
    if (lowerShadow >= 2 * body && upperShadow <= 0.5 * body) {
      results.push({
        index: i, date: c.date,
        type: 'bullish_hammer', label: 'MaA',
        color: '#10b981', position: 'belowBar',
      })
    }

    // Shooting star / martillo bajista: sombra superior larga, inferior corta
    if (upperShadow >= 2 * body && lowerShadow <= 0.5 * body) {
      results.push({
        index: i, date: c.date,
        type: 'bearish_hammer', label: 'MaB',
        color: '#ef4444', position: 'aboveBar',
      })
    }
  }
  return results
}

export function detectPatterns(data: OHLCV[]): PatternMatch[] {
  if (data.length < 2) return []
  return [
    ...detectEngulfing(data),
    ...detectMarubozu(data),
    ...detectLongLine(data),
    ...detectHammer(data),
  ].sort((a, b) => a.index - b.index)
}
