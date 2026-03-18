import type {
  ISeriesPrimitive, SeriesAttachedParameter, IPrimitivePaneView,
  IPrimitivePaneRenderer, SeriesType, Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { DrawingToolType, DrawingPoint } from '../../../types/drawings'
import { drawLine, drawFilledRect } from './renderers'
import { FIB_LEVELS } from '../../../types/drawings'

const FIB_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22d3ee', '#8b5cf6', '#ec4899']

class PreviewRenderer implements IPrimitivePaneRenderer {
  tool: DrawingToolType
  x1: number; y1: number; x2: number; y2: number
  chartWidth: number
  fibLevels: { y: number; level: number; price: number }[]

  constructor(
    tool: DrawingToolType,
    x1: number, y1: number, x2: number, y2: number,
    chartWidth: number,
    fibLevels: { y: number; level: number; price: number }[],
  ) {
    this.tool = tool; this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2
    this.chartWidth = chartWidth; this.fibLevels = fibLevels
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this.tool === 'trendline' || this.tool === 'elliott') {
      drawLine(target, this.x1, this.y1, this.x2, this.y2, '#00000080', 2, true)
    } else if (this.tool === 'hline') {
      drawLine(target, 0, this.y2, this.chartWidth, this.y2, '#00000080', 1.5, true)
    } else if (this.tool === 'vline') {
      drawLine(target, this.x2, 0, this.x2, 2000, '#00000080', 1.5, true)
    } else if (this.tool === 'fibonacci') {
      // Draw preview fib levels
      for (let i = 0; i < this.fibLevels.length - 1; i++) {
        const top = this.fibLevels[i]
        const bot = this.fibLevels[i + 1]
        const color = FIB_COLORS[i % FIB_COLORS.length]
        drawFilledRect(target, 0, top.y, this.chartWidth, bot.y, color, 0.04)
      }
      for (const lvl of this.fibLevels) {
        const color = FIB_COLORS[this.fibLevels.indexOf(lvl) % FIB_COLORS.length]
        drawLine(target, 0, lvl.y, this.chartWidth, lvl.y, color + '80', 1, true)

        target.useMediaCoordinateSpace(({ context: ctx }) => {
          ctx.font = '10px sans-serif'
          ctx.fillStyle = color + '80'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'bottom'
          ctx.fillText(`${(lvl.level * 100).toFixed(1)}%`, 8, lvl.y - 2)
        })
      }
    }
  }
}

class PreviewPaneView implements IPrimitivePaneView {
  _renderer: PreviewRenderer | null = null
  zOrder(): 'top' { return 'top' }
  renderer(): IPrimitivePaneRenderer | null { return this._renderer }
}

export class PreviewPrimitive implements ISeriesPrimitive<Time> {
  _chart: SeriesAttachedParameter<Time, SeriesType>['chart'] | null = null
  _series: SeriesAttachedParameter<Time, SeriesType>['series'] | null = null
  _paneView = new PreviewPaneView()
  _paneViews: readonly IPrimitivePaneView[] = [this._paneView]
  _requestUpdate: (() => void) | null = null

  // State set externally
  tool: DrawingToolType | null = null
  anchorPoint: DrawingPoint | null = null
  cursorX = 0
  cursorY = 0

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart
    this._series = param.series
    this._requestUpdate = param.requestUpdate
  }

  detached(): void {
    this._chart = null; this._series = null; this._requestUpdate = null
  }

  updateAllViews(): void { this._updateView() }
  paneViews(): readonly IPrimitivePaneView[] { return this._paneViews }

  update(tool: DrawingToolType | null, anchor: DrawingPoint | null, cx: number, cy: number): void {
    this.tool = tool
    this.anchorPoint = anchor
    this.cursorX = cx
    this.cursorY = cy
    this._updateView()
    this._requestUpdate?.()
  }

  clear(): void {
    this.tool = null
    this.anchorPoint = null
    this._paneView._renderer = null
    this._requestUpdate?.()
  }

  /** Preview for hline/vline that doesn't need an anchor point — just cursor position */
  updateNoAnchor(tool: DrawingToolType, cx: number, cy: number): void {
    this.tool = tool
    this.anchorPoint = null
    this.cursorX = cx
    this.cursorY = cy
    if (!this._chart) { this._paneView._renderer = null; return }
    const chartWidth = this._chart.timeScale().width()
    this._paneView._renderer = new PreviewRenderer(tool, 0, 0, cx, cy, chartWidth, [])
    this._requestUpdate?.()
  }

  _updateView(): void {
    if (!this._chart || !this._series || !this.tool || !this.anchorPoint) {
      this._paneView._renderer = null
      return
    }

    const ax = this._chart.timeScale().timeToCoordinate(this.anchorPoint.time as unknown as Time)
    const ay = this._series.priceToCoordinate(this.anchorPoint.price)
    if (ax === null || ay === null) { this._paneView._renderer = null; return }

    let fibLevels: { y: number; level: number; price: number }[] = []

    if (this.tool === 'fibonacci') {
      const cursorPrice = this._series.coordinateToPrice(this.cursorY)
      if (cursorPrice === null) { this._paneView._renderer = null; return }
      const range = this.anchorPoint.price - (cursorPrice as number)
      const chartWidth = this._chart.timeScale().width()

      for (const level of FIB_LEVELS) {
        const price = (cursorPrice as number) + range * level
        const y = this._series.priceToCoordinate(price)
        if (y !== null) fibLevels.push({ y, level, price })
      }

      this._paneView._renderer = new PreviewRenderer(
        this.tool, ax, ay, this.cursorX, this.cursorY, chartWidth, fibLevels,
      )
    } else {
      this._paneView._renderer = new PreviewRenderer(
        this.tool, ax, ay, this.cursorX, this.cursorY, 0, [],
      )
    }
  }
}
