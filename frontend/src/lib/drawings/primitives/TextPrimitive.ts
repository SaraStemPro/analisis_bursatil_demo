import type {
  ISeriesPrimitive, SeriesAttachedParameter, IPrimitivePaneView,
  IPrimitivePaneRenderer, PrimitiveHoveredItem, SeriesType, Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { TextDrawing } from '../../../types/drawings'
import { drawText } from './renderers'

class TextRenderer implements IPrimitivePaneRenderer {
  x: number; y: number; text: string; fontSize: number; color: string
  constructor(x: number, y: number, text: string, fontSize: number, color: string) {
    this.x = x; this.y = y; this.text = text; this.fontSize = fontSize; this.color = color
  }
  draw(target: CanvasRenderingTarget2D): void {
    drawText(target, this.x, this.y, this.text, this.fontSize, this.color, '#1e293b')
  }
}

class TextPaneView implements IPrimitivePaneView {
  _renderer: TextRenderer | null = null
  zOrder(): 'top' { return 'top' }
  renderer(): IPrimitivePaneRenderer | null { return this._renderer }
}

export class TextPrimitive implements ISeriesPrimitive<Time> {
  drawing: TextDrawing
  _chart: SeriesAttachedParameter<Time, SeriesType>['chart'] | null = null
  _series: SeriesAttachedParameter<Time, SeriesType>['series'] | null = null
  _paneView = new TextPaneView()
  _paneViews: readonly IPrimitivePaneView[] = [this._paneView]

  constructor(drawing: TextDrawing) { this.drawing = drawing }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart; this._series = param.series; this._updateView()
  }
  detached(): void { this._chart = null; this._series = null }
  updateAllViews(): void { this._updateView() }
  paneViews(): readonly IPrimitivePaneView[] { return this._paneViews }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    if (!this._chart || !this._series || this.drawing.points.length < 1) return null
    const p = this._toPixel(this.drawing.points[0])
    if (!p) return null
    if (Math.abs(x - p.x) < 40 && Math.abs(y - p.y) < 20) {
      return { cursorStyle: 'pointer', externalId: this.drawing.id, zOrder: 'top' }
    }
    return null
  }

  _updateView(): void {
    if (!this._chart || !this._series || this.drawing.points.length < 1) {
      this._paneView._renderer = null; return
    }
    const p = this._toPixel(this.drawing.points[0])
    if (!p) { this._paneView._renderer = null; return }
    this._paneView._renderer = new TextRenderer(p.x, p.y, this.drawing.text, this.drawing.fontSize, this.drawing.color)
  }

  _toPixel(point: { time: string; price: number }) {
    if (!this._chart || !this._series) return null
    const x = this._chart.timeScale().timeToCoordinate(point.time as unknown as Time)
    const y = this._series.priceToCoordinate(point.price)
    if (x === null || y === null) return null
    return { x, y }
  }
}
