import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { backtest } from '../api'
import type { Strategy, BacktestRun, BacktestRunSummary, StrategyRules, ConditionOperand, RiskManagement, StopLossType, StrategySide, PortfolioBacktestRun, PortfolioRunSummary } from '../types'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { FlaskConical, Play, Trash2, Plus, Pencil, Settings2, X, Briefcase, ChevronDown, ChevronRight } from 'lucide-react'
import StrategyBuilder from '../components/backtest/StrategyBuilder'
import TickerSearchInput from '../components/demo/TickerSearchInput'


const COMP_LABELS: Record<string, string> = {
  greater_than: '>', less_than: '<', crosses_above: '↗ cruza encima', crosses_below: '↘ cruza debajo', between: 'entre', outside: 'fuera de',
}

type BacktestMode = 'single' | 'portfolio'

export default function Backtest() {
  const qc = useQueryClient()
  const [mode, setMode] = useState<BacktestMode>('single')
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null)
  const [customRules, setCustomRules] = useState<StrategyRules | null>(null)
  const [ticker, setTicker] = useState('AAPL')
  const [startDate, setStartDate] = useState('2024-01-01')
  const [endDate, setEndDate] = useState('2025-01-01')
  const [interval, setInterval] = useState('1d')
  const [activeRun, setActiveRun] = useState<BacktestRun | null>(null)
  const [activePortfolioRun, setActivePortfolioRun] = useState<PortfolioBacktestRun | null>(null)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null)

  // Portfolio mode state
  const [portfolioTickers, setPortfolioTickers] = useState<string[]>([])
  const [tickerToAdd, setTickerToAdd] = useState('')
  const [selectedUniverse, setSelectedUniverse] = useState<string>('')
  const [tickerSource, setTickerSource] = useState<'manual' | 'universe'>('manual')
  const [allocMode, setAllocMode] = useState<'equal' | 'custom'>('equal')
  const [customAllocations, setCustomAllocations] = useState<Record<string, number>>({})
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null)
  const [expandedRunData, setExpandedRunData] = useState<BacktestRun | null>(null)

  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: backtest.templates })
  const { data: strategies } = useQuery({ queryKey: ['strategies'], queryFn: backtest.strategies })
  const { data: runs } = useQuery({ queryKey: ['runs'], queryFn: backtest.runs })
  const { data: portfolioRuns } = useQuery({ queryKey: ['portfolio-runs'], queryFn: backtest.portfolioRuns })
  const { data: universes } = useQuery({ queryKey: ['universes'], queryFn: backtest.universes })

  useEffect(() => {
    if (selectedStrategy) {
      setCustomRules(JSON.parse(JSON.stringify(selectedStrategy.rules)))
    } else {
      setCustomRules(null)
    }
  }, [selectedStrategy])

  // Single-ticker run
  const runMut = useMutation({
    mutationFn: async () => {
      if (!selectedStrategy || !customRules) throw new Error('No strategy selected')

      if (selectedStrategy.is_template) {
        return backtest.run({
          rules: customRules,
          strategy_name: selectedStrategy.name,
          ticker,
          start_date: startDate,
          end_date: endDate,
          interval,
        })
      }

      const rulesChanged = JSON.stringify(customRules) !== JSON.stringify(selectedStrategy.rules)
      if (rulesChanged) {
        await backtest.updateStrategy(selectedStrategy.id, { rules: customRules })
        qc.invalidateQueries({ queryKey: ['strategies'] })
      }

      return backtest.run({
        strategy_id: selectedStrategy.id,
        ticker,
        start_date: startDate,
        end_date: endDate,
        interval,
      })
    },
    onSuccess: (data) => {
      setActiveRun(data)
      setActivePortfolioRun(null)
      qc.invalidateQueries({ queryKey: ['runs'] })
      qc.invalidateQueries({ queryKey: ['strategies'] })
    },
  })

  // Portfolio run
  const runPortfolioMut = useMutation({
    mutationFn: async () => {
      if (!selectedStrategy || !customRules) throw new Error('No strategy selected')

      const payload: Parameters<typeof backtest.runPortfolio>[0] = {
        rules: selectedStrategy.is_template ? customRules : undefined,
        strategy_id: selectedStrategy.is_template ? undefined : selectedStrategy.id,
        strategy_name: selectedStrategy.name,
        start_date: startDate,
        end_date: endDate,
        interval,
      }

      if (tickerSource === 'universe' && selectedUniverse) {
        payload.universe = selectedUniverse
      } else {
        payload.tickers = portfolioTickers
      }

      if (allocMode === 'custom' && tickerSource === 'manual') {
        payload.allocations = portfolioTickers.map(t => ({
          ticker: t,
          weight_pct: customAllocations[t] ?? (100 / portfolioTickers.length),
        }))
      }

      // Update user strategy if rules changed
      if (!selectedStrategy.is_template) {
        const rulesChanged = JSON.stringify(customRules) !== JSON.stringify(selectedStrategy.rules)
        if (rulesChanged) {
          await backtest.updateStrategy(selectedStrategy.id, { rules: customRules })
          qc.invalidateQueries({ queryKey: ['strategies'] })
        }
      }

      return backtest.runPortfolio(payload)
    },
    onSuccess: (data) => {
      setActivePortfolioRun(data)
      setActiveRun(null)
      qc.invalidateQueries({ queryKey: ['portfolio-runs'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => backtest.deleteRun(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['runs'] }); setActiveRun(null) },
  })

  const deletePortfolioMut = useMutation({
    mutationFn: (id: string) => backtest.deletePortfolioRun(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portfolio-runs'] }); setActivePortfolioRun(null) },
  })

  const deleteAllMut = useMutation({
    mutationFn: () => backtest.deleteAllRuns(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runs'] })
      qc.invalidateQueries({ queryKey: ['portfolio-runs'] })
      setActiveRun(null)
      setActivePortfolioRun(null)
    },
  })

  const deleteStratMut = useMutation({
    mutationFn: (id: string) => backtest.deleteStrategy(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['strategies'] })
      if (selectedStrategy && selectedStrategy.id === deleteStratMut.variables) {
        setSelectedStrategy(null)
      }
    },
  })

  const viewRun = async (id: string) => {
    const data = await backtest.getRun(id)
    setActiveRun(data)
    setActivePortfolioRun(null)
  }

  const viewPortfolioRun = async (id: string) => {
    const data = await backtest.getPortfolioRun(id)
    setActivePortfolioRun(data)
    setActiveRun(null)
  }

  const addTicker = () => {
    const t = tickerToAdd.trim().toUpperCase()
    if (t && !portfolioTickers.includes(t) && portfolioTickers.length < 50) {
      setPortfolioTickers([...portfolioTickers, t])
      setTickerToAdd('')
    }
  }

  const removeTicker = (t: string) => {
    setPortfolioTickers(portfolioTickers.filter(x => x !== t))
    const newAlloc = { ...customAllocations }
    delete newAlloc[t]
    setCustomAllocations(newAlloc)
  }

  const updateOperandParam = (
    group: string, condIdx: number, side: 'left' | 'right' | 'right_upper',
    paramKey: string, paramValue: number,
  ) => {
    if (!customRules) return
    const updated = JSON.parse(JSON.stringify(customRules)) as StrategyRules
    const g = group as keyof Pick<StrategyRules, 'entry' | 'exit' | 'entry_short' | 'exit_short'>
    const condGroup = updated[g]
    if (condGroup && 'conditions' in condGroup) {
      const operand = condGroup.conditions[condIdx][side]
      if (operand && operand.params) operand.params[paramKey] = paramValue
    }
    setCustomRules(updated)
  }

  const updateOperandValue = (
    group: string, condIdx: number, side: 'left' | 'right' | 'right_upper', value: number,
  ) => {
    if (!customRules) return
    const updated = JSON.parse(JSON.stringify(customRules)) as StrategyRules
    const g = group as keyof Pick<StrategyRules, 'entry' | 'exit' | 'entry_short' | 'exit_short'>
    const condGroup = updated[g]
    if (condGroup && 'conditions' in condGroup) {
      const operand = condGroup.conditions[condIdx][side]
      if (operand && operand.type === 'value') operand.value = value
    }
    setCustomRules(updated)
  }

  const updateRiskParam = (key: keyof RiskManagement, value: number | string | null) => {
    if (!customRules) return
    setCustomRules({ ...customRules, risk_management: { ...customRules.risk_management, [key]: value } })
  }

  const canRunPortfolio = selectedStrategy && customRules && (
    (tickerSource === 'manual' && portfolioTickers.length >= 2) ||
    (tickerSource === 'universe' && selectedUniverse)
  )

  const expandTickerDetails = async (ticker: string, runId: string) => {
    if (expandedTicker === ticker) {
      setExpandedTicker(null)
      setExpandedRunData(null)
      return
    }
    setExpandedTicker(ticker)
    try {
      const data = await backtest.getRun(runId)
      setExpandedRunData(data)
    } catch {
      setExpandedRunData(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Backtesting</h1>
          {/* Mode toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => { setMode('single'); setActivePortfolioRun(null) }}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${mode === 'single' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Un ticker
            </button>
            <button
              onClick={() => { setMode('portfolio'); setActiveRun(null) }}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${mode === 'portfolio' ? 'bg-cyan-600 text-white' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <Briefcase size={14} /> Portfolio
            </button>
          </div>
        </div>
        <button
          onClick={() => { setShowBuilder(true); setEditingStrategy(null) }}
          className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white text-sm font-medium"
        >
          <Plus size={16} /> Nueva estrategia
        </button>
      </div>

      {showBuilder && (
        <StrategyBuilder
          onClose={() => { setShowBuilder(false); setEditingStrategy(null) }}
          editStrategy={editingStrategy}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Strategy selector */}
        <div className="bg-white rounded-lg p-5 border border-gray-300">
          <h2 className="font-semibold mb-3">Estrategias</h2>

          {templates && templates.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-400 mb-2">Plantillas predefinidas</p>
              <div className="space-y-1.5">
                {templates.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStrategy(s)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      selectedStrategy?.id === s.id ? 'bg-emerald-900/50 border border-emerald-600' : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">plantilla</span>
                    </div>
                    {s.description && <p className="text-xs text-gray-500 mt-1">{s.description}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs text-gray-400 mb-2">Mis estrategias</p>
            <div className="space-y-1.5">
              {strategies && strategies.length > 0 ? strategies.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center gap-1 rounded text-sm transition-colors ${
                    selectedStrategy?.id === s.id ? 'bg-purple-900/50 border border-purple-600' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  <button onClick={() => setSelectedStrategy(s)} className="flex-1 text-left px-3 py-2">
                    <span className="font-medium">{s.name}</span>
                    {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}
                  </button>
                  <button onClick={() => { setEditingStrategy(s); setShowBuilder(true) }} className="p-1.5 text-gray-400 hover:text-purple-400" title="Editar">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => { if (confirm(`¿Eliminar "${s.name}"?`)) deleteStratMut.mutate(s.id) }} className="p-1.5 text-gray-400 hover:text-red-400 mr-1" title="Eliminar">
                    <Trash2 size={13} />
                  </button>
                </div>
              )) : (
                <p className="text-xs text-gray-400 italic">Crea tu primera estrategia con el botón de arriba</p>
              )}
            </div>
          </div>
        </div>

        {/* Run config */}
        <div className={`bg-white rounded-lg p-5 border border-gray-300 ${selectedStrategy ? 'lg:col-span-2' : ''}`}>
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Settings2 size={16} className="text-gray-500" /> Configuración
          </h2>

          {!selectedStrategy && (
            <p className="text-sm text-gray-400 italic">Selecciona una estrategia de la lista para configurar y ejecutar</p>
          )}

          {selectedStrategy && customRules && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">{selectedStrategy.name}</span>
                {selectedStrategy.is_template && <span className="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">plantilla</span>}
                <select
                  value={customRules.side || 'long'}
                  onChange={(e) => setCustomRules({ ...customRules, side: e.target.value as StrategySide })}
                  className={`text-xs px-2 py-0.5 rounded border font-medium ${customRules.side === 'short' ? 'bg-red-900/50 border-red-600 text-red-300' : customRules.side === 'both' ? 'bg-purple-900/50 border-purple-600 text-purple-300' : 'bg-emerald-900/50 border-emerald-600 text-emerald-300'}`}
                >
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                  <option value="both">Long + Short</option>
                </select>
              </div>
              {selectedStrategy.description && <p className="text-xs text-gray-500 -mt-2">{selectedStrategy.description}</p>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Rules */}
                <div className="space-y-3">
                  <RulesDisplay
                    customRules={customRules}
                    updateOperandParam={updateOperandParam}
                    updateOperandValue={updateOperandValue}
                    updateRiskParam={updateRiskParam}
                  />
                </div>

                {/* Right: Ticker/Portfolio config, dates, run button */}
                <div className="space-y-3">
                  {mode === 'single' ? (
                    <TickerSearchInput value={ticker} onChange={(t) => setTicker(t)} />
                  ) : (
                    <PortfolioTickerSelector
                      tickerSource={tickerSource}
                      setTickerSource={setTickerSource}
                      portfolioTickers={portfolioTickers}
                      tickerToAdd={tickerToAdd}
                      setTickerToAdd={setTickerToAdd}
                      addTicker={addTicker}
                      removeTicker={removeTicker}
                      selectedUniverse={selectedUniverse}
                      setSelectedUniverse={setSelectedUniverse}
                      universes={universes}
                      allocMode={allocMode}
                      setAllocMode={setAllocMode}
                      customAllocations={customAllocations}
                      setCustomAllocations={setCustomAllocations}
                    />
                  )}

                  <div>
                    <label className="text-sm text-gray-500">Fecha inicio</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="block mt-1 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Fecha fin</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="block mt-1 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Timeframe</label>
                    <select value={interval} onChange={(e) => setInterval(e.target.value)} className="block mt-1 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 focus:outline-none focus:border-emerald-500">
                      <option value="1d">Diario</option>
                      <option value="1h">1 hora</option>
                      <option value="4h">4 horas</option>
                      <option value="15m">15 minutos</option>
                      <option value="5m">5 minutos</option>
                      <option value="1wk">Semanal</option>
                    </select>
                  </div>

                  {mode === 'single' ? (
                    <button
                      onClick={() => runMut.mutate()}
                      disabled={runMut.isPending}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded text-white font-medium"
                    >
                      <Play size={16} /> {runMut.isPending ? 'Ejecutando...' : 'Ejecutar Backtest'}
                    </button>
                  ) : (
                    <button
                      onClick={() => runPortfolioMut.mutate()}
                      disabled={runPortfolioMut.isPending || !canRunPortfolio}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 rounded text-white font-medium"
                    >
                      <Briefcase size={16} /> {runPortfolioMut.isPending ? 'Ejecutando portfolio...' : 'Ejecutar Portfolio'}
                    </button>
                  )}
                  {runMut.isError && <p className="text-red-400 text-sm">{runMut.error instanceof Error ? runMut.error.message : 'Error'}</p>}
                  {runPortfolioMut.isError && <p className="text-red-400 text-sm">{runPortfolioMut.error instanceof Error ? runPortfolioMut.error.message : 'Error'}</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Run history — only shows when no strategy selected */}
        {!selectedStrategy && (
          <div className="bg-white rounded-lg p-5 border border-gray-300">
            <h2 className="font-semibold mb-3">Historial</h2>
            <RunHistory runs={runs} portfolioRuns={portfolioRuns} onView={viewRun} onViewPortfolio={viewPortfolioRun} onDelete={(id) => deleteMut.mutate(id)} onDeletePortfolio={(id) => deletePortfolioMut.mutate(id)} onDeleteAll={() => { if (confirm('¿Borrar todo el historial de backtests?')) deleteAllMut.mutate() }} />
          </div>
        )}
      </div>

      {/* History below when strategy is selected */}
      {selectedStrategy && ((runs && runs.length > 0) || (portfolioRuns && portfolioRuns.length > 0)) && (
        <div className="bg-white rounded-lg p-5 border border-gray-300">
          <h2 className="font-semibold mb-3">Historial de backtests</h2>
          <RunHistory runs={runs} portfolioRuns={portfolioRuns} onView={viewRun} onViewPortfolio={viewPortfolioRun} onDelete={(id) => deleteMut.mutate(id)} onDeletePortfolio={(id) => deletePortfolioMut.mutate(id)} onDeleteAll={() => { if (confirm('¿Borrar todo el historial de backtests?')) deleteAllMut.mutate() }} />
        </div>
      )}

      {/* Single-ticker results */}
      {activeRun && activeRun.status === 'completed' && activeRun.metrics && (
        <SingleRunResults run={activeRun} />
      )}

      {activeRun && activeRun.status === 'failed' && (
        <div className="bg-red-900/30 rounded-lg p-5 border border-red-700">
          <p className="text-red-400">Error: {activeRun.error_message}</p>
        </div>
      )}

      {/* Portfolio results */}
      {activePortfolioRun && activePortfolioRun.status === 'completed' && activePortfolioRun.portfolio_metrics && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg p-5 border border-cyan-700">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <Briefcase size={18} className="text-cyan-400" />
              Portfolio — {activePortfolioRun.strategy_name}
              <span className="text-sm text-gray-500 font-normal">
                ({activePortfolioRun.tickers.length} tickers{activePortfolioRun.universe ? ` — ${activePortfolioRun.universe}` : ''})
              </span>
            </h2>
            <MetricsGrid metrics={activePortfolioRun.portfolio_metrics} />
          </div>

          {activePortfolioRun.failed_tickers.length > 0 && (
            <div className="bg-amber-900/20 rounded-lg p-3 border border-amber-700">
              <p className="text-amber-400 text-sm">
                Tickers sin datos: {activePortfolioRun.failed_tickers.join(', ')}
              </p>
            </div>
          )}

          {activePortfolioRun.equity_curve && (
            <div className="bg-white rounded-lg p-5 border border-gray-300">
              <h3 className="font-semibold mb-3">Curva de Equity (Portfolio)</h3>
              <EquityCurveChart data={activePortfolioRun.equity_curve} color="#06b6d4" />
            </div>
          )}

          {/* Per-ticker breakdown */}
          <div className="bg-white rounded-lg p-5 border border-gray-300">
            <h3 className="font-semibold mb-3">Desglose por ticker ({activePortfolioRun.ticker_results.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-500 text-left border-b border-gray-300">
                  <th className="pb-2 px-2 w-8"></th>
                  <th className="pb-2 px-2">Ticker</th>
                  <th className="pb-2 px-2 text-right">Peso</th>
                  <th className="pb-2 px-2 text-right">Capital</th>
                  <th className="pb-2 px-2 text-right">Rentabilidad</th>
                  <th className="pb-2 px-2 text-right">Trades</th>
                  <th className="pb-2 px-2 text-right">Sharpe</th>
                  <th className="pb-2 px-2 text-right">Max DD</th>
                </tr></thead>
                <tbody>
                  {activePortfolioRun.ticker_results
                    .sort((a, b) => (b.metrics?.total_return_pct ?? 0) - (a.metrics?.total_return_pct ?? 0))
                    .map((tr) => (
                    <TickerResultRow
                      key={tr.ticker}
                      result={tr}
                      isExpanded={expandedTicker === tr.ticker}
                      expandedRunData={expandedTicker === tr.ticker ? expandedRunData : null}
                      onToggle={() => expandTickerDetails(tr.ticker, tr.run_id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activePortfolioRun && activePortfolioRun.status === 'failed' && (
        <div className="bg-red-900/30 rounded-lg p-5 border border-red-700">
          <p className="text-red-400">Error: {activePortfolioRun.error_message}</p>
        </div>
      )}
    </div>
  )
}


// ─── Sub-components ───

function PortfolioTickerSelector({ tickerSource, setTickerSource, portfolioTickers, tickerToAdd, setTickerToAdd, addTicker, removeTicker, selectedUniverse, setSelectedUniverse, universes, allocMode, setAllocMode, customAllocations, setCustomAllocations }: {
  tickerSource: 'manual' | 'universe'
  setTickerSource: (v: 'manual' | 'universe') => void
  portfolioTickers: string[]
  tickerToAdd: string
  setTickerToAdd: (v: string) => void
  addTicker: () => void
  removeTicker: (t: string) => void
  selectedUniverse: string
  setSelectedUniverse: (v: string) => void
  universes: Record<string, { label: string; count: number }> | undefined
  allocMode: 'equal' | 'custom'
  setAllocMode: (v: 'equal' | 'custom') => void
  customAllocations: Record<string, number>
  setCustomAllocations: (v: Record<string, number>) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-500">Tickers del portfolio</label>
      <div className="flex gap-1.5">
        <button
          onClick={() => setTickerSource('manual')}
          className={`text-xs px-2.5 py-1 rounded ${tickerSource === 'manual' ? 'bg-cyan-600 text-white' : 'bg-gray-200 text-gray-500'}`}
        >
          Manual
        </button>
        <button
          onClick={() => setTickerSource('universe')}
          className={`text-xs px-2.5 py-1 rounded ${tickerSource === 'universe' ? 'bg-cyan-600 text-white' : 'bg-gray-200 text-gray-500'}`}
        >
          Universo
        </button>
      </div>

      {tickerSource === 'universe' ? (
        <select
          value={selectedUniverse}
          onChange={(e) => setSelectedUniverse(e.target.value)}
          className="block w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm"
        >
          <option value="">Seleccionar universo...</option>
          {universes && Object.entries(universes).map(([key, u]) => (
            <option key={key} value={key}>{u.label} ({u.count} tickers{u.count > 50 ? ' — se usarán los primeros 50' : ''})</option>
          ))}
        </select>
      ) : (
        <>
          <div className="flex gap-1.5">
            <div className="flex-1">
              <TickerSearchInput value={tickerToAdd} onChange={setTickerToAdd} />
            </div>
            <button
              onClick={addTicker}
              disabled={!tickerToAdd.trim()}
              className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 rounded text-white text-sm"
            >
              <Plus size={16} />
            </button>
          </div>

          {portfolioTickers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {portfolioTickers.map(t => (
                <span key={t} className="inline-flex items-center gap-1 bg-gray-200 rounded px-2 py-0.5 text-xs text-gray-900">
                  {t}
                  <button onClick={() => removeTicker(t)} className="text-gray-500 hover:text-red-400"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}

          {portfolioTickers.length >= 2 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Capital:</label>
                <button
                  onClick={() => setAllocMode('equal')}
                  className={`text-xs px-2 py-0.5 rounded ${allocMode === 'equal' ? 'bg-cyan-800 text-cyan-300' : 'bg-gray-200 text-gray-500'}`}
                >
                  Equitativo
                </button>
                <button
                  onClick={() => setAllocMode('custom')}
                  className={`text-xs px-2 py-0.5 rounded ${allocMode === 'custom' ? 'bg-cyan-800 text-cyan-300' : 'bg-gray-200 text-gray-500'}`}
                >
                  Personalizado
                </button>
              </div>
              {allocMode === 'equal' ? (
                <p className="text-xs text-gray-400">{(100 / portfolioTickers.length).toFixed(1)}% por ticker</p>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {portfolioTickers.map(t => (
                    <div key={t} className="flex items-center gap-2 text-xs">
                      <span className="w-14 text-gray-700">{t}</span>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value={customAllocations[t] ?? Math.round(100 / portfolioTickers.length)}
                        onChange={(e) => setCustomAllocations({ ...customAllocations, [t]: Number(e.target.value) })}
                        className="w-16 px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-gray-900 text-center"
                      />
                      <span className="text-gray-400">%</span>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400">
                    Total: {portfolioTickers.reduce((sum, t) => sum + (customAllocations[t] ?? Math.round(100 / portfolioTickers.length)), 0)}%
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-gray-400">{portfolioTickers.length}/50 tickers</p>
        </>
      )}
    </div>
  )
}


function ConditionGroupDisplay({ group, groupKey, label, borderColor, updateOperandParam, updateOperandValue }: {
  group: import('../types').ConditionGroup
  groupKey: 'entry' | 'exit' | 'entry_short' | 'exit_short'
  label: string
  borderColor: string
  updateOperandParam: (group: string, ci: number, side: 'left' | 'right' | 'right_upper', k: string, v: number) => void
  updateOperandValue: (group: string, ci: number, side: 'left' | 'right' | 'right_upper', v: number) => void
}) {
  return (
    <div className={`border ${borderColor} rounded p-3 space-y-2`}>
      <h4 className={`text-xs font-medium ${borderColor.replace('border-', 'text-').replace('/40', '')}`}>{label} ({group.operator})</h4>
      {group.conditions.map((cond, ci) => (
        <div key={ci} className="text-xs space-y-1">
          {ci > 0 && <div className="text-gray-400 text-center">{group.operator}</div>}
          {(cond.offset ?? 0) > 0 && <span className="text-amber-400 text-xs">{cond.offset} velas atrás:</span>}
          <div className="flex items-center gap-1.5 flex-wrap">
            <OperandDisplay operand={cond.left} onParamChange={(k, v) => updateOperandParam(groupKey, ci, 'left', k, v)} onValueChange={(v) => updateOperandValue(groupKey, ci, 'left', v)} />
            <span className="text-gray-400">{COMP_LABELS[cond.comparator] || cond.comparator}</span>
            <OperandDisplay operand={cond.right} onParamChange={(k, v) => updateOperandParam(groupKey, ci, 'right', k, v)} onValueChange={(v) => updateOperandValue(groupKey, ci, 'right', v)} />
            {cond.right_upper && (
              <>
                <span className="text-gray-400">y</span>
                <OperandDisplay operand={cond.right_upper} onParamChange={(k, v) => updateOperandParam(groupKey, ci, 'right_upper', k, v)} onValueChange={(v) => updateOperandValue(groupKey, ci, 'right_upper', v)} />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function RulesDisplay({ customRules, updateOperandParam, updateOperandValue, updateRiskParam }: {
  customRules: StrategyRules
  updateOperandParam: (group: string, ci: number, side: 'left' | 'right' | 'right_upper', k: string, v: number) => void
  updateOperandValue: (group: string, ci: number, side: 'left' | 'right' | 'right_upper', v: number) => void
  updateRiskParam: (key: keyof RiskManagement, v: number | string | null) => void
}) {
  const isBoth = customRules.side === 'both' && customRules.entry_short && customRules.exit_short
  return (
    <>
      {isBoth ? (
        <>
          <p className="text-xs text-emerald-400 font-medium">Long</p>
          <ConditionGroupDisplay group={customRules.entry} groupKey="entry" label="Entrada Long" borderColor="border-emerald-700/40" updateOperandParam={updateOperandParam} updateOperandValue={updateOperandValue} />
          <ConditionGroupDisplay group={customRules.exit} groupKey="exit" label="Salida Long" borderColor="border-red-700/40" updateOperandParam={updateOperandParam} updateOperandValue={updateOperandValue} />
          <p className="text-xs text-red-400 font-medium">Short</p>
          <ConditionGroupDisplay group={customRules.entry_short!} groupKey="entry_short" label="Entrada Short" borderColor="border-red-700/40" updateOperandParam={updateOperandParam} updateOperandValue={updateOperandValue} />
          <ConditionGroupDisplay group={customRules.exit_short!} groupKey="exit_short" label="Salida Short" borderColor="border-amber-700/40" updateOperandParam={updateOperandParam} updateOperandValue={updateOperandValue} />
        </>
      ) : (
        <>
          <ConditionGroupDisplay group={customRules.entry} groupKey="entry" label="Entrada" borderColor="border-emerald-700/40" updateOperandParam={updateOperandParam} updateOperandValue={updateOperandValue} />
          <ConditionGroupDisplay group={customRules.exit} groupKey="exit" label="Salida" borderColor="border-red-700/40" updateOperandParam={updateOperandParam} updateOperandValue={updateOperandValue} />
        </>
      )}

      {/* Risk management */}
      <div className="border border-amber-700/40 rounded p-3">
        <h4 className="text-xs font-medium text-amber-400 mb-2">Gestión de riesgo</h4>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-400">Tipo de Stop Loss</label>
            <select
              value={customRules.risk_management.stop_loss_type || 'fixed'}
              onChange={(e) => updateRiskParam('stop_loss_type', e.target.value as StopLossType)}
              className="block w-full mt-0.5 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs text-gray-900"
            >
              <option value="fixed">Fijo (%)</option>
              <option value="fractal">Fractal (dinámico)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400">
              {customRules.risk_management.stop_loss_type === 'fractal' ? 'Stop fallback %' : 'Stop Loss %'}
            </label>
            <input type="number" step="0.5" value={customRules.risk_management.stop_loss_pct ?? ''} onChange={(e) => updateRiskParam('stop_loss_pct', e.target.value ? Number(e.target.value) : null)} placeholder="—" className="block w-full mt-0.5 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs text-gray-900" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Take Profit %</label>
            <input type="number" step="0.5" value={customRules.risk_management.take_profit_pct ?? ''} onChange={(e) => updateRiskParam('take_profit_pct', e.target.value ? Number(e.target.value) : null)} placeholder="—" className="block w-full mt-0.5 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs text-gray-900" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Riesgo máx/trade %</label>
            <input type="number" step="0.5" value={customRules.risk_management.max_risk_pct ?? ''} onChange={(e) => updateRiskParam('max_risk_pct', e.target.value ? Number(e.target.value) : null)} placeholder="—" className="block w-full mt-0.5 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs text-gray-900" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Capital/operación %</label>
            <input type="number" step="1" min="1" max="100" value={customRules.risk_management.position_size_pct} onChange={(e) => updateRiskParam('position_size_pct', Number(e.target.value))} className="block w-full mt-0.5 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs text-gray-900" />
          </div>
        </div>
        {customRules.risk_management.stop_loss_type === 'fractal' && (
          <p className="text-xs text-gray-400 mt-1.5">
            {customRules.side === 'both'
              ? 'Long: stop en fractal de soporte. Short: stop en fractal de resistencia.'
              : `Stop en último fractal de ${customRules.side === 'short' ? 'resistencia' : 'soporte'}.`
            } Si no hay fractal, usa el % de fallback.
          </p>
        )}
        {customRules.risk_management.max_risk_pct && (
          <p className="text-xs text-gray-400 mt-1">Limita la pérdida máxima al {customRules.risk_management.max_risk_pct}% del capital por operación.</p>
        )}
      </div>
    </>
  )
}


function MetricsGrid({ metrics }: { metrics: import('../types').BacktestMetrics }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 text-sm">
      <div><p className="text-gray-500">Rentabilidad</p><p className={`font-bold ${metrics.total_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{metrics.total_return_pct >= 0 ? '+' : ''}{metrics.total_return_pct.toFixed(2)}%</p></div>
      <div><p className="text-gray-500">Retorno</p><p className={`font-bold ${metrics.total_return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{metrics.total_return >= 0 ? '+' : ''}{metrics.total_return.toFixed(2)}€</p></div>
      <div><p className="text-gray-500">Sharpe</p><p className="font-bold">{metrics.sharpe_ratio?.toFixed(2) ?? 'N/A'}</p></div>
      <div><p className="text-gray-500">Max Drawdown</p><p className="font-bold text-red-400">{metrics.max_drawdown_pct.toFixed(2)}%</p></div>
      <div><p className="text-gray-500">Win Rate</p><p className="font-bold">{metrics.win_rate.toFixed(1)}%</p></div>
      <div><p className="text-gray-500">Profit Factor</p><p className="font-bold">{metrics.profit_factor?.toFixed(2) ?? 'N/A'}</p></div>
      <div><p className="text-gray-500">Trades</p><p className="font-bold">{metrics.total_trades}</p></div>
      {metrics.buy_and_hold_return_pct != null && (
        <div><p className="text-gray-500">Buy & Hold</p><p className="font-bold">{metrics.buy_and_hold_return_pct.toFixed(2)}%</p></div>
      )}
      {metrics.best_trade_pnl != null && metrics.worst_trade_pnl != null && metrics.best_trade_pnl === metrics.worst_trade_pnl ? (
        <div><p className="text-gray-500">Único trade</p><p className={`font-bold ${metrics.best_trade_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{metrics.best_trade_pnl >= 0 ? '+' : ''}{metrics.best_trade_pnl.toFixed(2)}€</p></div>
      ) : (
        <>
          {metrics.best_trade_pnl != null && <div><p className="text-gray-500">Mejor trade</p><p className={`font-bold ${metrics.best_trade_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{metrics.best_trade_pnl >= 0 ? '+' : ''}{metrics.best_trade_pnl.toFixed(2)}€</p></div>}
          {metrics.worst_trade_pnl != null && <div><p className="text-gray-500">Peor trade</p><p className={`font-bold ${metrics.worst_trade_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{metrics.worst_trade_pnl >= 0 ? '+' : ''}{metrics.worst_trade_pnl.toFixed(2)}€</p></div>}
        </>
      )}
    </div>
  )
}


function EquityCurveChart({ data, color = '#10b981' }: { data: import('../types').EquityPoint[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={['auto', 'auto']} />
        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#94a3b8' }} formatter={(v: number | undefined) => [`${(v ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`, 'Equity']} />
        <Line type="monotone" dataKey="equity" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}


function SingleRunResults({ run }: { run: BacktestRun }) {
  if (!run.metrics) return null
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg p-5 border border-gray-300">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <FlaskConical size={18} className="text-emerald-400" />
          Resultados — {run.ticker} ({run.start_date} → {run.end_date})
        </h2>
        <MetricsGrid metrics={run.metrics} />
      </div>

      {run.equity_curve && (
        <div className="bg-white rounded-lg p-5 border border-gray-300">
          <h3 className="font-semibold mb-3">Curva de Equity</h3>
          <EquityCurveChart data={run.equity_curve} />
        </div>
      )}

      {run.trades && run.trades.length > 0 && (
        <div className="bg-white rounded-lg p-5 border border-gray-300">
          <h3 className="font-semibold mb-3">Operaciones ({run.trades.length})</h3>
          <TradesTable trades={run.trades} />
        </div>
      )}
    </div>
  )
}


function TradesTable({ trades }: { trades: import('../types').BacktestTrade[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-gray-500 text-left border-b border-gray-300">
          <th className="pb-2 px-2">Lado</th><th className="pb-2 px-2">Entrada</th><th className="pb-2 px-2">Salida</th><th className="pb-2 px-2 text-right">P. entrada</th><th className="pb-2 px-2 text-right">P. salida</th><th className="pb-2 px-2 text-right">P&L</th><th className="pb-2 px-2 text-right">%</th><th className="pb-2 px-2">Cierre</th><th className="pb-2 px-2 text-right">Días</th>
        </tr></thead>
        <tbody>
          {trades.map((t) => {
            const pnl = t.pnl ? Number(t.pnl) : null
            const pnlPct = t.pnl_pct ? Number(t.pnl_pct) : null
            const exitReasonLabel = t.exit_reason === 'stop_loss' ? 'Stop Loss' : t.exit_reason === 'take_profit' ? 'Take Profit' : t.exit_reason === 'signal' ? 'Señal salida' : '-'
            const isShort = t.type === 'sell'
            return (
              <tr key={t.id} className="border-b border-gray-200">
                <td className="py-1.5 px-2"><span className={`text-xs font-medium px-1.5 py-0.5 rounded ${isShort ? 'bg-red-900/50 text-red-300' : 'bg-emerald-900/50 text-emerald-300'}`}>{isShort ? 'Short' : 'Long'}</span></td>
                <td className="px-2">{t.entry_date?.split('T')[0]}</td>
                <td className="px-2">{t.exit_date?.split('T')[0] ?? '-'}</td>
                <td className="px-2 text-right">{Number(t.entry_price).toFixed(2)}</td>
                <td className="px-2 text-right">{t.exit_price ? Number(t.exit_price).toFixed(2) : '-'}</td>
                <td className={`px-2 text-right font-medium ${pnl && pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{pnl != null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}€` : '-'}</td>
                <td className={`px-2 text-right ${pnlPct && pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : '-'}</td>
                <td className="px-2"><span className={`text-xs px-1.5 py-0.5 rounded ${t.exit_reason === 'stop_loss' ? 'bg-red-900/60 text-red-400' : t.exit_reason === 'take_profit' ? 'bg-emerald-900/60 text-emerald-400' : 'bg-gray-200 text-gray-700'}`}>{exitReasonLabel}</span></td>
                <td className="px-2 text-right">{t.duration_days ?? '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}


function TickerResultRow({ result, isExpanded, expandedRunData, onToggle }: {
  result: import('../types').PortfolioTickerResult
  isExpanded: boolean
  expandedRunData: BacktestRun | null
  onToggle: () => void
}) {
  const m = result.metrics
  return (
    <>
      <tr className="border-b border-gray-200 hover:bg-gray-100 cursor-pointer" onClick={onToggle}>
        <td className="py-1.5 px-2">
          {isExpanded ? <ChevronDown size={14} className="text-cyan-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </td>
        <td className="px-2 font-medium">{result.ticker}</td>
        <td className="px-2 text-right text-gray-500">{result.weight_pct.toFixed(1)}%</td>
        <td className="px-2 text-right text-gray-500">{result.allocated_capital.toLocaleString('es-ES', { minimumFractionDigits: 0 })}€</td>
        <td className={`px-2 text-right font-medium ${(m?.total_return_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {m ? `${m.total_return_pct >= 0 ? '+' : ''}${m.total_return_pct.toFixed(2)}%` : 'N/A'}
        </td>
        <td className="px-2 text-right">{result.trades_count}</td>
        <td className="px-2 text-right">{m?.sharpe_ratio?.toFixed(2) ?? '-'}</td>
        <td className="px-2 text-right text-red-400">{m ? `${m.max_drawdown_pct.toFixed(1)}%` : '-'}</td>
      </tr>
      {isExpanded && expandedRunData && expandedRunData.equity_curve && (
        <tr><td colSpan={8} className="p-3 bg-gray-100/30">
          <div className="space-y-3">
            <EquityCurveChart data={expandedRunData.equity_curve} color="#06b6d4" />
            {expandedRunData.trades && expandedRunData.trades.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Operaciones ({expandedRunData.trades.length})</p>
                <TradesTable trades={expandedRunData.trades} />
              </div>
            )}
          </div>
        </td></tr>
      )}
    </>
  )
}


function OperandDisplay({ operand, onParamChange, onValueChange }: {
  operand: ConditionOperand
  onParamChange: (key: string, value: number) => void
  onValueChange: (value: number) => void
}) {
  if (operand.type === 'indicator') {
    const bandLabels: Record<string, string> = { lower: 'inf', mid: 'media', upper: 'sup' }
    return (
      <span className="inline-flex items-center gap-1 bg-gray-100 rounded px-1.5 py-0.5">
        <span className="text-gray-900 font-medium">{operand.name}</span>
        {operand.params && Object.entries(operand.params).filter(([k]) => k !== 'band').map(([k, v]) => (
          <input key={k} type="number" value={v} onChange={(e) => onParamChange(k, Number(e.target.value))} className="w-12 px-1 py-0 bg-gray-200 border border-gray-300 rounded text-center text-gray-900 text-xs" title={k} />
        ))}
        {operand.name === 'BBANDS' && operand.params?.band && (
          <span className="text-xs text-blue-300">{bandLabels[String(operand.params.band)] || String(operand.params.band)}</span>
        )}
      </span>
    )
  }
  if (operand.type === 'price') {
    const labels: Record<string, string> = { close: 'Cierre', open: 'Apertura', high: 'Máximo', low: 'Mínimo' }
    return <span className="bg-gray-100 rounded px-1.5 py-0.5 text-cyan-300">{labels[operand.field || 'close'] || operand.field}</span>
  }
  if (operand.type === 'value') {
    return <input type="number" step="any" value={operand.value ?? 0} onChange={(e) => onValueChange(Number(e.target.value))} className="w-16 px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-center text-amber-300 text-xs" />
  }
  if (operand.type === 'volume') {
    return <span className="bg-gray-100 rounded px-1.5 py-0.5 text-purple-300">Volumen</span>
  }
  if (operand.type === 'candle_pattern') {
    const patternLabels: Record<string, string> = {
      bullish_engulfing: 'Envolvente alcista', bearish_engulfing: 'Envolvente bajista',
      bullish_hammer: 'Martillo alcista', bearish_hammer: 'Martillo bajista',
      bullish_2020: 'Vela 20/20 alcista', bearish_2020: 'Vela 20/20 bajista',
    }
    return <span className="bg-orange-900/60 rounded px-1.5 py-0.5 text-orange-300">{patternLabels[operand.pattern || ''] || operand.pattern}</span>
  }
  return <span>?</span>
}


function RunHistory({ runs, portfolioRuns, onView, onViewPortfolio, onDelete, onDeletePortfolio, onDeleteAll }: {
  runs: BacktestRunSummary[] | undefined
  portfolioRuns: PortfolioRunSummary[] | undefined
  onView: (id: string) => void
  onViewPortfolio: (id: string) => void
  onDelete: (id: string) => void
  onDeletePortfolio: (id: string) => void
  onDeleteAll: () => void
}) {
  // Merge and sort by date
  type HistoryItem = { type: 'single'; data: BacktestRunSummary } | { type: 'portfolio'; data: PortfolioRunSummary }
  const items: HistoryItem[] = [
    ...(runs?.map(r => ({ type: 'single' as const, data: r })) ?? []),
    ...(portfolioRuns?.map(r => ({ type: 'portfolio' as const, data: r })) ?? []),
  ].sort((a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime())

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex justify-end mb-1">
          <button onClick={onDeleteAll} className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-1">
            <Trash2 size={12} /> Borrar todo
          </button>
        </div>
      )}
      <div className="max-h-64 overflow-y-auto space-y-2">
      {items.map((item) => item.type === 'single' ? (
        <div key={item.data.id} className="flex items-center justify-between bg-gray-100 rounded px-3 py-2 text-sm">
          <button onClick={() => onView(item.data.id)} className="text-left flex-1">
            <span className="font-medium">{item.data.strategy_name}</span>
            <span className="text-gray-500 ml-2">{item.data.ticker}</span>
            {item.data.total_return_pct !== null && (
              <span className={`ml-2 ${item.data.total_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {item.data.total_return_pct >= 0 ? '+' : ''}{item.data.total_return_pct.toFixed(2)}%
              </span>
            )}
          </button>
          <button onClick={() => onDelete(item.data.id)} className="text-gray-400 hover:text-red-400 ml-2"><Trash2 size={14} /></button>
        </div>
      ) : (
        <div key={item.data.id} className="flex items-center justify-between bg-gray-100 rounded px-3 py-2 text-sm border-l-2 border-cyan-600">
          <button onClick={() => onViewPortfolio(item.data.id)} className="text-left flex-1">
            <span className="font-medium">{item.data.strategy_name ?? 'Portfolio'}</span>
            <span className="text-cyan-400 ml-2">{item.data.ticker_count} tickers</span>
            {item.data.universe && <span className="text-gray-400 ml-1">({item.data.universe})</span>}
            {item.data.total_return_pct !== null && (
              <span className={`ml-2 ${item.data.total_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {item.data.total_return_pct >= 0 ? '+' : ''}{item.data.total_return_pct.toFixed(2)}%
              </span>
            )}
          </button>
          <button onClick={() => onDeletePortfolio(item.data.id)} className="text-gray-400 hover:text-red-400 ml-2"><Trash2 size={14} /></button>
        </div>
      ))}
      {items.length === 0 && <p className="text-sm text-gray-400">Sin backtests aún</p>}
      </div>
    </div>
  )
}
