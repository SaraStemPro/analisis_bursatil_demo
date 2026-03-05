import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { market, demo } from '../api'
import type { ScreenerFilters, DetailedQuote } from '../types'
import {
  Search, Filter, TrendingUp, TrendingDown, ArrowUpDown, PieChart,
  ShoppingCart, Eye, ChevronDown, ChevronUp, X, Plus, Trash2,
} from 'lucide-react'

type SortKey = 'symbol' | 'price' | 'change_percent' | 'market_cap' | 'pe_ratio' | 'dividend_yield' | 'beta' | 'roe'

type Universe = ScreenerFilters['universe']

const UNIVERSE_OPTIONS: { key: Universe; label: string }[] = [
  { key: 'sp500', label: 'S&P 500' },
  { key: 'ibex35', label: 'IBEX 35' },
  { key: 'tech', label: 'Tecnología' },
  { key: 'healthcare', label: 'Salud' },
  { key: 'finance', label: 'Finanzas' },
  { key: 'energy', label: 'Energía' },
  { key: 'industrials', label: 'Industria' },
  { key: 'consumer', label: 'Consumo' },
  { key: 'all', label: 'Todos' },
]

function formatMarketCap(val: number | null): string {
  if (!val) return '-'
  if (val >= 1e12) return `${(val / 1e12).toFixed(1)}T`
  if (val >= 1e9) return `${(val / 1e9).toFixed(1)}B`
  if (val >= 1e6) return `${(val / 1e6).toFixed(0)}M`
  return val.toLocaleString()
}

function formatPct(val: number | null | undefined): string {
  if (val == null) return '-'
  return `${(val * 100).toFixed(2)}%`
}

const MARKET_CAP_OPTIONS = [
  { label: 'Todos', min: undefined, max: undefined },
  { label: 'Mega (>200B)', min: 200, max: undefined },
  { label: 'Large (10-200B)', min: 10, max: 200 },
  { label: 'Mid (2-10B)', min: 2, max: 10 },
  { label: 'Small (<2B)', min: undefined, max: 2 },
]

const SECTOR_COLORS: Record<string, string> = {
  'Technology': '#3b82f6',
  'Healthcare': '#10b981',
  'Financial Services': '#f59e0b',
  'Consumer Cyclical': '#8b5cf6',
  'Communication Services': '#ec4899',
  'Industrials': '#06b6d4',
  'Consumer Defensive': '#84cc16',
  'Energy': '#f97316',
  'Utilities': '#14b8a6',
  'Real Estate': '#6366f1',
  'Basic Materials': '#eab308',
}

