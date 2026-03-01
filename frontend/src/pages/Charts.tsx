import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts'
import type { ISeriesApi, ISeriesMarkersPluginApi, SeriesType, Time, MouseEventParams } from 'lightweight-charts'
import { market, indicators } from '../api'
import type { IndicatorDefinition, IndicatorRequest } from '../types'
import type { Drawing, DrawingPoint, FibonacciDrawing, TrendlineDrawing, ArrowDrawing, TextDrawing, ElliottWaveDrawing } from '../types/drawings'
import { requiredPoints, FIB_LEVELS, IMPULSE_LABELS, CORRECTIVE_LABELS } from '../types/drawings'
import { useDrawingStore } from '../context/drawing-store'
import { DrawingManager } from '../lib/drawings/DrawingManager'
import { PreviewPrimitive } from '../lib/drawings/primitives/PreviewPrimitive'
import { detectPatterns } from '../lib/patterns'
import DrawingToolbar from '../components/charts/DrawingToolbar'
import { Search, Settings2, X, CandlestickChart } from 'lucide-react'

const PERIODS = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '5y', 'max']
const ALL_INTERVALS = ['1m', '5m', '15m', '1h', '1d', '1wk', '1mo']
const INTRADAY_INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h'])

/** Convert ISO date string to lightweight-charts Time value.
 *  For intraday intervals: Unix timestamp (seconds).
 *  For daily+: 'YYYY-MM-DD' string. */
function toChartTime(dateStr: string, currentInterval: string): Time {
  if (INTRADAY_INTERVALS.has(currentInterval)) {
    return Math.floor(new Date(dateStr).getTime() / 1000) as unknown as Time
  }
  return dateStr.split('T')[0] as unknown as Time
}

