import type {
  IChartApi, ISeriesApi, ISeriesPrimitive, SeriesType, Time,
} from 'lightweight-charts'
import type { Drawing } from '../../types/drawings'
import { TrendlinePrimitive } from './primitives/TrendlinePrimitive'
import { ArrowPrimitive } from './primitives/ArrowPrimitive'
import { TextPrimitive } from './primitives/TextPrimitive'
import { FibonacciPrimitive } from './primitives/FibonacciPrimitive'
import { ElliottWavePrimitive } from './primitives/ElliottWavePrimitive'
import { HLinePrimitive } from './primitives/HLinePrimitive'
import { VLinePrimitive } from './primitives/VLinePrimitive'

type AnyPrimitive = TrendlinePrimitive | ArrowPrimitive | TextPrimitive | FibonacciPrimitive | ElliottWavePrimitive | HLinePrimitive | VLinePrimitive

export class DrawingManager {
  private _series: ISeriesApi<SeriesType, Time> | null = null
  private _primitives = new Map<string, AnyPrimitive>()

  attach(_chart: IChartApi, series: ISeriesApi<SeriesType, Time>): void {
    this._series = series
    for (const primitive of this._primitives.values()) {
      series.attachPrimitive(primitive as ISeriesPrimitive<Time>)
    }
  }

  detach(): void {
    this._series = null
  }

  syncDrawings(drawings: Drawing[], selectedId: string | null = null): void {
    if (!this._series) return

    const currentIds = new Set(this._primitives.keys())
    const newIds = new Set(drawings.map((d) => d.id))

    // Remove deleted drawings
    for (const id of currentIds) {
      if (!newIds.has(id)) {
        const primitive = this._primitives.get(id)
        if (primitive) {
          this._series.detachPrimitive(primitive as ISeriesPrimitive<Time>)
          this._primitives.delete(id)
        }
      }
    }

    // Add new or update existing drawings
    for (const drawing of drawings) {
      const existing = this._primitives.get(drawing.id)
      if (existing) {
        // If drawing data changed (color, points, etc.), recreate the primitive
        // to force an immediate visual update
        const changed = (existing.drawing as unknown) !== (drawing as unknown)
        if (changed) {
          this._series.detachPrimitive(existing as ISeriesPrimitive<Time>)
          this._primitives.delete(drawing.id)
          const primitive = this._createPrimitive(drawing)
          if (primitive) {
            primitive.isSelected = drawing.id === selectedId
            this._primitives.set(drawing.id, primitive)
            this._series.attachPrimitive(primitive as ISeriesPrimitive<Time>)
          }
        } else {
          existing.isSelected = drawing.id === selectedId
        }
      } else {
        const primitive = this._createPrimitive(drawing)
        if (primitive) {
          primitive.isSelected = drawing.id === selectedId
          this._primitives.set(drawing.id, primitive)
          this._series.attachPrimitive(primitive as ISeriesPrimitive<Time>)
        }
      }
    }
  }

  setSelected(selectedId: string | null): void {
    for (const [id, primitive] of this._primitives) {
      primitive.isSelected = id === selectedId
    }
  }

  clear(): void {
    if (!this._series) return
    for (const primitive of this._primitives.values()) {
      this._series.detachPrimitive(primitive as ISeriesPrimitive<Time>)
    }
    this._primitives.clear()
  }

  private _createPrimitive(drawing: Drawing): AnyPrimitive | null {
    switch (drawing.type) {
      case 'trendline': return new TrendlinePrimitive(drawing)
      case 'arrow': return new ArrowPrimitive(drawing)
      case 'text': return new TextPrimitive(drawing)
      case 'fibonacci': return new FibonacciPrimitive(drawing)
      case 'elliott': return new ElliottWavePrimitive(drawing)
      case 'hline': return new HLinePrimitive(drawing)
      case 'vline': return new VLinePrimitive(drawing)
    }
  }
}
