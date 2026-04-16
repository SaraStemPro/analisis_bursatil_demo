import type {
  ISeriesPrimitive, SeriesAttachedParameter, IPrimitivePaneView,
  IPrimitivePaneRenderer, PrimitiveHoveredItem, SeriesType, Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { VLineDrawing } from '../../../types/drawings'
import { drawLine, timeToX } from './renderers'

class VLineRenderer implements IPrimitivePaneRenderer {
  x: number; color: string; chartHeight: number
  constructor(x: number, color: string, chartHeight: number) {
    this.x = x; this.color = color; this.chartHeight = chartHeight
  }
  draw(target: CanvasRenderingTarget2D): void {
    drawLine(target, this.x, 0, this.x, this.chartHeight, this.color, 1.5, true)
  }
}

class VLinePaneView implements IPrimitivePaneView {
  _renderer: VLineRenderer | null = null
  zOrder(): 'normal' { return 'normal' }
  renderer(): IPrimitivePaneRenderer | null { return this._renderer }
}

export class VLinePrimitive implements ISeriesPrimitive<Time> {
  drawing: VLineDrawing
  isSelected = false
  _chart: SeriesAttachedParameter<Time, SeriesType>['chart'] | null = null
  _series: SeriesAttachedParameter<Time, SeriesType>['series'] | null = null
  _paneView = new VLinePaneView()
  _paneViews: readonly IPrimitivePaneView[] = [this._paneView]

  constructor(drawing: VLineDrawing) { this.drawing = drawing }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart; this._series = param.series; this._updateView()
  }
  detached(): void { this._chart = null; this._series = null }
  updateAllViews(): void { this._updateView() }
  paneViews(): readonly IPrimitivePaneView[] { return this._paneViews }

  hitTest(x: number): PrimitiveHoveredItem | null {
    if (!this._chart || this.drawing.points.length < 1) return null
    const lineX = this._timeToX(this.drawing.points[0].time)
    if (lineX === null) return null
    if (Math.abs(x - lineX) < 5) {
      return { cursorStyle: 'pointer', externalId: this.drawing.id, zOrder: 'normal' }
    }
    return null
  }

  _updateView(): void {
    if (!this._chart || !this._series || this.drawing.points.length < 1) {
      this._paneView._renderer = null; return
    }
    const x = this._timeToX(this.drawing.points[0].time)
    if (x === null) { this._paneView._renderer = null; return }
    // Use a large height; the renderer clips automatically
    this._paneView._renderer = new VLineRenderer(x, this.drawing.color, 2000)
  }

  _timeToX(time: string): number | null {
    if (!this._chart) return null
    return timeToX(this._chart, time)
  }
}