// Yahoo Finance max period (days) per intraday interval
const MAX_PERIOD_DAYS: Record<string, number> = { '1m': 7, '5m': 60, '15m': 60, '1h': 730 }
const PERIOD_DAYS: Record<string, number> = { '1d': 1, '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '5y': 1825, 'max': 99999 }

function validIntervals(period: string): string[] {
  const pDays = PERIOD_DAYS[period] ?? 99999
  return ALL_INTERVALS.filter((iv) => {
    const maxDays = MAX_PERIOD_DAYS[iv]
    return maxDays === undefined || pDays <= maxDays
  })
}

const INDICATOR_COLORS = [
  '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#a78bfa', '#fb7185', '#22d3ee', '#a3e635',
]

const DRAWING_COLORS = ['#f59e0b', '#ec4899', '#06b6d4', '#84cc16', '#8b5cf6']

export default function Charts() {
  const [ticker, setTicker] = useState('AAPL')
  const [searchQuery, setSearchQuery] = useState('')
  const [period, setPeriod] = useState('3mo')
  const [interval, setInterval] = useState('1d')
  const [activeIndicators, setActiveIndicators] = useState<IndicatorRequest[]>([])
  const [indicatorColors, setIndicatorColors] = useState<Record<string, string>>({})
  const [editingIndicator, setEditingIndicator] = useState<string | null>(null)
  const [arrowDirection, setArrowDirection] = useState<'up' | 'down'>('up')
  const [textInput, setTextInput] = useState<{ show: boolean; point: DrawingPoint | null }>({ show: false, point: null })

  const [showPatterns, setShowPatterns] = useState(false)

  const chartRef = useRef<HTMLDivElement>(null)
  const oscChartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<ReturnType<typeof createChart> | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<SeriesType, Time> | null>(null)
  const drawingManagerRef = useRef(new DrawingManager())
  const previewRef = useRef(new PreviewPrimitive())
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)

  // Drawing store
  const drawingStore = useDrawingStore()
  const {
    drawings, activeTool, selectedId,
    setTicker: setDrawingTicker, addDrawing, addPendingPoint,
    resetInteraction, selectDrawing, removeDrawing, elliottWaveType,
  } = drawingStore

  // Sync ticker with drawing store
  useEffect(() => { setDrawingTicker(ticker) }, [ticker, setDrawingTicker])

  // Sync drawings with manager
  useEffect(() => {
    drawingManagerRef.current.syncDrawings(drawings)
  }, [drawings])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { resetInteraction(); previewRef.current.clear() }
      if (e.key === 'Delete' && selectedId) removeDrawing(selectedId)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [resetInteraction, selectedId, removeDrawing])

  const { data: searchResults } = useQuery({
    queryKey: ['search', searchQuery],
    queryFn: () => market.search(searchQuery),
    enabled: searchQuery.length > 1,
  })

  const { data: quote } = useQuery({
    queryKey: ['quote', ticker],
    queryFn: () => market.quote(ticker),
    refetchInterval: 30000,
  })

  const { data: history } = useQuery({
    queryKey: ['history', ticker, period, interval],
    queryFn: () => market.history(ticker, period, interval),
  })

  const { data: catalog } = useQuery({
    queryKey: ['catalog'],
    queryFn: indicators.catalog,
  })

  const { data: indicatorData } = useQuery({
    queryKey: ['indicators', ticker, period, interval, activeIndicators],
    queryFn: () => indicators.calculate({ ticker, period, interval, indicators: activeIndicators }),
    enabled: activeIndicators.length > 0,
  })

  const getIndicatorDef = useCallback(
    (name: string) => catalog?.indicators.find((i) => i.name === name),
    [catalog],
  )

  const getIndicatorColor = useCallback(
    (name: string, idx: number) => indicatorColors[name] ?? INDICATOR_COLORS[idx % INDICATOR_COLORS.length],
    [indicatorColors],
  )

  // Finalize drawing helper
  const finalizeDrawing = useCallback((points: DrawingPoint[], toolType: string) => {
    const color = DRAWING_COLORS[drawings.length % DRAWING_COLORS.length]
    const id = crypto.randomUUID()

    let drawing: Drawing
    switch (toolType) {
      case 'trendline':
        drawing = { id, type: 'trendline', points, color, visible: true, lineWidth: 2 } as TrendlineDrawing
        break
      case 'arrow':
        drawing = { id, type: 'arrow', points, color, visible: true, direction: arrowDirection } as ArrowDrawing
        break
      case 'text':
        return // text finalization handled separately after text input
      case 'fibonacci':
        drawing = { id, type: 'fibonacci', points, color, visible: true, levels: FIB_LEVELS } as FibonacciDrawing
        break
      case 'elliott': {
        const labels = elliottWaveType === 'impulse' ? IMPULSE_LABELS : CORRECTIVE_LABELS
        drawing = { id, type: 'elliott', points, color, visible: true, waveType: elliottWaveType, labels: labels.slice(0, points.length) } as ElliottWaveDrawing
        break
      }
      default:
        return
    }
    addDrawing(drawing)
    previewRef.current.clear()
  }, [drawings.length, arrowDirection, elliottWaveType, addDrawing])

  // Handle chart click for drawing
  const handleChartClick = useCallback((params: MouseEventParams<Time>) => {
    const store = useDrawingStore.getState()

    // If no tool active, check for hit-test selection
    if (!store.activeTool) {
      const hoveredId = params.hoveredObjectId as string | undefined
      if (hoveredId) {
        selectDrawing(hoveredId)
      } else {
        selectDrawing(null)
      }
      return
    }

    // Get coordinates
    if (!params.point || !candleSeriesRef.current) return
    const time = params.time as string | undefined
    if (!time) return
    const price = candleSeriesRef.current.coordinateToPrice(params.point.y)
    if (price === null) return

    const point: DrawingPoint = { time, price: price as number }

    // For text tool, show input overlay
    if (store.activeTool === 'text') {
      setTextInput({ show: true, point })
      previewRef.current.clear()
      return
    }

    const newPending = [...store.pendingPoints, point]
    addPendingPoint(point)

    const required = requiredPoints(store.activeTool)
    if (required !== null && newPending.length >= required) {
      finalizeDrawing(newPending, store.activeTool)
    }
  }, [selectDrawing, addPendingPoint, finalizeDrawing])

  // Handle double-click for Elliott wave completion
  const handleChartDblClick = useCallback((_params: MouseEventParams<Time>) => {
    const store = useDrawingStore.getState()
    if (store.activeTool === 'elliott' && store.pendingPoints.length >= 3) {
      finalizeDrawing(store.pendingPoints, 'elliott')
      previewRef.current.clear()
    }
  }, [finalizeDrawing])

  // Finalize text drawing
  const finalizeText = (text: string) => {
    if (!textInput.point || !text.trim()) {
      setTextInput({ show: false, point: null })
      resetInteraction()
      return
    }
    const color = DRAWING_COLORS[drawings.length % DRAWING_COLORS.length]
    const drawing: TextDrawing = {
      id: crypto.randomUUID(),
      type: 'text',
      points: [textInput.point],
      color,
      visible: true,
      text: text.trim(),
      fontSize: 13,
    }
    addDrawing(drawing)
    setTextInput({ show: false, point: null })
  }

  // Main chart with candles + overlay indicators + drawings
  useEffect(() => {
    if (!chartRef.current || !history?.data.length) return

    const isIntraday = INTRADAY_INTERVALS.has(interval)
    const chart = createChart(chartRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#0f172a' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      width: chartRef.current.clientWidth,
      height: 450,
      timeScale: { borderColor: '#334155', timeVisible: isIntraday, secondsVisible: false },
      rightPriceScale: { borderColor: '#334155' },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444',
      borderDownColor: '#ef4444', borderUpColor: '#10b981',
      wickDownColor: '#ef4444', wickUpColor: '#10b981',
    })

    chartInstanceRef.current = chart
    candleSeriesRef.current = candleSeries as ISeriesApi<SeriesType, Time>

    const times = history.data.map((d) => toChartTime(d.date, interval))

    candleSeries.setData(
      history.data.map((d) => ({
        time: toChartTime(d.date, interval),
        open: d.open, high: d.high, low: d.low, close: d.close,
      }))
    )

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    volumeSeries.setData(
      history.data.map((d) => ({
        time: toChartTime(d.date, interval),
        value: d.volume,
        color: d.close >= d.open ? '#10b98140' : '#ef444440',
      }))
    )

    // Draw overlay indicators — use same color as the indicator cards
    if (indicatorData) {
      indicatorData.indicators.forEach((ind) => {
        const def = getIndicatorDef(ind.name)
        if (!def?.overlay) return

        const aiIdx = activeIndicators.findIndex((a) => a.name === ind.name)
        const baseColor = getIndicatorColor(ind.name, aiIdx >= 0 ? aiIdx : 0)

        Object.entries(ind.data).forEach(([seriesKey, values], subIdx) => {
          const color = subIdx === 0 ? baseColor : INDICATOR_COLORS[(aiIdx + subIdx) % INDICATOR_COLORS.length]
          const lineSeries = chart.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            title: `${ind.name} ${seriesKey}`,
            priceScaleId: 'right',
          })
          const lineData = values
            .map((v, i) => (v !== null ? { time: times[i], value: v } : null))
            .filter(Boolean) as { time: Time; value: number }[]
          lineSeries.setData(lineData)
        })
      })
    }

    // Attach drawing manager
    const seriesRef = candleSeries as ISeriesApi<SeriesType, Time>
    drawingManagerRef.current.attach(chart, seriesRef)
    drawingManagerRef.current.syncDrawings(useDrawingStore.getState().drawings)

    // Attach preview primitive
    seriesRef.attachPrimitive(previewRef.current as unknown as import('lightweight-charts').ISeriesPrimitive<Time>)

    // Drawing click handlers
    chart.subscribeClick(handleChartClick)
    chart.subscribeDblClick(handleChartDblClick)

    // Crosshair move for live preview
    const handleCrosshairMove = (params: MouseEventParams<Time>) => {
      const store = useDrawingStore.getState()
      if (!store.activeTool || store.pendingPoints.length === 0 || !params.point) {
        previewRef.current.clear()
        return
      }
      const anchor = store.pendingPoints[store.pendingPoints.length - 1]
      previewRef.current.update(store.activeTool, anchor, params.point.x, params.point.y)
    }
    chart.subscribeCrosshairMove(handleCrosshairMove)

    // Pattern markers
    if (showPatterns && history.data.length >= 2) {
      const patterns = detectPatterns(history.data)
      const markers = patterns.map((p) => ({
        time: toChartTime(p.date, interval),
        position: p.position,
        shape: (p.position === 'belowBar' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
        color: p.color,
        text: p.label,
      }))
      markersPluginRef.current = createSeriesMarkers(seriesRef, markers)
    }

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.unsubscribeCrosshairMove(handleCrosshairMove)
      if (markersPluginRef.current) {
        markersPluginRef.current.detach()
        markersPluginRef.current = null
      }
      previewRef.current.clear()
      drawingManagerRef.current.detach()
      chart.remove()
    }
  }, [history, indicatorData, interval, showPatterns, getIndicatorDef, getIndicatorColor, handleChartClick, handleChartDblClick])

  // Oscillator chart (RSI, MACD, STOCH, ATR, OBV)
  const oscillatorIndicators = indicatorData?.indicators.filter((ind) => {
    const def = getIndicatorDef(ind.name)
    return def && !def.overlay
  }) ?? []

  useEffect(() => {
    if (!oscChartRef.current || !history?.data.length || oscillatorIndicators.length === 0) return

    const isIntradayOsc = INTRADAY_INTERVALS.has(interval)
    const chart = createChart(oscChartRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#0f172a' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      width: oscChartRef.current.clientWidth,
      height: 200,
      timeScale: { borderColor: '#334155', timeVisible: isIntradayOsc, secondsVisible: false },
      rightPriceScale: { borderColor: '#334155' },
    })

    const oscTimes = history.data.map((d) => toChartTime(d.date, interval))

    oscillatorIndicators.forEach((ind) => {
      const aiIdx = activeIndicators.findIndex((a) => a.name === ind.name)
      const baseColor = getIndicatorColor(ind.name, aiIdx >= 0 ? aiIdx : 0)

      Object.entries(ind.data).forEach(([seriesKey, values], subIdx) => {
        const color = subIdx === 0 ? baseColor : INDICATOR_COLORS[(aiIdx + subIdx) % INDICATOR_COLORS.length]

        if (ind.name === 'MACD' && seriesKey === 'histogram') {
          const histSeries = chart.addSeries(HistogramSeries, {
            color,
            title: `${ind.name} ${seriesKey}`,
          })
          const histData = values
            .map((v, i) => (v !== null ? { time: oscTimes[i], value: v, color: v >= 0 ? '#10b981' : '#ef4444' } : null))
            .filter(Boolean) as { time: Time; value: number; color: string }[]
          histSeries.setData(histData)
        } else {
          const lineSeries = chart.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            title: `${ind.name} ${seriesKey}`,
          })
          const lineData = values
            .map((v, i) => (v !== null ? { time: oscTimes[i], value: v } : null))
            .filter(Boolean) as { time: Time; value: number }[]
          lineSeries.setData(lineData)
        }
      })
    })

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (oscChartRef.current) chart.applyOptions({ width: oscChartRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('resize', handleResize); chart.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, indicatorData])

  const toggleIndicator = (ind: IndicatorDefinition) => {
    setActiveIndicators((prev) => {
      const exists = prev.find((i) => i.name === ind.name)
      if (exists) {
        setEditingIndicator(null)
        return prev.filter((i) => i.name !== ind.name)
      }
      if (prev.length >= 5) return prev
      const params: Record<string, number> = {}
      ind.params.forEach((p) => { params[p.name] = p.default })
      return [...prev, { name: ind.name, params }]
    })
  }

  const updateParam = (indicatorName: string, paramName: string, value: number) => {
    setActiveIndicators((prev) =>
      prev.map((ind) =>
        ind.name === indicatorName
          ? { ...ind, params: { ...ind.params, [paramName]: value } }
          : ind
      )
    )
  }

  const categories = catalog
    ? [...new Set(catalog.indicators.map((i) => i.category))]
    : []

  return (
    <div className="space-y-4">
      {/* Search + Quote */}
      <div className="flex flex-col md:flex-row gap-4 items-start">
        <div className="relative w-full md:w-80">
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded">
            <Search size={16} className="ml-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar ticker o nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-transparent text-white placeholder-slate-400 focus:outline-none"
            />
          </div>
          {searchResults && searchQuery.length > 1 && (
            <div className="absolute z-10 w-full mt-1 bg-slate-900 border border-slate-700 rounded shadow-lg max-h-60 overflow-y-auto">
              {searchResults.slice(0, 8).map((r) => (
                <button
                  key={r.symbol}
                  onClick={() => { setTicker(r.symbol); setSearchQuery('') }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800 text-sm"
                >
                  <span className="font-medium text-emerald-400">{r.symbol}</span>
                  <span className="text-slate-400 ml-2">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {quote && (
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-xl font-bold">{quote.symbol}</h2>
              <p className="text-sm text-slate-400">{quote.name}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold">{quote.price.toFixed(2)} {quote.currency}</p>
              <p className={`text-sm ${quote.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.change_percent.toFixed(2)}%)
              </p>
            </div>
          </div>
        )}

        {/* Arrow direction toggle */}
        {activeTool === 'arrow' && (
          <div className="flex gap-1 items-center">
            <button
              onClick={() => setArrowDirection('up')}
              className={`px-2 py-1 rounded text-xs ${arrowDirection === 'up' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              Arriba
            </button>
            <button
              onClick={() => setArrowDirection('down')}
              className={`px-2 py-1 rounded text-xs ${arrowDirection === 'down' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              Abajo
            </button>
          </div>
        )}
      </div>

      {/* Period + Interval selectors */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => {
              setPeriod(p)
              // Auto-adjust interval if current one is invalid for new period
              const valid = validIntervals(p)
              if (!valid.includes(interval)) setInterval(valid.includes('1d') ? '1d' : valid[valid.length - 1])
            }}
            className={`px-3 py-1 rounded text-sm ${period === p ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            {p.toUpperCase()}
          </button>
        ))}
        <span className="text-slate-600 mx-1">|</span>
        {ALL_INTERVALS.map((i) => {
          const valid = validIntervals(period).includes(i)
          return (
            <button
              key={i}
              onClick={() => valid && setInterval(i)}
              disabled={!valid}
              title={!valid ? `Reduce el período para usar ${i}` : undefined}
              className={`px-3 py-1 rounded text-sm ${
                interval === i ? 'bg-blue-600 text-white'
                : valid ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-900 text-slate-600 cursor-not-allowed'
              }`}
            >
              {i}
            </button>
          )
        })}
      </div>

      {/* Patterns toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowPatterns((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
            showPatterns ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <CandlestickChart size={14} />
          Patrones de velas
        </button>
        {showPatterns && (
          <span className="text-xs text-slate-400">EA/EB Envolvente · MA/MB Marubozu · LLA/LLB Long Line</span>
        )}
      </div>

      {/* Main chart with toolbar */}
      <div className="flex gap-2">
        <DrawingToolbar />
        <div className="flex-1 relative">
          <div
            ref={chartRef}
            className={`bg-slate-900 rounded-lg border border-slate-700 ${activeTool ? 'cursor-crosshair' : ''}`}
          />
          {/* Text input overlay */}
          {textInput.show && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
              <input
                autoFocus
                placeholder="Escribe tu nota..."
                className="bg-slate-800 border border-emerald-500 text-white px-3 py-2 rounded text-sm w-60 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') finalizeText(e.currentTarget.value)
                  if (e.key === 'Escape') { setTextInput({ show: false, point: null }); resetInteraction() }
                }}
                onBlur={(e) => finalizeText(e.currentTarget.value)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Oscillator chart */}
      {oscillatorIndicators.length > 0 && (
        <div ref={oscChartRef} className="bg-slate-900 rounded-lg border border-slate-700" />
      )}

      {/* Active indicators with params */}
      {activeIndicators.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeIndicators.map((ind, idx) => {
            const def = getIndicatorDef(ind.name)
            const indData = indicatorData?.indicators.find((d) => d.name === ind.name)
            const color = getIndicatorColor(ind.name, idx)
            const isEditing = editingIndicator === ind.name

            return (
              <div key={ind.name} className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <label className="relative w-3 h-3 rounded-full cursor-pointer" style={{ backgroundColor: color }}>
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setIndicatorColors((prev) => ({ ...prev, [ind.name]: e.target.value }))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </label>
                    <span className="font-medium text-sm">{def?.display_name ?? ind.name}</span>
                    {def && !def.overlay && <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">osc</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {def && def.params.length > 0 && (
                      <button
                        onClick={() => setEditingIndicator(isEditing ? null : ind.name)}
                        className={`p-1 rounded hover:bg-slate-700 ${isEditing ? 'text-emerald-400' : 'text-slate-500'}`}
                      >
                        <Settings2 size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => toggleIndicator(def!)}
                      className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-red-400"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Last values */}
                {indData && (
                  <div className="text-xs text-slate-400 space-x-3">
                    {Object.entries(indData.data).map(([key, vals]) => {
                      const last = [...vals].reverse().find((v) => v !== null)
                      return <span key={key}>{key}: <span className="text-slate-200">{last?.toFixed(2) ?? 'N/A'}</span></span>
                    })}
                  </div>
                )}

                {/* Param editor */}
                {isEditing && def && (
                  <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                    {def.params.map((p) => (
                      <div key={p.name} className="flex items-center gap-2">
                        <label className="text-xs text-slate-400 w-20">{p.name}</label>
                        <input
                          type="number"
                          value={ind.params[p.name] ?? p.default}
                          min={p.min ?? undefined}
                          max={p.max ?? undefined}
                          onChange={(e) => updateParam(ind.name, p.name, Number(e.target.value))}
                          className="flex-1 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-xs focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Indicators catalog */}
      {catalog && (
        <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
          <h3 className="font-semibold mb-3">Indicadores ({activeIndicators.length}/5)</h3>
          <div className="space-y-3">
            {categories.map((cat) => (
              <div key={cat}>
                <p className="text-xs font-medium text-slate-400 uppercase mb-1">{cat}</p>
                <div className="flex flex-wrap gap-2">
                  {catalog.indicators.filter((i) => i.category === cat).map((ind) => {
                    const active = activeIndicators.some((a) => a.name === ind.name)
                    return (
                      <button
                        key={ind.name}
                        onClick={() => toggleIndicator(ind)}
                        className={`px-3 py-1 rounded text-sm transition-colors ${
                          active ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {ind.display_name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