export default function Screener() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  // Filter state
  const [universe, setUniverse] = useState<Universe>('sp500')
  const [selectedSectors, setSelectedSectors] = useState<string[]>([])
  const [capIndex, setCapIndex] = useState(0)
  const [peMin, setPeMin] = useState('')
  const [peMax, setPeMax] = useState('')
  const [divMin, setDivMin] = useState('')
  const [divMax, setDivMax] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [changeMin, setChangeMin] = useState('')
  const [changeMax, setChangeMax] = useState('')
  const [betaMin, setBetaMin] = useState('')
  const [betaMax, setBetaMax] = useState('')
  const [showFilters, setShowFilters] = useState(true)

  // Table state
  const [sortKey, setSortKey] = useState<SortKey>('market_cap')
  const [sortAsc, setSortAsc] = useState(false)
  const [searchText, setSearchText] = useState('')

  // Portfolio simulator
  const [portfolio, setPortfolio] = useState<Map<string, DetailedQuote>>(new Map())
  const [showSimulator, setShowSimulator] = useState(false)

  // Build filters object
  const filters: ScreenerFilters = useMemo(() => {
    const cap = MARKET_CAP_OPTIONS[capIndex]
    return {
      universe,
      sectors: selectedSectors.length > 0 ? selectedSectors : undefined,
      market_cap_min: cap.min,
      market_cap_max: cap.max,
      pe_min: peMin ? Number(peMin) : undefined,
      pe_max: peMax ? Number(peMax) : undefined,
      dividend_min: divMin ? Number(divMin) : undefined,
      dividend_max: divMax ? Number(divMax) : undefined,
      price_min: priceMin ? Number(priceMin) : undefined,
      price_max: priceMax ? Number(priceMax) : undefined,
      change_min: changeMin ? Number(changeMin) : undefined,
      change_max: changeMax ? Number(changeMax) : undefined,
      beta_min: betaMin ? Number(betaMin) : undefined,
      beta_max: betaMax ? Number(betaMax) : undefined,
    }
  }, [universe, selectedSectors, capIndex, peMin, peMax, divMin, divMax, priceMin, priceMax, changeMin, changeMax, betaMin, betaMax])

  const { data: result, isLoading } = useQuery({
    queryKey: ['screener', filters],
    queryFn: () => market.screener(filters),
    staleTime: 5 * 60 * 1000,
  })

  const { data: sectorsData } = useQuery({
    queryKey: ['screenerSectors', universe],
    queryFn: () => market.screenerSectors(universe),
    staleTime: 30 * 60 * 1000,
  })

  const buyMut = useMutation({
    mutationFn: (data: { ticker: string; type: string; quantity: number }) => demo.createOrder(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  // Sort and filter stocks
  const stocks = useMemo(() => {
    let list = result?.stocks || []
    if (searchText) {
      const q = searchText.toLowerCase()
      list = list.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? 0
      const bv = b[sortKey] ?? 0
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [result, searchText, sortKey, sortAsc])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const toggleSector = (s: string) => {
    setSelectedSectors((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
  }

  const addToPortfolio = (stock: DetailedQuote) => {
    setPortfolio((prev) => { const m = new Map(prev); m.set(stock.symbol, stock); return m })
    setShowSimulator(true)
  }

  const removeFromPortfolio = (symbol: string) => {
    setPortfolio((prev) => { const m = new Map(prev); m.delete(symbol); return m })
  }

  // Portfolio simulator calculations
  const portfolioStocks = Array.from(portfolio.values())
  const sectorAlloc = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {}
    portfolioStocks.forEach((s) => {
      const sec = s.sector || 'Otros'
      if (!map[sec]) map[sec] = { count: 0, value: 0 }
      map[sec].count++
      map[sec].value += s.price
    })
    const total = Object.values(map).reduce((a, b) => a + b.value, 0)
    return Object.entries(map)
      .map(([sector, { count, value }]) => ({
        sector,
        count,
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.pct - a.pct)
  }, [portfolioStocks])

  const diversityScore = useMemo(() => {
    if (sectorAlloc.length <= 1) return 0
    const weights = sectorAlloc.map((s) => s.pct / 100)
    const entropy = -weights.reduce((a, w) => a + (w > 0 ? w * Math.log(w) : 0), 0)
    const maxEntropy = Math.log(sectorAlloc.length)
    return maxEntropy > 0 ? Math.round((entropy / maxEntropy) * 100) : 0
  }, [sectorAlloc])

  const diversityLabel = diversityScore >= 60 ? 'Diversificado' : diversityScore >= 30 ? 'Moderado' : 'Concentrado'
  const diversityColor = diversityScore >= 60 ? 'text-emerald-400' : diversityScore >= 30 ? 'text-amber-400' : 'text-red-400'
  const diversityBarColor = diversityScore >= 60 ? 'bg-emerald-500' : diversityScore >= 30 ? 'bg-amber-500' : 'bg-red-500'

  const SortHeader = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th
      className={`px-3 pb-2 pt-2 cursor-pointer hover:text-white select-none whitespace-nowrap ${right ? 'text-right' : ''}`}
      onClick={() => handleSort(k)}
    >
      <span className={`inline-flex items-center gap-1 ${right ? 'justify-end' : ''}`}>
        {label} {sortKey === k && <ArrowUpDown size={12} />}
      </span>
    </th>
  )

  const buyAllFromSimulator = () => {
    portfolioStocks.forEach((s) => {
      buyMut.mutate({ ticker: s.symbol, type: 'buy', quantity: 1 })
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search size={24} className="text-emerald-400" />
            Stock Screener
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Busca, filtra y selecciona acciones para construir tu portfolio ideal
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSimulator(!showSimulator)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              showSimulator ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <PieChart size={16} />
            Simulador ({portfolio.size})
          </button>
        </div>
      </div>

      {/* Universe selector */}
      <div className="flex flex-wrap gap-2">
        {UNIVERSE_OPTIONS.map((u) => (
          <button
            key={u.key}
            onClick={() => setUniverse(u.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              universe === u.key ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {u.label}
          </button>
        ))}
        {result && (
          <span className="flex items-center text-sm text-slate-500 ml-2">
            {result.filtered} de {result.total} acciones
          </span>
        )}
      </div>

      <div className="flex gap-4">
        {/* Filters panel */}
        <div className={`${showFilters ? 'w-64' : 'w-auto'} flex-shrink-0`}>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-2"
          >
            <Filter size={14} />
            Filtros
            {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showFilters && (
            <div className="space-y-4 bg-slate-900 rounded-lg p-4 border border-slate-700">
              {/* Sectors */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 uppercase mb-2">Sector</h3>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {(sectorsData?.sectors || []).map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-800 px-1 rounded">
                      <input
                        type="checkbox"
                        checked={selectedSectors.includes(s)}
                        onChange={() => toggleSector(s)}
                        className="accent-emerald-500"
                      />
                      <span className="text-slate-300">{s}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Market Cap */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 uppercase mb-2">Market Cap</h3>
                <select
                  value={capIndex}
                  onChange={(e) => setCapIndex(Number(e.target.value))}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white"
                >
                  {MARKET_CAP_OPTIONS.map((o, i) => (
                    <option key={i} value={i}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* P/E Ratio */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 uppercase mb-2">P/E Ratio</h3>
                <div className="flex gap-1">
                  <input placeholder="Min" value={peMin} onChange={(e) => setPeMin(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" />
                  <input placeholder="Max" value={peMax} onChange={(e) => setPeMax(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" />
                </div>
              </div>

              {/* Dividend Yield */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 uppercase mb-2">Dividendo %</h3>
                <div className="flex gap-1">
                  <input placeholder="Min" value={divMin} onChange={(e) => setDivMin(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="0.1" />
                  <input placeholder="Max" value={divMax} onChange={(e) => setDivMax(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="0.1" />
                </div>
              </div>

              {/* Price range */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 uppercase mb-2">Precio ($)</h3>
                <div className="flex gap-1">
                  <input placeholder="Min" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" />
                  <input placeholder="Max" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" />
                </div>
              </div>

              {/* Change % */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 uppercase mb-2">Cambio %</h3>
                <div className="flex gap-1">
                  <input placeholder="Min" value={changeMin} onChange={(e) => setChangeMin(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="0.5" />
                  <input placeholder="Max" value={changeMax} onChange={(e) => setChangeMax(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="0.5" />
                </div>
              </div>

              {/* Beta */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 uppercase mb-2">Beta</h3>
                <div className="flex gap-1">
                  <input placeholder="Min" value={betaMin} onChange={(e) => setBetaMin(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="0.1" />
                  <input placeholder="Max" value={betaMax} onChange={(e) => setBetaMax(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="0.1" />
                </div>
              </div>

              {/* Reset */}
              <button
                onClick={() => {
                  setSelectedSectors([]); setCapIndex(0); setPeMin(''); setPeMax('')
                  setDivMin(''); setDivMax(''); setPriceMin(''); setPriceMax('')
                  setChangeMin(''); setChangeMax(''); setBetaMin(''); setBetaMax('')
                }}
                className="w-full text-center text-xs text-slate-500 hover:text-white py-1"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>

        {/* Main content area */}
        <div className="flex-1 min-w-0">
          {/* Portfolio simulator panel */}
          {showSimulator && portfolioStocks.length > 0 && (
            <div className="bg-slate-900 rounded-lg p-5 border border-emerald-700/50 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <PieChart size={18} className="text-emerald-400" />
                  Simulador de portfolio
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={buyAllFromSimulator}
                    disabled={buyMut.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded text-white text-sm font-medium"
                  >
                    <ShoppingCart size={14} /> Comprar todo (1 ud. cada)
                  </button>
                  <button onClick={() => setPortfolio(new Map())} className="text-slate-400 hover:text-red-400 text-sm">
                    Limpiar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Selected stocks */}
                <div>
                  <h3 className="text-xs font-medium text-slate-400 uppercase mb-2">Acciones seleccionadas ({portfolioStocks.length})</h3>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {portfolioStocks.map((s) => (
                      <div key={s.symbol} className="flex items-center justify-between bg-slate-800 rounded px-2 py-1 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{s.symbol}</span>
                          <span className="text-slate-400 text-xs truncate max-w-[100px]">{s.sector || 'Otros'}</span>
                        </div>
                        <button onClick={() => removeFromPortfolio(s.symbol)} className="text-slate-500 hover:text-red-400">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sector pie chart (bar representation) + diversity */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xs font-medium text-slate-400 uppercase">Distribucion sectorial</h3>
                    <span className={`text-sm font-medium ${diversityColor}`}>
                      {diversityLabel} ({diversityScore}%)
                    </span>
                  </div>

                  {/* Diversity bar */}
                  <div className="h-3 bg-slate-700 rounded-full overflow-hidden mb-3">
                    <div
                      className={`h-full rounded-full transition-all ${diversityBarColor}`}
                      style={{ width: `${diversityScore}%` }}
                    />
                  </div>

                  {/* Stacked sector bar */}
                  <div className="h-6 bg-slate-700 rounded-full overflow-hidden flex mb-2">
                    {sectorAlloc.map((s) => (
                      <div
                        key={s.sector}
                        style={{ width: `${s.pct}%`, backgroundColor: SECTOR_COLORS[s.sector] || '#64748b' }}
                        className="h-full transition-all"
                        title={`${s.sector}: ${s.pct.toFixed(1)}%`}
                      />
                    ))}
                  </div>

                  {/* Legend */}
                  <div className="space-y-1">
                    {sectorAlloc.map((s) => (
                      <div key={s.sector} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SECTOR_COLORS[s.sector] || '#64748b' }} />
                        <span className="text-slate-300 flex-1">{s.sector}</span>
                        <span className="text-slate-400">{s.count} ({s.pct.toFixed(0)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Search bar */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center bg-slate-800 border border-slate-600 rounded px-2 flex-1 max-w-xs">
              <Search size={14} className="text-slate-400" />
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Buscar por nombre o ticker..."
                className="px-2 py-1.5 bg-transparent text-white text-sm focus:outline-none w-full"
              />
              {searchText && (
                <button onClick={() => setSearchText('')} className="text-slate-400 hover:text-white">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Results table */}
          {isLoading ? (
            <div className="bg-slate-900 rounded-lg p-8 border border-slate-700 text-center">
              <p className="text-slate-400">Cargando datos del screener...</p>
              <p className="text-slate-500 text-xs mt-1">La primera carga puede tardar unos segundos</p>
            </div>
          ) : (
            <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-left border-b border-slate-700 bg-slate-900/80">
                      <th className="px-3 py-2 w-8"></th>
                      <SortHeader k="symbol" label="Ticker" />
                      <th className="px-3 pb-2 pt-2">Nombre</th>
                      <SortHeader k="price" label="Precio" right />
                      <SortHeader k="change_percent" label="Cambio" right />
                      <SortHeader k="market_cap" label="Market Cap" right />
                      <th className="px-3 pb-2 pt-2 min-w-[120px]">Sector</th>
                      <SortHeader k="pe_ratio" label="P/E" right />
                      <SortHeader k="dividend_yield" label="Div%" right />
                      <SortHeader k="beta" label="Beta" right />
                      <SortHeader k="roe" label="ROE" right />
                      <th className="px-3 pb-2 pt-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stocks.map((s) => (
                      <tr key={s.symbol} className="border-b border-slate-800 hover:bg-slate-800/50">
                        <td className="px-3 py-2">
                          {portfolio.has(s.symbol) ? (
                            <button onClick={() => removeFromPortfolio(s.symbol)} className="text-emerald-400 hover:text-red-400">
                              <X size={14} />
                            </button>
                          ) : (
                            <button onClick={() => addToPortfolio(s)} className="text-slate-500 hover:text-emerald-400">
                              <Plus size={14} />
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => navigate(`/charts?ticker=${s.symbol}`)} className="font-medium text-white hover:text-emerald-400">
                            {s.symbol}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-slate-300 max-w-[140px] truncate">{s.name}</td>
                        <td className="px-3 py-2 text-right text-white">{s.price.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`inline-flex items-center gap-0.5 ${s.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {s.change_percent >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {s.change_percent >= 0 ? '+' : ''}{s.change_percent.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-300">{formatMarketCap(s.market_cap)}</td>
                        <td className="px-3 py-2 text-slate-400 min-w-[120px] text-xs">{s.sector || '-'}</td>
                        <td className="px-3 py-2 text-right text-slate-300">{s.pe_ratio ? s.pe_ratio.toFixed(1) : '-'}</td>
                        <td className="px-3 py-2 text-right text-slate-300">{formatPct(s.dividend_yield)}</td>
                        <td className="px-3 py-2 text-right text-slate-300">{s.beta ? s.beta.toFixed(2) : '-'}</td>
                        <td className="px-3 py-2 text-right text-slate-300">{formatPct(s.roe)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => navigate(`/charts?ticker=${s.symbol}`)}
                              className="p-1 text-slate-500 hover:text-white" title="Ver grafico"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={() => navigate(`/demo?buy=${s.symbol}`)}
                              className="p-1 text-slate-500 hover:text-emerald-400" title="Comprar"
                            >
                              <ShoppingCart size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {stocks.length === 0 && !isLoading && (
                <p className="text-slate-500 text-sm text-center py-8">No se encontraron acciones con los filtros seleccionados</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
