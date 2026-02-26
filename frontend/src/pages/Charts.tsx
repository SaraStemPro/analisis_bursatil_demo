import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts'
import { market, indicators } from '../api'
import type { IndicatorDefinition, IndicatorRequest } from '../types'
import { Search, Settings2, X } from 'lucide-react'

const PERIODS = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '5y', 'max']
const INTERVALS = ['1m', '5m', '15m', '1h', '1d', '1wk', '1mo']

const INDICATOR_COLORS = [
  '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#a78bfa', '#fb7185', '#22d3ee', '#a3e635',
]

export default function Charts() {
  const [ticker, setTicker] = useState('AAPL')
  const [searchQuery, setSearchQuery] = useState('')
  const [period, setPeriod] = useState('3mo')
  const [interval, setInterval] = useState('1d')
  const [activeIndicators, setActiveIndicators] = useState<IndicatorRequest[]>([])
  const [editingIndicator, setEditingIndicator] = useState<string | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const oscChartRef = useRef<HTMLDivElement>(null)

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

  // Main chart with candles + overlay indicators
  useEffect(() => {
    if (!chartRef.current || !history?.data.length) return

    const chart = createChart(chartRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#0f172a' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      width: chartRef.current.clientWidth,
      height: 450,
      timeScale: { borderColor: '#334155' },
      rightPriceScale: { borderColor: '#334155' },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444',
      borderDownColor: '#ef4444', borderUpColor: '#10b981',
      wickDownColor: '#ef4444', wickUpColor: '#10b981',
    })

    const dates = history.data.map((d) => d.date.split('T')[0])

    candleSeries.setData(
      history.data.map((d) => ({
        time: d.date.split('T')[0],
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
        time: d.date.split('T')[0],
        value: d.volume,
        color: d.close >= d.open ? '#10b98140' : '#ef444440',
      }))
    )

    // Draw overlay indicators on the main chart
    if (indicatorData) {
      let colorIdx = 0
      indicatorData.indicators.forEach((ind) => {
        const def = getIndicatorDef(ind.name)
        if (!def?.overlay) return

        Object.entries(ind.data).forEach(([seriesKey, values]) => {
          const color = INDICATOR_COLORS[colorIdx % INDICATOR_COLORS.length]
          colorIdx++
          const lineSeries = chart.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            title: `${ind.name} ${seriesKey}`,
            priceScaleId: 'right',
          })
          const lineData = values
            .map((v, i) => (v !== null ? { time: dates[i], value: v } : null))
            .filter(Boolean) as { time: string; value: number }[]
          lineSeries.setData(lineData)
        })
      })
    }

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('resize', handleResize); chart.remove() }
  }, [history, indicatorData, getIndicatorDef])

  // Oscillator chart (RSI, MACD, STOCH, ATR, OBV)
  const oscillatorIndicators = indicatorData?.indicators.filter((ind) => {
    const def = getIndicatorDef(ind.name)
    return def && !def.overlay
  }) ?? []

  useEffect(() => {
    if (!oscChartRef.current || !history?.data.length || oscillatorIndicators.length === 0) return

    const chart = createChart(oscChartRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#0f172a' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      width: oscChartRef.current.clientWidth,
      height: 200,
      timeScale: { borderColor: '#334155' },
      rightPriceScale: { borderColor: '#334155' },
    })

    const dates = history.data.map((d) => d.date.split('T')[0])
    let colorIdx = 0

    oscillatorIndicators.forEach((ind) => {
      Object.entries(ind.data).forEach(([seriesKey, values]) => {
        const color = INDICATOR_COLORS[colorIdx % INDICATOR_COLORS.length]
        colorIdx++

        if (ind.name === 'MACD' && seriesKey === 'histogram') {
          const histSeries = chart.addSeries(HistogramSeries, {
            color,
            title: `${ind.name} ${seriesKey}`,
          })
          const histData = values
            .map((v, i) => (v !== null ? { time: dates[i], value: v, color: v >= 0 ? '#10b981' : '#ef4444' } : null))
            .filter(Boolean) as { time: string; value: number; color: string }[]
          histSeries.setData(histData)
        } else {
          const lineSeries = chart.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            title: `${ind.name} ${seriesKey}`,
          })
          const lineData = values
            .map((v, i) => (v !== null ? { time: dates[i], value: v } : null))
            .filter(Boolean) as { time: string; value: number }[]
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
      </div>

      {/* Period + Interval selectors */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1 rounded text-sm ${period === p ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            {p.toUpperCase()}
          </button>
        ))}
        <span className="text-slate-600 mx-1">|</span>
        {INTERVALS.map((i) => (
          <button
            key={i}
            onClick={() => setInterval(i)}
            className={`px-3 py-1 rounded text-sm ${interval === i ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            {i}
          </button>
        ))}
      </div>

      {/* Main chart */}
      <div ref={chartRef} className="bg-slate-900 rounded-lg border border-slate-700" />

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
            const color = INDICATOR_COLORS[idx % INDICATOR_COLORS.length]
            const isEditing = editingIndicator === ind.name

            return (
              <div key={ind.name} className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
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
