import type {
  ISeriesPrimitive, SeriesAttachedParameter, IPrimitivePaneView,
  IPrimitivePaneRenderer, PrimitiveHoveredItem, SeriesType, Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { TrendlineDrawing } from '../../../types/drawings'
import { drawLine, pointToSegmentDist } from './renderers'

class TrendlineRenderer implements IPrimitivePaneRenderer {
  x1: number; y1: number; x2: number; y2: number; color: string; lineWidth: number
  constructor(x1: number, y1: number, x2: number, y2: number, color: string, lineWidth: number) {
    this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2
    this.color = color; this.lineWidth = lineWidth
  }
  draw(target: CanvasRenderingTarget2D): void {
    drawLine(target, this.x1, this.y1, this.x2, this.y2, this.color, this.lineWidth)
  }
}

class TrendlinePaneView implements IPrimitivePaneView {
  _renderer: TrendlineRenderer | null = null
  zOrder(): 'normal' { return 'normal' }
  renderer(): IPrimitivePaneRenderer | null { return this._renderer }
}

export class TrendlinePrimitive implements ISeriesPrimitive<Time> {
  drawing: TrendlineDrawing
  isSelected = false
  _chart: SeriesAttachedParameter<Time, SeriesType>['chart'] | null = null
  _series: SeriesAttachedParameter<Time, SeriesType>['series'] | null = null
  _paneView = new TrendlinePaneView()
  _paneViews: readonly IPrimitivePaneView[] = [this._paneView]

  constructor(drawing: TrendlineDrawing) { this.drawing = drawing }

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
    if (pointToSegmentDist(x, y, p1.x, p1.y, p2.x, p2.y) < 8) {
      return { cursorStyle: 'pointer', externalId: this.drawing.id, zOrder: 'normal' }
    }
    return null
  }

  _updateView(): void {
    if (!this._chart || !this._series || this.drawing.points.length < 2) {
      this._paneView._renderer = null; return
    }
    const p1 = this._toPixel(this.drawing.points[0])
    const p2 = this._toPixel(this.drawing.points[1])
    if (!p1 || !p2) { this._paneView._renderer = null; return }
    this._paneView._renderer = new TrendlineRenderer(p1.x, p1.y, p2.x, p2.y, this.drawing.color, this.drawing.lineWidth)
  }

  _toPixel(point: { time: string; price: number }) {
    if (!this._chart || !this._series) return null
    const x = this._chart.timeScale().timeToCoordinate(point.time as unknown as Time)
    const y = this._series.priceToCoordinate(point.price)
    if (x === null || y === null) return null
    return { x, y }
  }
}
