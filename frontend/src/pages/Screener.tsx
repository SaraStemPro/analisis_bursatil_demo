import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { market, demo } from '../api'
import type { ScreenerFilters, DetailedQuote } from '../types'
import {
  Search, Filter, TrendingUp, TrendingDown, ArrowUpDown, PieChart,
  ShoppingCart, Eye, ChevronDown, ChevronUp, X, Plus, Trash2, Info,
} from 'lucide-react'
import { isCfd, totalCost, cfdLabel, SPREAD_PCT } from '../lib/cfdUtils'
import { CorrelationPanel } from '../components/screener/CorrelationPanel'

type SortKey = 'symbol' | 'price' | 'change_percent' | 'market_cap' | 'pe_ratio' | 'dividend_yield' | 'beta' | 'roe' | 'volatility'

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
  { key: 'indices', label: 'Índices' },
  { key: 'currencies', label: 'Divisas' },
  { key: 'commodities', label: 'Materias Primas' },
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

function formatPrice(val: number): string {
  if (val < 10) return val.toFixed(5)
  if (val < 100) return val.toFixed(4)
  return val.toFixed(2)
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

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-block ml-1">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        className="text-slate-500 hover:text-slate-300 transition-colors"
        type="button"
      >
        <Info size={12} />
      </button>
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-700 text-slate-200 text-xs rounded-lg shadow-lg w-56 leading-relaxed pointer-events-none">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-700" />
        </span>
      )}
    </span>
  )
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
  const [volMin, setVolMin] = useState('')
  const [volMax, setVolMax] = useState('')
  const [roeMin, setRoeMin] = useState('')
  const [roeMax, setRoeMax] = useState('')
  const [showFilters, setShowFilters] = useState(true)

  // Table state
  const [sortKey, setSortKey] = useState<SortKey>('market_cap')
  const [sortAsc, setSortAsc] = useState(false)
  const [searchText, setSearchText] = useState('')

  // Portfolio simulator
  const [portfolio, setPortfolio] = useState<Map<string, { stock: DetailedQuote; qty: number }>>(new Map())
  const [showSimulator, setShowSimulator] = useState(false)
  const [carteraName, setCarteraName] = useState('')
  const [carteraNotes, setCarteraNotes] = useState('')
  const [carteraError, setCarteraError] = useState('')

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
      volatility_min: volMin ? Number(volMin) / 100 : undefined,
      volatility_max: volMax ? Number(volMax) / 100 : undefined,
      roe_min: roeMin ? Number(roeMin) / 100 : undefined,
      roe_max: roeMax ? Number(roeMax) / 100 : undefined,
    }
  }, [universe, selectedSectors, capIndex, peMin, peMax, divMin, divMax, priceMin, priceMax, changeMin, changeMax, betaMin, betaMax, volMin, volMax, roeMin, roeMax])

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
    mutationFn: (data: { ticker: string; type: string; quantity: number; portfolio_group?: string; price?: number; notes: string }) => demo.createOrder(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['carteras'] })
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
    setPortfolio((prev) => { const m = new Map(prev); m.set(stock.symbol, { stock, qty: 1 }); return m })
    setShowSimulator(true)
  }

  const removeFromPortfolio = (symbol: string) => {
    setPortfolio((prev) => { const m = new Map(prev); m.delete(symbol); return m })
  }

  const setQty = (symbol: string, qty: number) => {
    setPortfolio((prev) => {
      const m = new Map(prev)
      const entry = m.get(symbol)
      if (entry) m.set(symbol, { ...entry, qty: Math.max(1, qty) })
      return m
    })
  }

  // Portfolio simulator calculations
  const portfolioEntries = Array.from(portfolio.values())
  const sectorAlloc = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {}
    portfolioEntries.forEach(({ stock: s, qty }) => {
      const sec = s.sector || 'Otros'
      if (!map[sec]) map[sec] = { count: 0, value: 0 }
      map[sec].count += qty
      map[sec].value += totalCost(s.symbol, s.price, qty)
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
  }, [portfolioEntries])

  const totalPortfolioValue = useMemo(() =>
    portfolioEntries.reduce((a, { stock, qty }) => a + totalCost(stock.symbol, stock.price, qty), 0),
    [portfolioEntries])

  // Diversity score: Shannon entropy penalized by minimum positions/sectors
  const diversityScore = useMemo(() => {
    const nPositions = portfolioEntries.reduce((a, e) => a + e.qty, 0)
    const nSectors = sectorAlloc.length
    if (nSectors <= 1) return 0

    // Shannon entropy normalizada
    const weights = sectorAlloc.map((s) => s.pct / 100)
    const entropy = -weights.reduce((a, w) => a + (w > 0 ? w * Math.log(w) : 0), 0)
    const maxEntropy = Math.log(nSectors)
    const entropyScore = maxEntropy > 0 ? entropy / maxEntropy : 0

    // Penalización: mínimo 5 posiciones y 3 sectores para diversificación real
    const positionPenalty = Math.min(nPositions / 5, 1)
    const sectorPenalty = Math.min(nSectors / 3, 1)

    // Concentración máxima: penalizar si un sector > 40%
    const maxWeight = Math.max(...weights)
    const concentrationPenalty = maxWeight > 0.4 ? 1 - (maxWeight - 0.4) : 1

    return Math.round(entropyScore * positionPenalty * sectorPenalty * concentrationPenalty * 100)
  }, [sectorAlloc, portfolioEntries])

  const diversityLabel = diversityScore >= 70 ? 'Diversificado' : diversityScore >= 40 ? 'Moderado' : 'Concentrado'
  const diversityColor = diversityScore >= 70 ? 'text-emerald-400' : diversityScore >= 40 ? 'text-amber-400' : 'text-red-400'
  const diversityBarColor = diversityScore >= 70 ? 'bg-emerald-500' : diversityScore >= 40 ? 'bg-amber-500' : 'bg-red-500'

  // Hide equity-specific columns for non-equity universes
  const isEquity = !['indices', 'currencies', 'commodities'].includes(universe)

  const SortHeader = ({ k, label, right, tooltip }: { k: SortKey; label: string; right?: boolean; tooltip?: string }) => (
    <th
      className={`px-3 pb-2 pt-2 cursor-pointer hover:text-white select-none whitespace-nowrap ${right ? 'text-right' : ''}`}
      onClick={() => handleSort(k)}
    >
      <span className={`inline-flex items-center gap-1 ${right ? 'justify-end' : ''}`}>
        {label} {sortKey === k && <ArrowUpDown size={12} />}{tooltip && <InfoTooltip text={tooltip} />}
      </span>
    </th>
  )

  const buyAllFromSimulator = async () => {
    if (!carteraNotes.trim()) {
      setCarteraError('El diario de trading es obligatorio. Justifica tu inversión.')
      return
    }
    const groupName = carteraName.trim() || `Cartera ${new Date().toLocaleDateString('es-ES')}`
    // Sequential to avoid race condition on balance
    for (const { stock, qty } of portfolioEntries) {
      await buyMut.mutateAsync({ ticker: stock.symbol, type: 'buy', quantity: qty, price: stock.price, portfolio_group: groupName, notes: carteraNotes.trim() })
    }
    qc.invalidateQueries({ queryKey: ['carteras'] })
    navigate('/demo')
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
            {result.filtered} de {result.total} productos
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
              {/* Price range */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 mb-2 flex items-center">Precio ($)<InfoTooltip text="Precio actual de la acción. El precio por sí solo no indica si una acción es cara o barata — hay que compararlo con sus fundamentales (P/E, P/B, etc.)." /></h3>
                <div className="flex gap-1">
                  <input placeholder="Min" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" />
                  <input placeholder="Max" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" />
                </div>
              </div>

              {/* Change % */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 mb-2 flex items-center">Cambio %<InfoTooltip text="Variación porcentual del precio en la última sesión. Movimientos grandes pueden indicar noticias relevantes o alta volatilidad." /></h3>
                <div className="flex gap-1">
                  <input placeholder="Min" value={changeMin} onChange={(e) => setChangeMin(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="0.5" />
                  <input placeholder="Max" value={changeMax} onChange={(e) => setChangeMax(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="0.5" />
                </div>
              </div>

              {/* Sectors */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 mb-2 flex items-center">Sector<InfoTooltip text="Diversificar por sectores reduce el riesgo de concentración. Sectores como tecnología, energía o salud reaccionan de forma distinta ante cambios de ciclo económico." /></h3>
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
                <h3 className="text-xs font-medium text-slate-400 mb-2 flex items-center">Market Cap<InfoTooltip text="Capitalización bursátil = precio × acciones en circulación. Las empresas grandes (large cap) suelen ser más estables; las pequeñas (small cap) más volátiles pero con mayor potencial de crecimiento." /></h3>
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
                <h3 className="text-xs font-medium text-slate-400 mb-2 flex items-center">P/E Ratio<InfoTooltip text="Price-to-Earnings: cuántas veces el beneficio anual estás pagando por la acción. Un P/E alto puede indicar expectativas de crecimiento; uno bajo puede señalar infravaloración o problemas." /></h3>
                <div className="flex gap-1">
                  <input placeholder="Min" value={peMin} onChange={(e) => setPeMin(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" />
                  <input placeholder="Max" value={peMax} onChange={(e) => setPeMax(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" />
                </div>
              </div>

              {/* Dividend Yield */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 mb-2 flex items-center">Dividendo %<InfoTooltip text="Rentabilidad por dividendo anual respecto al precio actual. Útil para estrategias de generación de rentas. Empresas maduras suelen pagar más dividendo." /></h3>
                <div className="flex gap-1">
                  <input placeholder="Min" value={divMin} onChange={(e) => setDivMin(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="0.1" />
                  <input placeholder="Max" value={divMax} onChange={(e) => setDivMax(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="0.1" />
                </div>
              </div>

              {/* ROE */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 mb-2 flex items-center">ROE %<InfoTooltip text="Return on Equity: beneficio neto / fondos propios. Mide la rentabilidad que genera la empresa sobre el capital de los accionistas. Un ROE alto indica eficiencia en el uso del capital." /></h3>
                <div className="flex gap-1">
                  <input placeholder="Min" value={roeMin} onChange={(e) => setRoeMin(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="1" />
                  <input placeholder="Max" value={roeMax} onChange={(e) => setRoeMax(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="1" />
                </div>
              </div>

              {/* Beta */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 mb-2 flex items-center">Beta<InfoTooltip text="Sensibilidad de la acción respecto al mercado (benchmark). β=1 se mueve igual que el mercado, β>1 amplifica movimientos (más agresiva), β<1 es más defensiva." /></h3>
                <div className="flex gap-1">
                  <input placeholder="Min" value={betaMin} onChange={(e) => setBetaMin(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="0.1" />
                  <input placeholder="Max" value={betaMax} onChange={(e) => setBetaMax(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="0.1" />
                </div>
              </div>

              {/* Volatility */}
              <div>
                <h3 className="text-xs font-medium text-slate-400 mb-2 flex items-center">
                  Volatilidad %
                  <InfoTooltip text="Desviación típica anualizada de los retornos diarios (σ). Mide cuánto oscila el precio. Mayor volatilidad = mayor riesgo pero también mayor potencial de movimiento. Se usa para dimensionar posiciones y controlar el riesgo de cartera." />
                </h3>
                <div className="flex gap-1">
                  <input placeholder="Min" value={volMin} onChange={(e) => setVolMin(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="5" />
                  <input placeholder="Max" value={volMax} onChange={(e) => setVolMax(e.target.value)} className="w-1/2 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white" type="number" step="5" />
                </div>
              </div>

              {/* Reset */}
              <button
                onClick={() => {
                  setSelectedSectors([]); setCapIndex(0); setPeMin(''); setPeMax('')
                  setDivMin(''); setDivMax(''); setPriceMin(''); setPriceMax('')
                  setChangeMin(''); setChangeMax(''); setBetaMin(''); setBetaMax('')
                  setVolMin(''); setVolMax(''); setRoeMin(''); setRoeMax('')
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
          {showSimulator && portfolioEntries.length > 0 && (
            <div className="bg-slate-900 rounded-lg p-5 border border-emerald-700/50 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <PieChart size={18} className="text-emerald-400" />
                  Simulador de cartera
                </h2>
                <div className="flex items-center gap-2">
                  <input
                    value={carteraName}
                    onChange={(e) => setCarteraName(e.target.value)}
                    placeholder="Nombre de la cartera..."
                    className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white w-44"
                  />
                  <button
                    onClick={buyAllFromSimulator}
                    disabled={buyMut.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded text-white text-sm font-medium"
                  >
                    <ShoppingCart size={14} /> Comprar cartera
                  </button>
                  <button onClick={() => setPortfolio(new Map())} className="text-slate-400 hover:text-red-400 text-sm">
                    Limpiar
                  </button>
                </div>
              </div>
              {/* Diario de Trading obligatorio */}
              <div className="mb-3">
                <label className="text-xs text-slate-400">
                  Diario de Trading — ¿por qué eliges esta cartera? <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={carteraNotes}
                  onChange={(e) => { setCarteraNotes(e.target.value); if (carteraError) setCarteraError('') }}
                  maxLength={500}
                  rows={2}
                  placeholder="Ej: Diversificación sectorial, apuesta por tecnología + salud defensiva..."
                  className={`block mt-1 w-full px-3 py-2 bg-slate-800 border rounded text-white text-sm focus:outline-none resize-none placeholder:text-slate-500 ${
                    carteraError ? 'border-red-500' : 'border-slate-600 focus:border-emerald-500'
                  }`}
                />
                {carteraError && <p className="text-red-400 text-xs mt-1">{carteraError}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Selected stocks with quantity */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xs font-medium text-slate-400">Acciones seleccionadas ({portfolioEntries.length})</h3>
                    <span className="text-xs text-slate-500">Inversion total: {totalPortfolioValue.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {portfolioEntries.map(({ stock: s, qty }) => {
                      const cost = totalCost(s.symbol, s.price, qty)
                      const weight = totalPortfolioValue > 0 ? (cost / totalPortfolioValue * 100) : 0
                      const cfd = isCfd(s.symbol)
                      return (
                        <div key={s.symbol} className="flex items-center justify-between bg-slate-800 rounded px-2 py-1.5 text-sm">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="font-medium text-white w-12 flex-shrink-0">{s.symbol}</span>
                            <span className="text-slate-500 text-xs truncate max-w-[70px]">{cfd ? cfdLabel(s.symbol) : (s.sector || 'Otros')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 text-xs w-10 text-right">{weight.toFixed(0)}%</span>
                            <span className="text-slate-300 text-xs w-16 text-right">{cfd ? `${cost.toFixed(0)}€` : `$${formatPrice(s.price)}`}</span>
                            <input
                              type="number"
                              min={1}
                              value={qty}
                              onChange={(e) => setQty(s.symbol, parseInt(e.target.value) || 1)}
                              className="w-14 px-1 py-0.5 bg-slate-700 border border-slate-600 rounded text-sm text-white text-center"
                            />
                            <button onClick={() => removeFromPortfolio(s.symbol)} className="text-slate-500 hover:text-red-400">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Sector distribution + diversity */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xs font-medium text-slate-400">Distribucion sectorial</h3>
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
                        <span className="text-slate-400">{s.count} uds ({s.pct.toFixed(0)}%)</span>
                      </div>
                    ))}
                  </div>

                  {/* Diversity tips */}
                  {diversityScore < 70 && (
                    <div className="mt-3 p-2 bg-slate-800 rounded text-xs text-slate-400">
                      {sectorAlloc.length < 3 && <p>Necesitas al menos 3 sectores para diversificar.</p>}
                      {portfolioEntries.reduce((a, e) => a + e.qty, 0) < 5 && <p>Incluye al menos 5 posiciones.</p>}
                      {sectorAlloc.length > 0 && sectorAlloc[0].pct > 40 && <p>{sectorAlloc[0].sector} pesa {sectorAlloc[0].pct.toFixed(0)}% — reduce concentracion.</p>}
                    </div>
                  )}
                </div>
              </div>
              {/* Spread & margin info */}
              <div className="mt-3 p-2 bg-slate-800/50 rounded text-[11px] text-slate-500 space-y-0.5">
                <p>Todas las compras incluyen un spread del {(SPREAD_PCT * 100).toFixed(2)}% (coste implicito ask/bid).</p>
                {portfolioEntries.some(({ stock }) => isCfd(stock.symbol)) && (
                  <p className="text-amber-400/70">Los indices, divisas y materias primas operan como CFDs/Futuros con un margen del 5%. Los costes mostrados reflejan el margen, no el valor nominal.</p>
                )}
              </div>
            </div>
          )}

          {/* Correlation panel — appears when 2+ tickers in simulator */}
          {portfolioEntries.length >= 2 && (
            <CorrelationPanel
              tickers={portfolioEntries.map(({ stock }) => stock.symbol)}
              weights={portfolioEntries.map(({ qty }) => qty)}
            />
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
              <div className="scrollbar-top" style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 #1e293b' }}>
                <table className="w-full text-sm" style={{ minWidth: isEquity ? '1100px' : '600px' }}>
                  <thead>
                    <tr className="text-slate-400 text-left border-b border-slate-700 bg-slate-900/80">
                      <th className="px-3 py-2 w-8"></th>
                      <SortHeader k="symbol" label="Ticker" />
                      <th className="px-3 pb-2 pt-2">Nombre</th>
                      <SortHeader k="price" label="Precio" right tooltip="Último precio de cotización" />
                      <SortHeader k="change_percent" label="Cambio" right tooltip="Variación % en la última sesión" />
                      {isEquity && <SortHeader k="market_cap" label="Market Cap" right tooltip="Capitalización bursátil total" />}
                      {isEquity && <th className="px-3 pb-2 pt-2 min-w-[120px]">Sector</th>}
                      {isEquity && <SortHeader k="pe_ratio" label="P/E" right tooltip="Precio / Beneficio por acción" />}
                      {isEquity && <SortHeader k="dividend_yield" label="Div%" right tooltip="Rentabilidad por dividendo anual" />}
                      <SortHeader k="beta" label="Beta" right tooltip="Sensibilidad al mercado (β)" />
                      {isEquity && <SortHeader k="roe" label="ROE" right tooltip="Return on Equity: beneficio neto / fondos propios. Mide la rentabilidad sobre el capital de los accionistas." />}
                      <SortHeader k="volatility" label="Vol σ" right tooltip="Volatilidad anualizada: desviación típica de retornos diarios × √252" />
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
                        <td className="px-3 py-2 text-right text-white">{formatPrice(s.price)}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`inline-flex items-center gap-0.5 ${s.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {s.change_percent >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {s.change_percent >= 0 ? '+' : ''}{s.change_percent.toFixed(2)}%
                          </span>
                        </td>
                        {isEquity && <td className="px-3 py-2 text-right text-slate-300">{formatMarketCap(s.market_cap)}</td>}
                        {isEquity && <td className="px-3 py-2 text-slate-400 min-w-[120px] text-xs">{s.sector || '-'}</td>}
                        {isEquity && <td className="px-3 py-2 text-right text-slate-300">{s.pe_ratio ? s.pe_ratio.toFixed(1) : '-'}</td>}
                        {isEquity && <td className="px-3 py-2 text-right text-slate-300">{formatPct(s.dividend_yield)}</td>}
                        <td className="px-3 py-2 text-right text-slate-300">{s.beta ? s.beta.toFixed(2) : '-'}</td>
                        {isEquity && <td className="px-3 py-2 text-right text-slate-300">{formatPct(s.roe)}</td>}
                        <td className="px-3 py-2 text-right text-slate-300">{s.volatility != null ? `${(s.volatility * 100).toFixed(1)}%` : '-'}</td>
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
