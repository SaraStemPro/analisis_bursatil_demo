import type {
  ISeriesPrimitive, SeriesAttachedParameter, IPrimitivePaneView,
  IPrimitivePaneRenderer, PrimitiveHoveredItem, SeriesType, Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { HLineDrawing } from '../../../types/drawings'
import { drawLine } from './renderers'

class HLineRenderer implements IPrimitivePaneRenderer {
  y: number; color: string; chartWidth: number
  constructor(y: number, color: string, chartWidth: number) {
    this.y = y; this.color = color; this.chartWidth = chartWidth
  }
  draw(target: CanvasRenderingTarget2D): void {
    drawLine(target, 0, this.y, this.chartWidth, this.y, this.color, 1.5, true)
  }
}

class HLinePaneView implements IPrimitivePaneView {
  _renderer: HLineRenderer | null = null
  zOrder(): 'normal' { return 'normal' }
  renderer(): IPrimitivePaneRenderer | null { return this._renderer }
}

export class HLinePrimitive implements ISeriesPrimitive<Time> {
  drawing: HLineDrawing
  isSelected = false
  _chart: SeriesAttachedParameter<Time, SeriesType>['chart'] | null = null
  _series: SeriesAttachedParameter<Time, SeriesType>['series'] | null = null
  _paneView = new HLinePaneView()
  _paneViews: readonly IPrimitivePaneView[] = [this._paneView]

  constructor(drawing: HLineDrawing) { this.drawing = drawing }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart; this._series = param.series; this._updateView()
  }
  detached(): void { this._chart = null; this._series = null }
  updateAllViews(): void { this._updateView() }
  paneViews(): readonly IPrimitivePaneView[] { return this._paneViews }

  hitTest(_x: number, y: number): PrimitiveHoveredItem | null {
    if (!this._series || this.drawing.points.length < 1) return null
    const lineY = this._series.priceToCoordinate(this.drawing.points[0].price)
    if (lineY === null) return null
    if (Math.abs(y - lineY) < 5) {
      return { cursorStyle: 'pointer', externalId: this.drawing.id, zOrder: 'normal' }
    }
    return null
  }

  _updateView(): void {
    if (!this._chart || !this._series || this.drawing.points.length < 1) {
      this._paneView._renderer = null; return
    }
    const y = this._series.priceToCoordinate(this.drawing.points[0].price)
    if (y === null) { this._paneView._renderer = null; return }
    const chartWidth = this._chart.timeScale().width()
    this._paneView._renderer = new HLineRenderer(y, this.drawing.color, chartWidth)
  }
}
