import type {
  ISeriesPrimitive, SeriesAttachedParameter, IPrimitivePaneView,
  IPrimitivePaneRenderer, PrimitiveHoveredItem, SeriesType, Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { RectDrawing } from '../../../types/drawings'
import { drawFilledRect, drawLine } from './renderers'

class RectRenderer implements IPrimitivePaneRenderer {
  x1: number; y1: number; x2: number; y2: number; color: string
  constructor(x1: number, y1: number, x2: number, y2: number, color: string) {
    this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2; this.color = color
  }
  draw(target: CanvasRenderingTarget2D): void {
    drawFilledRect(target, this.x1, this.y1, this.x2, this.y2, this.color, 0.15)
    drawLine(target, this.x1, this.y1, this.x2, this.y1, this.color, 2)
    drawLine(target, this.x2, this.y1, this.x2, this.y2, this.color, 2)
    drawLine(target, this.x2, this.y2, this.x1, this.y2, this.color, 2)
    drawLine(target, this.x1, this.y2, this.x1, this.y1, this.color, 2)
  }
}

class RectPaneView implements IPrimitivePaneView {
  _renderer: RectRenderer | null = null
  zOrder(): 'normal' { return 'normal' }
  renderer(): IPrimitivePaneRenderer | null { return this._renderer }
}

export class RectPrimitive implements ISeriesPrimitive<Time> {
  drawing: RectDrawing
  isSelected = false
  _chart: SeriesAttachedParameter<Time, SeriesType>['chart'] | null = null
  _series: SeriesAttachedParameter<Time, SeriesType>['series'] | null = null
  _paneView = new RectPaneView()
  _paneViews: readonly IPrimitivePaneView[] = [this._paneView]

  constructor(drawing: RectDrawing) { this.drawing = drawing }

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
    const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x)
    const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y)
    // Hit on border (within 6px)
    const onBorder = (x >= minX - 6 && x <= maxX + 6 && y >= minY - 6 && y <= maxY + 6) &&
      (Math.abs(x - minX) < 6 || Math.abs(x - maxX) < 6 || Math.abs(y - minY) < 6 || Math.abs(y - maxY) < 6)
    if (onBorder) return { cursorStyle: 'pointer', externalId: this.drawing.id, zOrder: 'normal' }
    return null
  }

  _updateView(): void {
    if (!this._chart || !this._series || this.drawing.points.length < 2) {
      this._paneView._renderer = null; return
    }
    const p1 = this._toPixel(this.drawing.points[0])
    const p2 = this._toPixel(this.drawing.points[1])
    if (!p1 || !p2) { this._paneView._renderer = null; return }
    this._paneView._renderer = new RectRenderer(p1.x, p1.y, p2.x, p2.y, this.drawing.color)
  }

  _toPixel(point: { time: string; price: number }) {
    if (!this._chart || !this._series) return null
    const x = this._chart.timeScale().timeToCoordinate(point.time as unknown as Time)
    const y = this._series.priceToCoordinate(point.price)
    if (x === null || y === null) return null
    return { x, y }
  }
}
