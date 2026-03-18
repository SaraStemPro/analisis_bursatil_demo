import { useEffect, useRef, useCallback } from 'react'
import { createChart, LineSeries, HistogramSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, SeriesType, Time, LogicalRange, MouseEventParams } from 'lightweight-charts'
import type { IndicatorSeries } from '../../types'
import type { Drawing, DrawingPoint } from '../../types/drawings'
import { requiredPoints, FIB_LEVELS } from '../../types/drawings'
import { useDrawingStore } from '../../context/drawing-store'
import { DrawingManager } from '../../lib/drawings/DrawingManager'
import { PreviewPrimitive } from '../../lib/drawings/primitives/PreviewPrimitive'
import { CHART_THEME, INDICATOR_COLORS } from '../../lib/chartUtils'
import type { FibonacciDrawing, TrendlineDrawing, ArrowDrawing, ElliottWaveDrawing, HLineDrawing, VLineDrawing } from '../../types/drawings'
import { IMPULSE_LABELS, CORRECTIVE_LABELS } from '../../types/drawings'

interface OscillatorChartProps {
  indicator: IndicatorSeries
  times: Time[]       // history times — used for spacer (scroll sync)
  indTimes?: Time[]   // indicator dates — used for data mapping (fixes offset)
  color: string
  interval: string
  syncingRef: React.MutableRefObject<boolean>
  onRegister: (chartId: string, chart: IChartApi) => void
  onUnregister: (chartId: string) => void
  onVisibleRangeChange: (range: LogicalRange | null, chartId: string) => void
  chartId: string
  isActive: boolean
  onActivate: () => void
}

const DRAWING_COLORS = ['#f59e0b', '#ec4899', '#06b6d4', '#84cc16', '#8b5cf6']

