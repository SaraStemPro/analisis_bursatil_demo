import type {
  ISeriesPrimitive, SeriesAttachedParameter, IPrimitivePaneView,
  IPrimitivePaneRenderer, PrimitiveHoveredItem, SeriesType, Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { ElliottWaveDrawing } from '../../../types/drawings'
import { drawLine, drawCircle, pointToSegmentDist } from './renderers'

interface PixelPoint { x: number; y: number }

class ElliottRenderer implements IPrimitivePaneRenderer {
  pixels: PixelPoint[]; labels: string[]; color: string
  constructor(pixels: PixelPoint[], labels: string[], color: string) {
    this.pixels = pixels; this.labels = labels; this.color = color
  }
  draw(target: CanvasRenderingTarget2D): void {
    const { pixels: pts, labels, color } = this

    for (let i = 0; i < pts.length - 1; i++) {
      drawLine(target, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, color, 2)
    }

    for (let i = 0; i < pts.length; i++) {
      const label = labels[i] ?? `${i + 1}`
      drawCircle(target, pts[i].x, pts[i].y, 12, color, '#0f172a')

      target.useMediaCoordinateSpace(({ context: ctx }) => {
        ctx.font = 'bold 11px sans-serif'
        ctx.fillStyle = color
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, pts[i].x, pts[i].y)
      })
    }
  }
}

class ElliottPaneView implements IPrimitivePaneView {
  _renderer: ElliottRenderer | null = null
  zOrder(): 'top' { return 'top' }
  renderer(): IPrimitivePaneRenderer | null { return this._renderer }
}

export class ElliottWavePrimitive implements ISeriesPrimitive<Time> {
  drawing: ElliottWaveDrawing
  isSelected = false
  _chart: SeriesAttachedParameter<Time, SeriesType>['chart'] | null = null
  _series: SeriesAttachedParameter<Time, SeriesType>['series'] | null = null
  _paneView = new ElliottPaneView()
  _paneViews: readonly IPrimitivePaneView[] = [this._paneView]
  _pixelCache: PixelPoint[] = []

  constructor(drawing: ElliottWaveDrawing) { this.drawing = drawing }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart; this._series = param.series; this._updateView()
  }
  detached(): void { this._chart = null; this._series = null }
  updateAllViews(): void { this._updateView() }
  paneViews(): readonly IPrimitivePaneView[] { return this._paneViews }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    for (const p of this._pixelCache) {
      if (Math.hypot(x - p.x, y - p.y) < 14) {
        return { cursorStyle: 'pointer', externalId: this.drawing.id, zOrder: 'top' }
      }
    }
    for (let i = 0; i < this._pixelCache.length - 1; i++) {
      const a = this._pixelCache[i]
      const b = this._pixelCache[i + 1]
      if (pointToSegmentDist(x, y, a.x, a.y, b.x, b.y) < 8) {
        return { cursorStyle: 'pointer', externalId: this.drawing.id, zOrder: 'top' }
      }
    }
    return null
  }

  _updateView(): void {
    if (!this._chart || !this._series || this.drawing.points.length < 2) {
      this._paneView._renderer = null; this._pixelCache = []; return
    }

    const pixels: PixelPoint[] = []
    for (const point of this.drawing.points) {
      const px = this._toPixel(point)
      if (px) pixels.push(px)
    }

    if (pixels.length < 2) {
      this._paneView._renderer = null; this._pixelCache = []; return
    }

    this._pixelCache = pixels
    this._paneView._renderer = new ElliottRenderer(pixels, this.drawing.labels, this.drawing.color)
  }

  _toPixel(point: { time: string; price: number }) {
    if (!this._chart || !this._series) return null
    const x = this._chart.timeScale().timeToCoordinate(point.time as unknown as Time)
    const y = this._series.priceToCoordinate(point.price)
    if (x === null || y === null) return null
    return { x, y }
  }
}
