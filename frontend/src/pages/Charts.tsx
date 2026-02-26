import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts'
import { market, indicators } from '../api'
import type { IndicatorDefinition, IndicatorRequest } from '../types'
import { Search } from 'lucide-react'

const PERIODS = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '5y', 'max']
const INTERVALS = ['1m', '5m', '15m', '1h', '1d', '1wk', '1mo']

export default function Charts() {
  const [ticker, setTicker] = useState('AAPL')
  const [searchQuery, setSearchQuery] = useState('')
  const [period, setPeriod] = useState('3mo')
  const [interval, setInterval] = useState('1d')
  const [activeIndicators, setActiveIndicators] = useState<IndicatorRequest[]>([])
  const chartRef = useRef<HTMLDivElement>(null)

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
      upColor: '#10b981',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#10b981',
      wickDownColor: '#ef4444',
      wickUpColor: '#10b981',
    })

    candleSeries.setData(
      history.data.map((d) => ({
        time: d.date.split('T')[0],
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
    )

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    volumeSeries.setData(
      history.data.map((d) => ({
        time: d.date.split('T')[0],
        value: d.volume,
        color: d.close >= d.open ? '#10b98140' : '#ef444440',
      }))
    )

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [history])

  const toggleIndicator = (ind: IndicatorDefinition) => {
    setActiveIndicators((prev) => {
      const exists = prev.find((i) => i.name === ind.name)
      if (exists) return prev.filter((i) => i.name !== ind.name)
      if (prev.length >= 5) return prev
      const params: Record<string, number> = {}
      ind.params.forEach((p) => { params[p.name] = p.default })
      return [...prev, { name: ind.name, params }]
    })
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

      {/* Chart */}
      <div ref={chartRef} className="bg-slate-900 rounded-lg border border-slate-700" />

      {/* Indicator data display */}
      {indicatorData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {indicatorData.indicators.map((ind) => (
            <div key={ind.name} className="bg-slate-900 rounded-lg p-4 border border-slate-700">
              <h4 className="font-medium text-emerald-400 mb-1">{ind.name}</h4>
              <p className="text-sm text-slate-400">
                Último valor: {Object.entries(ind.data).map(([key, vals]) => {
                  const last = [...vals].reverse().find((v) => v !== null)
                  return `${key}: ${last?.toFixed(2) ?? 'N/A'}`
                }).join(' | ')}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Indicators panel */}
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