export default function OscillatorChart({
  indicator, times, indTimes, color, interval, syncingRef,
  onRegister, onUnregister, onVisibleRangeChange,
  chartId, isActive, onActivate,
}: OscillatorChartProps) {
  // Use indicator's own dates for data mapping, fall back to history times
  const dataTimes = indTimes ?? times
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<SeriesType, Time> | null>(null)
  const drawingManagerRef = useRef(new DrawingManager())
  const previewRef = useRef(new PreviewPrimitive())
  const handleChartClickRef = useRef<(params: MouseEventParams<Time>) => void>(() => {})
  const handleChartDblClickRef = useRef<() => void>(() => {})

  const { drawings, activeTool, activeChartId } = useDrawingStore()

  // Filter drawings for this chart
  const chartDrawings = drawings.filter((d) => d.chartId === chartId)

  const finalizeDrawing = useCallback((points: DrawingPoint[], toolType: string) => {
    const store = useDrawingStore.getState()
    const allDrawings = store.drawings
    const drawingColor = DRAWING_COLORS[allDrawings.length % DRAWING_COLORS.length]
    const id = crypto.randomUUID()

    let drawing: Drawing
    switch (toolType) {
      case 'trendline':
        drawing = { id, type: 'trendline', points, color: drawingColor, visible: true, lineWidth: 2, chartId } as TrendlineDrawing
        break
      case 'arrow':
        drawing = { id, type: 'arrow', points, color: store.arrowDirection === 'up' ? '#10b981' : '#ef4444', visible: true, direction: store.arrowDirection, chartId } as ArrowDrawing
        break
      case 'text':
        return
      case 'fibonacci':
        drawing = { id, type: 'fibonacci', points, color: drawingColor, visible: true, levels: FIB_LEVELS, chartId } as FibonacciDrawing
        break
      case 'elliott': {
        const labels = store.elliottWaveType === 'impulse' ? IMPULSE_LABELS : CORRECTIVE_LABELS
        drawing = { id, type: 'elliott', points, color: drawingColor, visible: true, waveType: store.elliottWaveType, labels: labels.slice(0, points.length), chartId } as ElliottWaveDrawing
        break
      }
      case 'hline':
        drawing = { id, type: 'hline', points, color: drawingColor, visible: true, chartId } as HLineDrawing
        break
      case 'vline':
        drawing = { id, type: 'vline', points, color: drawingColor, visible: true, chartId } as VLineDrawing
        break
      default:
        return
    }
    store.addDrawing(drawing)
    previewRef.current.clear()
  }, [chartId])

  const handleChartClick = useCallback((params: MouseEventParams<Time>) => {
    const store = useDrawingStore.getState()
    if (store.activeChartId !== chartId) return

    const getPoint = (): DrawingPoint | null => {
      if (!params.point || !seriesRef.current) return null
      const time = params.time as string | undefined
      if (!time) return null
      const price = seriesRef.current.coordinateToPrice(params.point.y)
      if (price === null) return null
      return { time, price: price as number }
    }

    if (!store.activeTool) {
      const hoveredId = params.hoveredObjectId as string | undefined
      store.selectDrawing(hoveredId ?? null)
      return
    }

    const point = getPoint()
    if (!point) return

    const newPending = [...store.pendingPoints, point]
    store.addPendingPoint(point)

    const required = requiredPoints(store.activeTool)
    if (required !== null && newPending.length >= required) {
      finalizeDrawing(newPending, store.activeTool)
    }
  }, [chartId, finalizeDrawing])

  const handleChartDblClick = useCallback(() => {
    const store = useDrawingStore.getState()
    if (store.activeChartId !== chartId) return
    if (store.activeTool === 'elliott' && store.pendingPoints.length >= 3) {
      finalizeDrawing(store.pendingPoints, 'elliott')
      previewRef.current.clear()
    }
  }, [chartId, finalizeDrawing])

  useEffect(() => { handleChartClickRef.current = handleChartClick }, [handleChartClick])
  useEffect(() => { handleChartDblClickRef.current = handleChartDblClick }, [handleChartDblClick])

  // Create chart
  useEffect(() => {
    if (!chartContainerRef.current || times.length === 0) return

    const isIntraday = new Set(['1m', '5m', '15m', '30m', '1h']).has(interval)
    const chart = createChart(chartContainerRef.current, {
      ...CHART_THEME,
      autoSize: true,
      height: 180,
      crosshair: {
        horzLine: { visible: true, labelVisible: true },
        vertLine: { visible: true, labelVisible: true },
      },
      timeScale: { ...CHART_THEME.timeScale, timeVisible: isIntraday, secondsVisible: false },
    })
    chartInstanceRef.current = chart

    // Invisible spacer series covering ALL times — ensures the oscillator's
    // logical range indices match the main chart's, fixing scroll sync alignment
    const spacerSeries = chart.addSeries(LineSeries, {
      visible: false,
      priceScaleId: '',
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    spacerSeries.setData(times.map((t) => ({ time: t, value: 0 })))

    let firstSeries: ISeriesApi<SeriesType, Time> | null = null
    let lineIdx = 0 // counter for non-histogram line series

    Object.entries(indicator.data).forEach(([seriesKey, values]) => {
      if (indicator.name === 'MACD' && seriesKey === 'histogram') {
        const seriesColor = color
        const histSeries = chart.addSeries(HistogramSeries, {
          color: seriesColor,
          title: `${indicator.name} ${seriesKey}`,
        })
        const histData = values
          .map((v, i) => (v !== null && i < dataTimes.length ? { time: dataTimes[i], value: v, color: v >= 0 ? '#10b981' : '#ef4444' } : null))
          .filter(Boolean) as { time: Time; value: number; color: string }[]
        histSeries.setData(histData)
        if (!firstSeries) firstSeries = histSeries as ISeriesApi<SeriesType, Time>
      } else {
        // First line gets the base color, subsequent lines get distinct colors
        const seriesColor = lineIdx === 0 ? color : INDICATOR_COLORS[(lineIdx + 2) % INDICATOR_COLORS.length]
        lineIdx++
        const lineSeries = chart.addSeries(LineSeries, {
          color: seriesColor,
          lineWidth: 2,
          title: `${indicator.name} ${seriesKey}`,
        })
        const lineData = values
          .map((v, i) => (v !== null && i < dataTimes.length ? { time: dataTimes[i], value: v } : null))
          .filter(Boolean) as { time: Time; value: number }[]
        lineSeries.setData(lineData)
        if (!firstSeries) firstSeries = lineSeries as ISeriesApi<SeriesType, Time>
      }
    })

    // Fixed horizontal reference lines per indicator type
    const REF_LINES: Record<string, { value: number; color: string }[]> = {
      RSI: [
        { value: 70, color: '#ef4444' },
        { value: 30, color: '#10b981' },
      ],
      STOCH: [
        { value: 80, color: '#ef4444' },
        { value: 50, color: '#94a3b8' },
        { value: 20, color: '#10b981' },
      ],
      MACD: [
        { value: 0, color: '#94a3b8' },
      ],
    }
    const refLines = REF_LINES[indicator.name]
    if (refLines && firstSeries) {
      refLines.forEach((rl) => {
        (firstSeries as ISeriesApi<SeriesType, Time>).createPriceLine({
          price: rl.value,
          color: rl.color,
          lineWidth: 2,
          lineStyle: 1,
          axisLabelVisible: true,
          title: '',
        })
      })
    }

    if (firstSeries) {
      const series = firstSeries as ISeriesApi<SeriesType, Time>
      seriesRef.current = series
      drawingManagerRef.current.attach(chart, series)
      drawingManagerRef.current.syncDrawings(chartDrawings)
      series.attachPrimitive(previewRef.current as unknown as import('lightweight-charts').ISeriesPrimitive<Time>)
    }

    // Click handlers
    const onChartClick = (params: MouseEventParams<Time>) => handleChartClickRef.current(params)
    const onChartDblClick = () => handleChartDblClickRef.current()
    chart.subscribeClick(onChartClick)
    if (typeof chart.subscribeDblClick === 'function') {
      chart.subscribeDblClick(onChartDblClick)
    }

    // Crosshair move for preview
    const handleCrosshairMove = (params: MouseEventParams<Time>) => {
      const store = useDrawingStore.getState()
      if (store.activeChartId !== chartId) return
      if (!store.activeTool || !params.point) {
        previewRef.current.clear()
        return
      }
      // hline/vline: show preview without anchor
      if ((store.activeTool === 'hline' || store.activeTool === 'vline') && store.pendingPoints.length === 0) {
        previewRef.current.updateNoAnchor(store.activeTool, params.point.x, params.point.y)
        return
      }
      if (store.pendingPoints.length === 0) {
        previewRef.current.clear()
        return
      }
      const anchor = store.pendingPoints[store.pendingPoints.length - 1]
      previewRef.current.update(store.activeTool, anchor, params.point.x, params.point.y)
    }
    chart.subscribeCrosshairMove(handleCrosshairMove)

    // Sync visible range outward — SHARED syncingRef prevents loops
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncingRef.current) return
      onVisibleRangeChange(range, chartId)
    })

    chart.timeScale().fitContent()

    // Register this chart instance with parent for direct sync
    onRegister(chartId, chart)

    return () => {
      onUnregister(chartId)
      previewRef.current.clear()
      drawingManagerRef.current.detach()
      chart.remove()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicator, times, color, interval, chartId])

  // Sync drawings updates
  useEffect(() => {
    drawingManagerRef.current.syncDrawings(chartDrawings)
  }, [chartDrawings])

  return (
    <div className="relative" onClick={onActivate}>
      <div
        ref={chartContainerRef}
        className={`bg-slate-900 rounded-lg border transition-colors ${
          isActive ? 'border-emerald-500' : 'border-slate-700'
        } ${activeTool && activeChartId === chartId ? 'cursor-crosshair' : ''}`}
      />
    </div>
  )
}
