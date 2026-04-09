import type {
  ISeriesPrimitive, SeriesAttachedParameter, IPrimitivePaneView,
  IPrimitivePaneRenderer, PrimitiveHoveredItem, SeriesType, Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { FibonacciDrawing } from '../../../types/drawings'
import { drawLine, drawFilledRect } from './renderers'

const LEVEL_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22d3ee', '#8b5cf6', '#ec4899',
  '#6366f1', '#14b8a6', '#f43f5e',
]

interface FibLevel {
  y: number
  price: number
  level: number
}

class FibRenderer implements IPrimitivePaneRenderer {
  levels: FibLevel[]
  chartWidth: number
  constructor(levels: FibLevel[], chartWidth: number) {
    this.levels = levels; this.chartWidth = chartWidth
  }
  draw(target: CanvasRenderingTarget2D): void {
    const w = this.chartWidth

    for (let i = 0; i < this.levels.length - 1; i++) {
      const top = this.levels[i]
      const bot = this.levels[i + 1]
      const color = LEVEL_COLORS[i % LEVEL_COLORS.length]
      drawFilledRect(target, 0, top.y, w, bot.y, color, 0.06)
    }

    for (let i = 0; i < this.levels.length; i++) {
      const lvl = this.levels[i]
      const color = LEVEL_COLORS[i % LEVEL_COLORS.length]
      drawLine(target, 0, lvl.y, w, lvl.y, color, 1, true)

      target.useMediaCoordinateSpace(({ context: ctx }) => {
        ctx.font = '11px sans-serif'
        ctx.fillStyle = color
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        const pct = (lvl.level * 100).toFixed(1)
        ctx.fillText(`${pct}% (${lvl.price.toFixed(2)})`, 8, lvl.y - 2)
      })
    }
  }
}

class FibPaneView implements IPrimitivePaneView {
  _renderer: FibRenderer | null = null
  zOrder(): 'bottom' { return 'bottom' }
  renderer(): IPrimitivePaneRenderer | null { return this._renderer }
}

export class FibonacciPrimitive implements ISeriesPrimitive<Time> {
  drawing: FibonacciDrawing
  isSelected = false
  _chart: SeriesAttachedParameter<Time, SeriesType>['chart'] | null = null
  _series: SeriesAttachedParameter<Time, SeriesType>['series'] | null = null
  _paneView = new FibPaneView()
  _paneViews: readonly IPrimitivePaneView[] = [this._paneView]

  constructor(drawing: FibonacciDrawing) { this.drawing = drawing }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart; this._series = param.series; this._updateView()
  }
  detached(): void { this._chart = null; this._series = null }
  updateAllViews(): void { this._updateView() }
  paneViews(): readonly IPrimitivePaneView[] { return this._paneViews }

  hitTest(_x: number, y: number): PrimitiveHoveredItem | null {
    if (!this._series || this.drawing.points.length < 2) return null
    const p1 = this.drawing.points[0]
    const p2 = this.drawing.points[1]
    const range = p1.price - p2.price

    for (const level of this.drawing.levels) {
      const price = p2.price + range * level
      const ly = this._series.priceToCoordinate(price)
      if (ly !== null && Math.abs(y - ly) < 5) {
        return { cursorStyle: 'pointer', externalId: this.drawing.id, zOrder: 'bottom' }
      }
    }
    return null
  }

  _updateView(): void {
    if (!this._chart || !this._series || this.drawing.points.length < 2) {
      this._paneView._renderer = null; return
    }

    const p1 = this.drawing.points[0]
    const p2 = this.drawing.points[1]
    const range = p1.price - p2.price
    const chartWidth = this._chart.timeScale().width()

    const levels: FibLevel[] = []
    for (const level of this.drawing.levels) {
      const price = p2.price + range * level
      const y = this._series.priceToCoordinate(price)
      if (y !== null) levels.push({ y, price, level })
    }

    if (levels.length < 2) { this._paneView._renderer = null; return }
    this._paneView._renderer = new FibRenderer(levels, chartWidth)
  }
}
