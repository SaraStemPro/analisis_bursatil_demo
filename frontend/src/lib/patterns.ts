import type { OHLCV } from '../types'

export type PatternType =
  | 'bullish_engulfing' | 'bearish_engulfing'
  | 'bullish_2020' | 'bearish_2020'
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
  { type: 'bullish_2020', label: 'V20A — Vela 20/20 Alcista', description: 'Vela alcista con cuerpo grande (≥ 70% del rango) — incluye marubozu y long line' },
  { type: 'bearish_2020', label: 'V20B — Vela 20/20 Bajista', description: 'Vela bajista con cuerpo grande (≥ 70% del rango) — incluye marubozu y long line' },
  { type: 'bullish_hammer', label: 'MaA — Martillo Alcista', description: 'Cuerpo pequeño arriba, sombra inferior larga (señal de reversión alcista)' },
  { type: 'bearish_hammer', label: 'MaB — Martillo bajista', description: 'Cuerpo pequeño abajo, sombra superior larga (señal de reversión bajista)' },
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
 * Vela 20/20: marubozu (cuerpo >= 95% del rango) OR long line (cuerpo 70-95% y significativo).
 * Unifica ambos patrones bajo un solo nombre.
 */
function detect2020(data: OHLCV[]): PatternMatch[] {
  const results: PatternMatch[] = []
  for (let i = 0; i < data.length; i++) {
    const c = data[i]
    const range = totalRange(c)
    if (range === 0) continue

    const body = bodySize(c)
    const ratio = body / range

    // Marubozu: cuerpo >= 95% del rango
    const isMarubozu = ratio >= 0.95
    // Long line: cuerpo 70-95% del rango y significativamente mayor que la media
    const avg = avgBodySize(data, i, 20)
    const isLongLine = ratio >= 0.70 && ratio < 0.95 && (avg === 0 || body >= avg * 1.5)

    if (!isMarubozu && !isLongLine) continue

    if (isBullish(c)) {
      results.push({
        index: i, date: c.date,
        type: 'bullish_2020', label: 'V20A',
        color: '#10b981', position: 'belowBar',
      })
    } else if (isBearish(c)) {
      results.push({
        index: i, date: c.date,
        type: 'bearish_2020', label: 'V20B',
        color: '#ef4444', position: 'aboveBar',
      })
    }
  }
  return results
}

/**
 * Hammer / Martillo bajista:
 * - Martillo alcista (MaA): cuerpo < 35% del rango, sombra inferior >= 2x cuerpo, sombra superior <= 0.5x cuerpo
 * - Martillo bajista (MaB): cuerpo < 35% del rango, sombra superior >= 2x cuerpo, sombra inferior <= 0.5x cuerpo
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

    // Martillo bajista: sombra superior larga, inferior corta
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
    ...detect2020(data),
    ...detectHammer(data),
  ].sort((a, b) => a.index - b.index)
}
