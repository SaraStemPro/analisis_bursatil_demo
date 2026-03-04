import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, PriceScaleMode, createSeriesMarkers } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, ISeriesMarkersPluginApi, SeriesType, Time, MouseEventParams, LogicalRange } from 'lightweight-charts'
import { market, indicators } from '../api'
import type { IndicatorDefinition, IndicatorRequest } from '../types'
import type { Drawing, DrawingPoint, FibonacciDrawing, TrendlineDrawing, ArrowDrawing, TextDrawing, ElliottWaveDrawing, HLineDrawing, VLineDrawing } from '../types/drawings'
import { requiredPoints, FIB_LEVELS, IMPULSE_LABELS, CORRECTIVE_LABELS } from '../types/drawings'
import { useDrawingStore } from '../context/drawing-store'
import { DrawingManager } from '../lib/drawings/DrawingManager'
import { PreviewPrimitive } from '../lib/drawings/primitives/PreviewPrimitive'
import { detectPatterns, PATTERN_CATALOG } from '../lib/patterns'
import type { PatternType } from '../lib/patterns'
import { getRecentTickers, addRecentTicker, removeRecentTicker } from '../lib/recentTickers'
import { toChartTime, INTRADAY_INTERVALS, INDICATOR_COLORS } from '../lib/chartUtils'
import DrawingToolbar from '../components/charts/DrawingToolbar'
import OscillatorChart from '../components/charts/OscillatorChart'
import { Search, Settings2, X, CandlestickChart, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'

const PERIODS = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '5y', 'max']
const ALL_INTERVALS = ['1m', '5m', '15m', '1h', '1d', '1wk', '1mo']

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

const DRAWING_COLORS = ['#f59e0b', '#ec4899', '#06b6d4', '#84cc16', '#8b5cf6']

