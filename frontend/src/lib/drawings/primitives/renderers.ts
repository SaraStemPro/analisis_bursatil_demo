import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'

// --- Shared chart data for right-margin extrapolation ---
// Updated by Charts.tsx when chart is created; read by all primitives.
export const chartMeta = {
  dataLength: 0,        // total number of bars
  barIntervalSec: 86400, // seconds between bars (86400 = 1 day)
  lastChartTime: 0,     // the Time value of the last bar (unix sec for intraday, 0 for daily)
  isIntraday: false,     // true for 1m, 5m, 15m, 1h
}

/**
 * Convert a drawing point to pixel coordinates.
 * Handles future dates (right margin) by extrapolating via logical index.
 * `point.time` is a YYYY-MM-DD string for daily, or a unix-seconds string for intraday.
 */
export function pointToPixel(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
  point: { time: string; price: number },
): { x: number; y: number } | null {
  const y = series.priceToCoordinate(point.price)
  if (y === null) return null

  const ts = chart.timeScale()
  // For intraday, time is stored as a numeric string (unix seconds)
  const timeValue = chartMeta.isIntraday ? Number(point.time) as unknown as Time : point.time as unknown as Time
  let x = ts.timeToCoordinate(timeValue)
  if (x !== null) return { x, y }

  // Future: compute logical index and convert to coordinate
  if (chartMeta.dataLength > 0 && chartMeta.barIntervalSec > 0) {
    const pointSec = chartMeta.isIntraday
      ? Number(point.time)
      : Math.floor(new Date(point.time).getTime() / 1000)
    const lastSec = chartMeta.isIntraday
      ? chartMeta.lastChartTime
      : Math.floor(new Date(0).getTime() / 1000) // won't be used, daily uses date parse
    // For daily, parse both as dates
    let barsAhead: number
    if (chartMeta.isIntraday) {
      barsAhead = Math.round((pointSec - lastSec) / chartMeta.barIntervalSec)
    } else {
      const pointMs = new Date(point.time).getTime()
      const lastMs = chartMeta.lastChartTime * 1000 // stored as sec for uniformity
      barsAhead = Math.round((pointMs - lastMs) / (chartMeta.barIntervalSec * 1000))
    }
    if (barsAhead > 0) {
      const logicalIdx = chartMeta.dataLength - 1 + barsAhead
      x = ts.logicalToCoordinate(logicalIdx as unknown as import('lightweight-charts').Logical)
      if (x !== null) return { x, y }
    }
  }
  return null
}

// --- Drawing helpers ---

export function drawLine(
  target: CanvasRenderingTarget2D,
  x1: number, y1: number, x2: number, y2: number,
  color: string, lineWidth: number, dashed = false,
): void {
  target.useMediaCoordinateSpace(({ context: ctx }) => {
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    if (dashed) ctx.setLineDash([6, 4])
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    if (dashed) ctx.setLineDash([])
  })
}

export function drawArrow(
  target: CanvasRenderingTarget2D,
  x: number, y: number,
  direction: 'up' | 'down', size: number, color: string,
): void {
  target.useMediaCoordinateSpace(({ context: ctx }) => {
    const fontSize = size * 2
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = color

    if (direction === 'up') {
      ctx.textBaseline = 'top'
      ctx.fillText('▲', x, y + 2)
    } else {
      ctx.textBaseline = 'bottom'
      ctx.fillText('▼', x, y - 2)
    }
  })
}

export function drawText(
  target: CanvasRenderingTarget2D,
  x: number, y: number,
  text: string, fontSize: number, color: string,
  bgColor?: string,
): void {
  target.useMediaCoordinateSpace(({ context: ctx }) => {
    ctx.font = `${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    if (bgColor) {
      const metrics = ctx.measureText(text)
      const pad = 4
      const w = metrics.width + pad * 2
      const h = fontSize + pad * 2
      ctx.fillStyle = bgColor
      ctx.globalAlpha = 0.8
      ctx.fillRect(x - w / 2, y - h, w, h)
      ctx.globalAlpha = 1
    }

    ctx.fillStyle = color
    ctx.fillText(text, x, y - 4)
  })
}

export function drawFilledRect(
  target: CanvasRenderingTarget2D,
  x1: number, y1: number, x2: number, y2: number,
  color: string, alpha: number,
): void {
  target.useMediaCoordinateSpace(({ context: ctx }) => {
    ctx.fillStyle = color
    ctx.globalAlpha = alpha
    ctx.fillRect(
      Math.min(x1, x2), Math.min(y1, y2),
      Math.abs(x2 - x1), Math.abs(y2 - y1),
    )
    ctx.globalAlpha = 1
  })
}

export function drawCircle(
  target: CanvasRenderingTarget2D,
  x: number, y: number,
  radius: number, color: string, fillColor?: string,
): void {
  target.useMediaCoordinateSpace(({ context: ctx }) => {
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    if (fillColor) {
      ctx.fillStyle = fillColor
      ctx.fill()
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()
  })
}

export function pointToSegmentDist(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}
