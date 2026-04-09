import type {
  ISeriesPrimitive, SeriesAttachedParameter, IPrimitivePaneView,
  IPrimitivePaneRenderer, PrimitiveHoveredItem, SeriesType, Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { CircleDrawing } from '../../../types/drawings'
import { pointToPixel } from './renderers'

class CircleRenderer implements IPrimitivePaneRenderer {
  cx: number; cy: number; rx: number; ry: number; color: string
  constructor(cx: number, cy: number, rx: number, ry: number, color: string) {
    this.cx = cx; this.cy = cy; this.rx = rx; this.ry = ry; this.color = color
  }
  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.beginPath()
      ctx.ellipse(this.cx, this.cy, this.rx, this.ry, 0, 0, Math.PI * 2)
      ctx.fillStyle = this.color
      ctx.globalAlpha = 0.15
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = this.color
      ctx.lineWidth = 2
      ctx.stroke()
    })
  }
}

class CirclePaneView implements IPrimitivePaneView {
  _renderer: CircleRenderer | null = null
  zOrder(): 'normal' { return 'normal' }
  renderer(): IPrimitivePaneRenderer | null { return this._renderer }
}

export class CirclePrimitive implements ISeriesPrimitive<Time> {
  drawing: CircleDrawing
  isSelected = false
  _chart: SeriesAttachedParameter<Time, SeriesType>['chart'] | null = null
  _series: SeriesAttachedParameter<Time, SeriesType>['series'] | null = null
  _paneView = new CirclePaneView()
  _paneViews: readonly IPrimitivePaneView[] = [this._paneView]

  constructor(drawing: CircleDrawing) { this.drawing = drawing }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart; this._series = param.series; this._updateView()
  }
  detached(): void { this._chart = null; this._series = null }
  updateAllViews(): void { this._updateView() }
  paneViews(): readonly IPrimitivePaneView[] { return this._paneViews }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    if (!this._chart || !this._series || this.drawing.points.length < 2) return null
    const p1 = this._toPixel(this.drawing.points[0])
    const p2 = this._toPixel(this.drawing.points[1])
    if (!p1 || !p2) return null
    const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2
    const rx = Math.abs(p2.x - p1.x) / 2, ry = Math.abs(p2.y - p1.y) / 2
    if (rx === 0 || ry === 0) return null
    const norm = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
    if (norm >= 0.7 && norm <= 1.3) return { cursorStyle: 'pointer', externalId: this.drawing.id, zOrder: 'normal' }
    return null
  }

  _updateView(): void {
    if (!this._chart || !this._series || this.drawing.points.length < 2) {
      this._paneView._renderer = null; return
    }
    const p1 = this._toPixel(this.drawing.points[0])
    const p2 = this._toPixel(this.drawing.points[1])
    if (!p1 || !p2) { this._paneView._renderer = null; return }
    const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2
    const rx = Math.abs(p2.x - p1.x) / 2, ry = Math.abs(p2.y - p1.y) / 2
    this._paneView._renderer = new CircleRenderer(cx, cy, Math.max(rx, 1), Math.max(ry, 1), this.drawing.color)
  }

  _toPixel(point: { time: string; price: number }) {
    if (!this._chart || !this._series) return null
    return pointToPixel(this._chart, this._series, point)
  }
}
