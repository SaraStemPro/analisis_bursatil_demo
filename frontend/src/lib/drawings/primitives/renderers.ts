import type { CanvasRenderingTarget2D } from 'fancy-canvas'

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
  target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr }) => {
    const bx = x * hpr
    const by = y * vpr
    const headH = size * 0.7 * vpr
    const headW = size * 0.9 * hpr
    const shaftH = size * 1.0 * vpr
    const shaftW = size * 0.25 * hpr

    ctx.fillStyle = color
    ctx.beginPath()
    if (direction === 'up') {
      // Arrow pointing UP: head at top, shaft extends down
      const tipY = by - 2 * vpr
      // Head (triangle)
      ctx.moveTo(bx, tipY)
      ctx.lineTo(bx - headW / 2, tipY + headH)
      ctx.lineTo(bx - shaftW / 2, tipY + headH)
      // Shaft
      ctx.lineTo(bx - shaftW / 2, tipY + headH + shaftH)
      ctx.lineTo(bx + shaftW / 2, tipY + headH + shaftH)
      ctx.lineTo(bx + shaftW / 2, tipY + headH)
      // Head (right side)
      ctx.lineTo(bx + headW / 2, tipY + headH)
    } else {
      // Arrow pointing DOWN: head at bottom, shaft extends up
      const tipY = by + 2 * vpr
      // Head (triangle)
      ctx.moveTo(bx, tipY)
      ctx.lineTo(bx - headW / 2, tipY - headH)
      ctx.lineTo(bx - shaftW / 2, tipY - headH)
      // Shaft
      ctx.lineTo(bx - shaftW / 2, tipY - headH - shaftH)
      ctx.lineTo(bx + shaftW / 2, tipY - headH - shaftH)
      ctx.lineTo(bx + shaftW / 2, tipY - headH)
      // Head (right side)
      ctx.lineTo(bx + headW / 2, tipY - headH)
    }
    ctx.closePath()
    ctx.fill()
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