export default function Charts() {
  const [ticker, setTicker] = useState('AAPL')
  const [searchQuery, setSearchQuery] = useState('')
  const [period, setPeriod] = useState('3mo')
  const [interval, setInterval] = useState('1d')
  const [activeIndicators, setActiveIndicators] = useState<IndicatorRequest[]>([])
  const [indicatorColors, setIndicatorColors] = useState<Record<string, string>>({})
  const [editingIndicator, setEditingIndicator] = useState<string | null>(null)
  const [textInput, setTextInput] = useState<{ show: boolean; point: DrawingPoint | null }>({ show: false, point: null })

  // Feature 11: pattern selector — set of active pattern types
  const [activePatterns, setActivePatterns] = useState<Set<PatternType>>(new Set())
  const [showPatternSelector, setShowPatternSelector] = useState(false)

  // Feature 5: log scale
  const [logScale, setLogScale] = useState(false)

  // Feature 1: recent tickers
  const [recentTickers, setRecentTickers] = useState<string[]>(() => getRecentTickers())

  // Feature 9: synced range for oscillators — ref-based to avoid re-render loops
  const isSyncingRef = useRef(false)
  const oscChartsRef = useRef<Map<string, IChartApi>>(new Map())

  // Feature 4: preserve scale
  const savedRangeRef = useRef<LogicalRange | null>(null)
  const isFirstLoadRef = useRef(true)

  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<SeriesType, Time> | null>(null)
  const drawingManagerRef = useRef(new DrawingManager())
  const previewRef = useRef(new PreviewPrimitive())
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  // Stable refs for chart event handlers — prevents chart recreation on state changes
  const handleChartClickRef = useRef<(params: MouseEventParams<Time>) => void>(() => {})
  const handleChartDblClickRef = useRef<() => void>(() => {})

  // Drawing store
  const {
    drawings, activeTool, selectedId, activeChartId,
    setTicker: setDrawingTicker,
    resetInteraction, removeDrawing, setActiveChartId,
  } = useDrawingStore()

  // Filter drawings for main chart
  const mainDrawings = drawings.filter((d) => !d.chartId || d.chartId === 'main')

  // Sync ticker with drawing store + recent tickers
  useEffect(() => {
    setDrawingTicker(ticker)
    setRecentTickers(addRecentTicker(ticker))
  }, [ticker, setDrawingTicker])

  // Feature 4: Reset isFirstLoad when data source changes (not indicators)
  useEffect(() => {
    isFirstLoadRef.current = true
    savedRangeRef.current = null
  }, [ticker, period, interval])

  // Sync drawings with manager
  useEffect(() => {
    drawingManagerRef.current.syncDrawings(mainDrawings)
  }, [mainDrawings])

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

  // Finalize drawing helper — reads arrowDirection/elliottWaveType from store at call time
  const finalizeDrawing = useCallback((points: DrawingPoint[], toolType: string) => {
    const store = useDrawingStore.getState()
    const color = DRAWING_COLORS[store.drawings.length % DRAWING_COLORS.length]
    const id = crypto.randomUUID()

    let drawing: Drawing
    switch (toolType) {
      case 'trendline':
        drawing = { id, type: 'trendline', points, color, visible: true, lineWidth: 2, chartId: 'main' } as TrendlineDrawing
        break
      case 'arrow':
        drawing = { id, type: 'arrow', points, color: store.arrowDirection === 'up' ? '#10b981' : '#ef4444', visible: true, direction: store.arrowDirection, chartId: 'main' } as ArrowDrawing
        break
      case 'text':
        return // text finalization handled separately after text input
      case 'fibonacci':
        drawing = { id, type: 'fibonacci', points, color, visible: true, levels: FIB_LEVELS, chartId: 'main' } as FibonacciDrawing
        break
      case 'elliott': {
        const labels = store.elliottWaveType === 'impulse' ? IMPULSE_LABELS : CORRECTIVE_LABELS
        drawing = { id, type: 'elliott', points, color, visible: true, waveType: store.elliottWaveType, labels: labels.slice(0, points.length), chartId: 'main' } as ElliottWaveDrawing
        break
      }
      case 'hline':
        drawing = { id, type: 'hline', points, color, visible: true, chartId: 'main' } as HLineDrawing
        break
      case 'vline':
        drawing = { id, type: 'vline', points, color, visible: true, chartId: 'main' } as VLineDrawing
        break
      default:
        return
    }
    store.addDrawing(drawing)
    previewRef.current.clear()
  }, [])

  // Handle chart click for drawing — reads all state from store to avoid stale closures
  const handleChartClick = useCallback((params: MouseEventParams<Time>) => {
    const store = useDrawingStore.getState()

    // Get coordinates helper
    const getPoint = (): DrawingPoint | null => {
      if (!params.point || !candleSeriesRef.current) return null
      const time = params.time as string | undefined
      if (!time) return null
      const price = candleSeriesRef.current.coordinateToPrice(params.point.y)
      if (price === null) return null
      return { time, price: price as number }
    }

    // Only handle clicks if main chart is active
    if (store.activeChartId !== 'main') return

    // If no tool active, check for hit-test selection
    if (!store.activeTool) {
      const hoveredId = params.hoveredObjectId as string | undefined
      store.selectDrawing(hoveredId ?? null)
      return
    }

    // Get coordinates for drawing tools
    const point = getPoint()
    if (!point) return

    // For text tool, show input overlay
    if (store.activeTool === 'text') {
      setTextInput({ show: true, point })
      previewRef.current.clear()
      return
    }

    const newPending = [...store.pendingPoints, point]
    store.addPendingPoint(point)

    const required = requiredPoints(store.activeTool)
    if (required !== null && newPending.length >= required) {
      finalizeDrawing(newPending, store.activeTool)
    }
  }, [finalizeDrawing])

  // Handle double-click for Elliott wave completion
  const handleChartDblClick = useCallback(() => {
    const store = useDrawingStore.getState()
    if (store.activeChartId !== 'main') return
    if (store.activeTool === 'elliott' && store.pendingPoints.length >= 3) {
      finalizeDrawing(store.pendingPoints, 'elliott')
      previewRef.current.clear()
    }
  }, [finalizeDrawing])

  // Keep callback refs current (avoids chart recreation on every state change)
  useEffect(() => { handleChartClickRef.current = handleChartClick }, [handleChartClick])
  useEffect(() => { handleChartDblClickRef.current = handleChartDblClick }, [handleChartDblClick])

  // Finalize text drawing
  const finalizeText = (text: string) => {
    if (!textInput.point || !text.trim()) {
      setTextInput({ show: false, point: null })
      resetInteraction()
      return
    }
    const store = useDrawingStore.getState()
    const color = DRAWING_COLORS[store.drawings.length % DRAWING_COLORS.length]
    const drawing: TextDrawing = {
      id: crypto.randomUUID(),
      type: 'text',
      points: [textInput.point],
      color,
      visible: true,
      text: text.trim(),
      fontSize: 13,
      chartId: 'main',
    }
    store.addDrawing(drawing)
    setTextInput({ show: false, point: null })
  }

  // Main chart with candles + overlay indicators + drawings
  useEffect(() => {
    if (!chartRef.current || !history?.data.length) return

    let chart: ReturnType<typeof createChart>
    try {

    const isIntraday = INTRADAY_INTERVALS.has(interval)
    chart = createChart(chartRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#0f172a' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      autoSize: true,
      height: 450,
      timeScale: { borderColor: '#334155', timeVisible: isIntraday, secondsVisible: false },
      rightPriceScale: { borderColor: '#334155', mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal },
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
    // (FRACTALS rendered as markers below, not as LineSeries)
    if (indicatorData) {
      indicatorData.indicators.forEach((ind) => {
        const def = getIndicatorDef(ind.name)
        if (!def?.overlay || ind.name === 'FRACTALS') return

        const aiIdx = activeIndicators.findIndex((a) => a.name === ind.name)
        const baseColor = getIndicatorColor(ind.name, aiIdx >= 0 ? aiIdx : 0)

        Object.entries(ind.data).forEach(([seriesKey, values], subIdx) => {
          const seriesColor = subIdx === 0 ? baseColor : INDICATOR_COLORS[(aiIdx + subIdx) % INDICATOR_COLORS.length]
          const lineSeries = chart.addSeries(LineSeries, {
            color: seriesColor,
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
    drawingManagerRef.current.syncDrawings(useDrawingStore.getState().drawings.filter((d) => !d.chartId || d.chartId === 'main'))

    // Attach preview primitive
    seriesRef.attachPrimitive(previewRef.current as unknown as import('lightweight-charts').ISeriesPrimitive<Time>)

    // Drawing click handlers — use refs for stable subscriptions
    const onChartClick = (params: MouseEventParams<Time>) => handleChartClickRef.current(params)
    const onChartDblClick = () => handleChartDblClickRef.current()
    chart.subscribeClick(onChartClick)
    if (typeof chart.subscribeDblClick === 'function') {
      chart.subscribeDblClick(onChartDblClick)
    }

    // Crosshair move for live preview
    const handleCrosshairMove = (params: MouseEventParams<Time>) => {
      const store = useDrawingStore.getState()
      if (store.activeChartId !== 'main') return
      if (!store.activeTool || !params.point) {
        previewRef.current.clear()
        return
      }
      // hline/vline: show preview without anchor point
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

    // Collect all markers: patterns + fractals
    const allMarkers: { time: Time; position: 'aboveBar' | 'belowBar'; shape: 'arrowUp' | 'arrowDown'; color: string; text: string }[] = []

    // Pattern markers — Feature 11: filter by activePatterns
    if (activePatterns.size > 0 && history.data.length >= 2) {
      const patterns = detectPatterns(history.data).filter((p) => activePatterns.has(p.type))
      patterns.forEach((p) => {
        allMarkers.push({
          time: toChartTime(p.date, interval),
          position: p.position as 'aboveBar' | 'belowBar',
          shape: p.position === 'belowBar' ? 'arrowUp' : 'arrowDown',
          color: p.color,
          text: p.label,
        })
      })
    }

    // Fractals markers
    if (indicatorData) {
      const fractalsInd = indicatorData.indicators.find((ind) => ind.name === 'FRACTALS')
      if (fractalsInd) {
        fractalsInd.data.fractal_up?.forEach((v, i) => {
          if (v !== null) {
            allMarkers.push({
              time: times[i],
              position: 'aboveBar',
              shape: 'arrowDown',
              color: '#22d3ee',
              text: 'F',
            })
          }
        })
        fractalsInd.data.fractal_down?.forEach((v, i) => {
          if (v !== null) {
            allMarkers.push({
              time: times[i],
              position: 'belowBar',
              shape: 'arrowUp',
              color: '#f59e0b',
              text: 'F',
            })
          }
        })
      }
    }

    // Sort markers by time and attach
    allMarkers.sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0))
    if (allMarkers.length > 0) {
      markersPluginRef.current = createSeriesMarkers(seriesRef, allMarkers)
    }

    // Feature 4: preserve scale
    if (isFirstLoadRef.current) {
      chart.timeScale().fitContent()
      isFirstLoadRef.current = false
    } else if (savedRangeRef.current) {
      chart.timeScale().setVisibleLogicalRange(savedRangeRef.current)
    } else {
      chart.timeScale().fitContent()
    }

    // Feature 9: sync visible range to oscillators — logical ranges now aligned
    // thanks to spacer series in each OscillatorChart
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (isSyncingRef.current || !range) return
      isSyncingRef.current = true
      oscChartsRef.current.forEach((oscChart) => {
        try { oscChart.timeScale().setVisibleLogicalRange(range) } catch { /* chart may be disposed */ }
      })
      requestAnimationFrame(() => { isSyncingRef.current = false })
    })

    } catch (err) {
      console.error('[Charts] Error creating chart:', err)
      return
    }

    const chartLocal = chart
    return () => {
      try {
        // Feature 4: save range before cleanup
        savedRangeRef.current = chartLocal.timeScale().getVisibleLogicalRange()
        if (markersPluginRef.current) {
          markersPluginRef.current.detach()
          markersPluginRef.current = null
        }
        previewRef.current.clear()
        drawingManagerRef.current.detach()
        chartLocal.remove()
      } catch (cleanupErr) {
        console.error('[Charts] Cleanup error:', cleanupErr)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, indicatorData, interval, activePatterns, logScale, getIndicatorDef, getIndicatorColor])

  // Feature 5: toggle log scale imperatively
  const toggleLogScale = () => {
    const next = !logScale
    setLogScale(next)
    chartInstanceRef.current?.priceScale('right').applyOptions({
      mode: next ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    })
  }

  // Feature 3: scroll to today
  const scrollToToday = () => {
    chartInstanceRef.current?.timeScale().scrollToRealTime()
  }

  // Oscillator indicators (Feature 10: separate charts)
  const oscillatorIndicators = indicatorData?.indicators.filter((ind) => {
    const def = getIndicatorDef(ind.name)
    return def && !def.overlay
  }) ?? []

  const oscTimes = history?.data.map((d) => toChartTime(d.date, interval)) ?? []

  // Handle synced range from oscillators — logical ranges now aligned via spacer series
  const handleOscRangeChange = useCallback((range: LogicalRange | null, sourceChartId: string) => {
    if (isSyncingRef.current || !range) return
    isSyncingRef.current = true
    try { chartInstanceRef.current?.timeScale().setVisibleLogicalRange(range) } catch { /* */ }
    oscChartsRef.current.forEach((oscChart, id) => {
      if (id !== sourceChartId) {
        try { oscChart.timeScale().setVisibleLogicalRange(range) } catch { /* */ }
      }
    })
    requestAnimationFrame(() => { isSyncingRef.current = false })
  }, [])

  // Register/unregister oscillator chart instances for direct sync
  const registerOscChart = useCallback((chartId: string, chart: IChartApi) => {
    oscChartsRef.current.set(chartId, chart)
    // Apply current main chart logical range immediately
    if (chartInstanceRef.current) {
      const mainRange = chartInstanceRef.current.timeScale().getVisibleLogicalRange()
      if (mainRange) {
        try { chart.timeScale().setVisibleLogicalRange(mainRange) } catch { /* */ }
      }
    }
  }, [])

  const unregisterOscChart = useCallback((chartId: string) => {
    oscChartsRef.current.delete(chartId)
  }, [])

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

  // Feature 11: toggle a single pattern type
  const togglePattern = (type: PatternType) => {
    setActivePatterns((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  // Feature 11: toggle all patterns
  const toggleAllPatterns = () => {
    if (activePatterns.size === PATTERN_CATALOG.length) {
      setActivePatterns(new Set())
    } else {
      setActivePatterns(new Set(PATTERN_CATALOG.map((p) => p.type)))
    }
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

          {/* Feature 1: Recent tickers with remove buttons */}
          {recentTickers.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {recentTickers.map((t) => (
                <span
                  key={t}
                  className={`inline-flex items-center gap-0.5 rounded text-xs transition-colors ${
                    t === ticker ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  <button
                    onClick={() => setTicker(t)}
                    className="pl-2 py-0.5"
                  >
                    {t}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setRecentTickers(removeRecentTicker(t)) }}
                    className="pr-1.5 py-0.5 opacity-50 hover:opacity-100 hover:text-red-400"
                    title={`Quitar ${t}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {quote && (
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{quote.symbol}</h2>
                {/* Feature 12: Yahoo Finance link */}
                <a
                  href={`https://finance.yahoo.com/quote/${quote.symbol}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ver en Yahoo Finance"
                  className="text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
              <p className="text-sm text-slate-400">{quote.name}</p>
              {/* Feature 12: exchange + market state */}
              <p className="text-xs text-slate-500">{quote.exchange} · {quote.market_state}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold">{quote.price.toFixed(2)} {quote.currency}</p>
              <p className={`text-sm ${quote.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.change_percent.toFixed(2)}%)
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Period + Interval selectors + Feature 3: Hoy + Feature 5: LOG */}
      <div className="flex flex-wrap gap-2 items-center">
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
        <span className="text-slate-600 mx-1">|</span>
        {/* Feature 3: Hoy button */}
        <button
          onClick={scrollToToday}
          className="px-3 py-1 rounded text-sm bg-slate-800 text-slate-300 hover:bg-slate-700"
          title="Scroll al día actual"
        >
          Hoy
        </button>
        {/* Feature 5: LOG toggle */}
        <button
          onClick={toggleLogScale}
          className={`px-3 py-1 rounded text-sm font-mono ${
            logScale ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
          title="Escala logarítmica"
        >
          LOG
        </button>
      </div>

      {/* Feature 11: Pattern selector */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPatternSelector((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
              activePatterns.size > 0 ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <CandlestickChart size={14} />
            Patrones de velas
            {activePatterns.size > 0 && <span className="text-xs opacity-80">({activePatterns.size})</span>}
            {showPatternSelector ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {activePatterns.size > 0 && !showPatternSelector && (
            <span className="text-xs text-slate-400">
              {PATTERN_CATALOG.filter((p) => activePatterns.has(p.type)).map((p) => p.label.split(' — ')[0]).join(' · ')}
            </span>
          )}
        </div>
        {showPatternSelector && (
          <div className="bg-slate-900 rounded-lg border border-slate-700 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Selecciona patrones a mostrar</span>
              <button
                onClick={toggleAllPatterns}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                {activePatterns.size === PATTERN_CATALOG.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {PATTERN_CATALOG.map((p) => (
                <label key={p.type} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activePatterns.has(p.type)}
                    onChange={() => togglePattern(p.type)}
                    className="accent-emerald-500"
                  />
                  <div>
                    <span className="text-sm text-slate-200">{p.label}</span>
                    <p className="text-[10px] text-slate-500 leading-tight">{p.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main chart with toolbar */}
      <div className="flex gap-2">
        <DrawingToolbar />
        <div className="flex-1 relative">
          <div
            ref={chartRef}
            onClick={() => setActiveChartId('main')}
            className={`bg-slate-900 rounded-lg border transition-colors ${
              activeChartId === 'main' ? 'border-emerald-500' : 'border-slate-700'
            } ${activeTool && activeChartId === 'main' ? 'cursor-crosshair' : ''}`}
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

      {/* Feature 10: Separate oscillator charts */}
      {oscillatorIndicators.map((ind) => {
        const aiIdx = activeIndicators.findIndex((a) => a.name === ind.name)
        const oscColor = getIndicatorColor(ind.name, aiIdx >= 0 ? aiIdx : 0)
        const oscChartId = `osc-${ind.name}`
        return (
          <OscillatorChart
            key={ind.name}
            indicator={ind}
            times={oscTimes}
            color={oscColor}
            interval={interval}
            syncingRef={isSyncingRef}
            onRegister={registerOscChart}
            onUnregister={unregisterOscChart}
            onVisibleRangeChange={handleOscRangeChange}
            chartId={oscChartId}
            isActive={activeChartId === oscChartId}
            onActivate={() => setActiveChartId(oscChartId)}
          />
        )
      })}

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

      {/* Indicators catalog — Feature 6: filter out VWAP */}
      {catalog && (
        <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
          <h3 className="font-semibold mb-3">Indicadores ({activeIndicators.length}/5)</h3>
          <div className="space-y-3">
            {categories.map((cat) => (
              <div key={cat}>
                <p className="text-xs font-medium text-slate-400 uppercase mb-1">{cat}</p>
                <div className="flex flex-wrap gap-2">
                  {catalog.indicators.filter((i) => i.category === cat && i.name !== 'VWAP').map((ind) => {
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
