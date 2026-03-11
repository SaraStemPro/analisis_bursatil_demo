import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { backtest } from '../api'
import type { Strategy, BacktestRun, BacktestRunSummary, StrategyRules, ConditionOperand, RiskManagement, StopLossType, StrategySide } from '../types'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { FlaskConical, Play, Trash2, Plus, Pencil, Settings2 } from 'lucide-react'
import StrategyBuilder from '../components/backtest/StrategyBuilder'
import TickerSearchInput from '../components/demo/TickerSearchInput'

// Helper: describe a condition operand in Spanish
function describeOperand(op: ConditionOperand): string {
  if (op.type === 'indicator') {
    const p = op.params ? Object.entries(op.params).map(([k, v]) => `${k}=${v}`).join(', ') : ''
    return `${op.name}(${p})`
  }
  if (op.type === 'price') return `Precio ${op.field || 'close'}`
  if (op.type === 'volume') return 'Volumen'
  if (op.type === 'value') return String(op.value ?? 0)
  if (op.type === 'candle_pattern') return op.pattern || '?'
  return '?'
}

const COMP_LABELS: Record<string, string> = {
  greater_than: '>', less_than: '<', crosses_above: '↗ cruza encima', crosses_below: '↘ cruza debajo', between: 'entre', outside: 'fuera de',
}

export default function Backtest() {
  const qc = useQueryClient()
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null)
  const [customRules, setCustomRules] = useState<StrategyRules | null>(null)
  const [ticker, setTicker] = useState('AAPL')
  const [startDate, setStartDate] = useState('2024-01-01')
  const [endDate, setEndDate] = useState('2025-01-01')
  const [interval, setInterval] = useState('1d')
  const [activeRun, setActiveRun] = useState<BacktestRun | null>(null)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null)

  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: backtest.templates })
  const { data: strategies } = useQuery({ queryKey: ['strategies'], queryFn: backtest.strategies })
  const { data: runs } = useQuery({ queryKey: ['runs'], queryFn: backtest.runs })

  // When selecting a strategy, deep-clone its rules for customization
  useEffect(() => {
    if (selectedStrategy) {
      setCustomRules(JSON.parse(JSON.stringify(selectedStrategy.rules)))
    } else {
      setCustomRules(null)
    }
  }, [selectedStrategy])

  // For templates: pass rules inline (no temp strategy created)
  // For user strategies: update rules if modified, then run by ID
  const runMut = useMutation({
    mutationFn: async () => {
      if (!selectedStrategy || !customRules) throw new Error('No strategy selected')

      if (selectedStrategy.is_template) {
        // Pass rules inline — no strategy is created in "Mis estrategias"
        return backtest.run({
          rules: customRules,
          strategy_name: selectedStrategy.name,
          ticker,
          start_date: startDate,
          end_date: endDate,
          interval,
        })
      }

      // For user strategies, update if rules changed
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
      qc.invalidateQueries({ queryKey: ['runs'] })
      qc.invalidateQueries({ queryKey: ['strategies'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => backtest.deleteRun(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['runs'] }); setActiveRun(null) },
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
  }

  // Helper to update a param in customRules
  const updateOperandParam = (
    group: 'entry' | 'exit',
    condIdx: number,
    side: 'left' | 'right' | 'right_upper',
    paramKey: string,
    paramValue: number,
  ) => {
    if (!customRules) return
    const updated = JSON.parse(JSON.stringify(customRules)) as StrategyRules
    const operand = updated[group].conditions[condIdx][side]
    if (operand && operand.params) {
      operand.params[paramKey] = paramValue
    }
    setCustomRules(updated)
  }

  const updateOperandValue = (
    group: 'entry' | 'exit',
    condIdx: number,
    side: 'left' | 'right' | 'right_upper',
    value: number,
  ) => {
    if (!customRules) return
    const updated = JSON.parse(JSON.stringify(customRules)) as StrategyRules
    const operand = updated[group].conditions[condIdx][side]
    if (operand && operand.type === 'value') {
      operand.value = value
    }
    setCustomRules(updated)
  }

  const updateRiskParam = (key: keyof RiskManagement, value: number | string | null) => {
    if (!customRules) return
    setCustomRules({ ...customRules, risk_management: { ...customRules.risk_management, [key]: value } })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Backtesting</h1>
        <button
          onClick={() => { setShowBuilder(true); setEditingStrategy(null) }}
          className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white text-sm font-medium"
        >
          <Plus size={16} /> Nueva estrategia
        </button>
      </div>

      {/* Strategy builder */}
      {showBuilder && (
        <StrategyBuilder
          onClose={() => { setShowBuilder(false); setEditingStrategy(null) }}
          editStrategy={editingStrategy}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Strategy selector */}
        <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
          <h2 className="font-semibold mb-3">Estrategias</h2>

          {/* Templates */}
          {templates && templates.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-slate-500 mb-2">Plantillas predefinidas</p>
              <div className="space-y-1.5">
                {templates.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStrategy(s)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      selectedStrategy?.id === s.id ? 'bg-emerald-900/50 border border-emerald-600' : 'bg-slate-800 hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">plantilla</span>
                    </div>
                    {s.description && <p className="text-xs text-slate-400 mt-1">{s.description}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* User strategies */}
          <div>
            <p className="text-xs text-slate-500 mb-2">Mis estrategias</p>
            <div className="space-y-1.5">
              {strategies && strategies.length > 0 ? strategies.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center gap-1 rounded text-sm transition-colors ${
                    selectedStrategy?.id === s.id ? 'bg-purple-900/50 border border-purple-600' : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  <button
                    onClick={() => setSelectedStrategy(s)}
                    className="flex-1 text-left px-3 py-2"
                  >
                    <span className="font-medium">{s.name}</span>
                    {s.description && <p className="text-xs text-slate-400 mt-0.5">{s.description}</p>}
                  </button>
                  <button
                    onClick={() => { setEditingStrategy(s); setShowBuilder(true) }}
                    className="p-1.5 text-slate-500 hover:text-purple-400"
                    title="Editar"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => { if (confirm(`¿Eliminar "${s.name}"?`)) deleteStratMut.mutate(s.id) }}
                    className="p-1.5 text-slate-500 hover:text-red-400 mr-1"
                    title="Eliminar"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )) : (
                <p className="text-xs text-slate-500 italic">Crea tu primera estrategia con el botón de arriba</p>
              )}
            </div>
          </div>
        </div>

        {/* Run config — takes 2 columns when strategy selected */}
        <div className={`bg-slate-900 rounded-lg p-5 border border-slate-700 ${selectedStrategy ? 'lg:col-span-2' : ''}`}>
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Settings2 size={16} className="text-slate-400" /> Configuración
          </h2>

          {!selectedStrategy && (
            <p className="text-sm text-slate-500 italic">Selecciona una estrategia de la lista para configurar y ejecutar</p>
          )}

          {selectedStrategy && customRules && (
            <div className="space-y-4">
              {/* Strategy name + side */}
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
              {selectedStrategy.description && <p className="text-xs text-slate-400 -mt-2">{selectedStrategy.description}</p>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Rules with editable params */}
                <div className="space-y-3">
                  {/* Entry conditions */}
                  <div className="border border-emerald-700/40 rounded p-3 space-y-2">
                    <h4 className="text-xs font-medium text-emerald-400">Entrada ({customRules.entry.operator})</h4>
                    {customRules.entry.conditions.map((cond, ci) => (
                      <div key={ci} className="text-xs space-y-1">
                        {ci > 0 && <div className="text-slate-600 text-center">{customRules.entry.operator}</div>}
                        {(cond.offset ?? 0) > 0 && <span className="text-amber-400 text-xs">{cond.offset} velas atrás:</span>}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <OperandDisplay operand={cond.left} onParamChange={(k, v) => updateOperandParam('entry', ci, 'left', k, v)} onValueChange={(v) => updateOperandValue('entry', ci, 'left', v)} />
                          <span className="text-slate-500">{COMP_LABELS[cond.comparator] || cond.comparator}</span>
                          <OperandDisplay operand={cond.right} onParamChange={(k, v) => updateOperandParam('entry', ci, 'right', k, v)} onValueChange={(v) => updateOperandValue('entry', ci, 'right', v)} />
                          {cond.right_upper && (
                            <>
                              <span className="text-slate-500">y</span>
                              <OperandDisplay operand={cond.right_upper} onParamChange={(k, v) => updateOperandParam('entry', ci, 'right_upper', k, v)} onValueChange={(v) => updateOperandValue('entry', ci, 'right_upper', v)} />
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Exit conditions */}
                  <div className="border border-red-700/40 rounded p-3 space-y-2">
                    <h4 className="text-xs font-medium text-red-400">Salida ({customRules.exit.operator})</h4>
                    {customRules.exit.conditions.map((cond, ci) => (
                      <div key={ci} className="text-xs space-y-1">
                        {ci > 0 && <div className="text-slate-600 text-center">{customRules.exit.operator}</div>}
                        {(cond.offset ?? 0) > 0 && <span className="text-amber-400 text-xs">{cond.offset} velas atrás:</span>}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <OperandDisplay operand={cond.left} onParamChange={(k, v) => updateOperandParam('exit', ci, 'left', k, v)} onValueChange={(v) => updateOperandValue('exit', ci, 'left', v)} />
                          <span className="text-slate-500">{COMP_LABELS[cond.comparator] || cond.comparator}</span>
                          <OperandDisplay operand={cond.right} onParamChange={(k, v) => updateOperandParam('exit', ci, 'right', k, v)} onValueChange={(v) => updateOperandValue('exit', ci, 'right', v)} />
                          {cond.right_upper && (
                            <>
                              <span className="text-slate-500">y</span>
                              <OperandDisplay operand={cond.right_upper} onParamChange={(k, v) => updateOperandParam('exit', ci, 'right_upper', k, v)} onValueChange={(v) => updateOperandValue('exit', ci, 'right_upper', v)} />
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Risk management */}
                  <div className="border border-amber-700/40 rounded p-3">
                    <h4 className="text-xs font-medium text-amber-400 mb-2">Gestión de riesgo</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-slate-500">Tipo de Stop Loss</label>
                        <select
                          value={customRules.risk_management.stop_loss_type || 'fixed'}
                          onChange={(e) => updateRiskParam('stop_loss_type', e.target.value as StopLossType)}
                          className="block w-full mt-0.5 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white"
                        >
                          <option value="fixed">Fijo (%)</option>
                          <option value="fractal">Fractal (dinámico)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">
                          {customRules.risk_management.stop_loss_type === 'fractal' ? 'Stop fallback %' : 'Stop Loss %'}
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={customRules.risk_management.stop_loss_pct ?? ''}
                          onChange={(e) => updateRiskParam('stop_loss_pct', e.target.value ? Number(e.target.value) : null)}
                          placeholder="—"
                          className="block w-full mt-0.5 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Take Profit %</label>
                        <input
                          type="number"
                          step="0.5"
                          value={customRules.risk_management.take_profit_pct ?? ''}
                          onChange={(e) => updateRiskParam('take_profit_pct', e.target.value ? Number(e.target.value) : null)}
                          placeholder="—"
                          className="block w-full mt-0.5 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Riesgo máx/trade %</label>
                        <input
                          type="number"
                          step="0.5"
                          value={customRules.risk_management.max_risk_pct ?? ''}
                          onChange={(e) => updateRiskParam('max_risk_pct', e.target.value ? Number(e.target.value) : null)}
                          placeholder="—"
                          className="block w-full mt-0.5 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Capital/operación %</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          max="100"
                          value={customRules.risk_management.position_size_pct}
                          onChange={(e) => updateRiskParam('position_size_pct', Number(e.target.value))}
                          className="block w-full mt-0.5 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white"
                        />
                      </div>
                    </div>
                    {customRules.risk_management.stop_loss_type === 'fractal' && (
                      <p className="text-xs text-slate-500 mt-1.5">
                        {customRules.side === 'both'
                          ? 'Long: stop en fractal de soporte. Short: stop en fractal de resistencia.'
                          : `Stop en último fractal de ${customRules.side === 'short' ? 'resistencia' : 'soporte'}.`
                        } Si no hay fractal, usa el % de fallback.
                      </p>
                    )}
                    {customRules.risk_management.max_risk_pct && (
                      <p className="text-xs text-slate-500 mt-1">Limita la pérdida máxima al {customRules.risk_management.max_risk_pct}% del capital por operación.</p>
                    )}
                  </div>
                </div>

                {/* Right: Ticker, dates, run button */}
                <div className="space-y-3">
                  <TickerSearchInput value={ticker} onChange={(t) => setTicker(t)} />
                  <div>
                    <label className="text-sm text-slate-400">Fecha inicio</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="block mt-1 w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400">Fecha fin</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="block mt-1 w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400">Timeframe</label>
                    <select value={interval} onChange={(e) => setInterval(e.target.value)} className="block mt-1 w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-emerald-500">
                      <option value="1d">Diario</option>
                      <option value="1h">1 hora</option>
                      <option value="4h">4 horas</option>
                      <option value="15m">15 minutos</option>
                      <option value="5m">5 minutos</option>
                      <option value="1wk">Semanal</option>
                    </select>
                  </div>
                  <button
                    onClick={() => runMut.mutate()}
                    disabled={runMut.isPending}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded text-white font-medium"
                  >
                    <Play size={16} /> {runMut.isPending ? 'Ejecutando...' : 'Ejecutar Backtest'}
                  </button>
                  {runMut.isError && <p className="text-red-400 text-sm">{runMut.error instanceof Error ? runMut.error.message : 'Error'}</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Run history — only shows when no strategy selected (otherwise config takes 2 cols) */}
        {!selectedStrategy && (
          <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
            <h2 className="font-semibold mb-3">Historial</h2>
            <RunHistory runs={runs} onView={viewRun} onDelete={(id) => deleteMut.mutate(id)} />
          </div>
        )}
      </div>

      {/* History below when strategy is selected */}
      {selectedStrategy && runs && runs.length > 0 && (
        <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
          <h2 className="font-semibold mb-3">Historial de backtests</h2>
          <RunHistory runs={runs} onView={viewRun} onDelete={(id) => deleteMut.mutate(id)} />
        </div>
      )}

      {/* Results */}
      {activeRun && activeRun.status === 'completed' && activeRun.metrics && (
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <FlaskConical size={18} className="text-emerald-400" />
              Resultados — {activeRun.ticker} ({activeRun.start_date} → {activeRun.end_date})
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 text-sm">
              <div><p className="text-slate-400">Rentabilidad</p><p className={`font-bold ${activeRun.metrics.total_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{activeRun.metrics.total_return_pct >= 0 ? '+' : ''}{activeRun.metrics.total_return_pct.toFixed(2)}%</p></div>
              <div><p className="text-slate-400">Retorno</p><p className={`font-bold ${activeRun.metrics.total_return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{activeRun.metrics.total_return >= 0 ? '+' : ''}{activeRun.metrics.total_return.toFixed(2)}€</p></div>
              <div><p className="text-slate-400">Sharpe</p><p className="font-bold">{activeRun.metrics.sharpe_ratio?.toFixed(2) ?? 'N/A'}</p></div>
              <div><p className="text-slate-400">Max Drawdown</p><p className="font-bold text-red-400">{activeRun.metrics.max_drawdown_pct.toFixed(2)}%</p></div>
              <div><p className="text-slate-400">Win Rate</p><p className="font-bold">{activeRun.metrics.win_rate.toFixed(1)}%</p></div>
              <div><p className="text-slate-400">Profit Factor</p><p className="font-bold">{activeRun.metrics.profit_factor?.toFixed(2) ?? 'N/A'}</p></div>
              <div><p className="text-slate-400">Trades</p><p className="font-bold">{activeRun.metrics.total_trades}</p></div>
              <div><p className="text-slate-400">Buy & Hold</p><p className="font-bold">{activeRun.metrics.buy_and_hold_return_pct?.toFixed(2) ?? 'N/A'}%</p></div>
              {activeRun.metrics.best_trade_pnl != null && activeRun.metrics.worst_trade_pnl != null && activeRun.metrics.best_trade_pnl === activeRun.metrics.worst_trade_pnl ? (
                <div><p className="text-slate-400">Único trade</p><p className={`font-bold ${activeRun.metrics.best_trade_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{activeRun.metrics.best_trade_pnl >= 0 ? '+' : ''}{activeRun.metrics.best_trade_pnl.toFixed(2)}€</p></div>
              ) : (
                <>
                  <div><p className="text-slate-400">Mejor trade</p><p className={`font-bold ${activeRun.metrics.best_trade_pnl != null && activeRun.metrics.best_trade_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{activeRun.metrics.best_trade_pnl != null ? `${activeRun.metrics.best_trade_pnl >= 0 ? '+' : ''}${activeRun.metrics.best_trade_pnl.toFixed(2)}€` : 'N/A'}</p></div>
                  <div><p className="text-slate-400">Peor trade</p><p className={`font-bold ${activeRun.metrics.worst_trade_pnl != null && activeRun.metrics.worst_trade_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{activeRun.metrics.worst_trade_pnl != null ? `${activeRun.metrics.worst_trade_pnl >= 0 ? '+' : ''}${activeRun.metrics.worst_trade_pnl.toFixed(2)}€` : 'N/A'}</p></div>
                </>
              )}
            </div>
          </div>

          {/* Equity curve */}
          {activeRun.equity_curve && (
            <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
              <h3 className="font-semibold mb-3">Curva de Equity</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={activeRun.equity_curve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#94a3b8' }} formatter={(v: number) => [`${v.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`, 'Equity']} />
                  <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Trades table */}
          {activeRun.trades && activeRun.trades.length > 0 && (
            <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
              <h3 className="font-semibold mb-3">Operaciones ({activeRun.trades.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-slate-400 text-left border-b border-slate-700">
                    <th className="pb-2 px-2">Lado</th><th className="pb-2 px-2">Entrada</th><th className="pb-2 px-2">Salida</th><th className="pb-2 px-2 text-right">P. entrada</th><th className="pb-2 px-2 text-right">P. salida</th><th className="pb-2 px-2 text-right">P&L</th><th className="pb-2 px-2 text-right">%</th><th className="pb-2 px-2">Cierre</th><th className="pb-2 px-2 text-right">Días</th>
                  </tr></thead>
                  <tbody>
                    {activeRun.trades.map((t) => {
                      const pnl = t.pnl ? Number(t.pnl) : null
                      const pnlPct = t.pnl_pct ? Number(t.pnl_pct) : null
                      const exitReasonLabel = t.exit_reason === 'stop_loss' ? 'Stop Loss' : t.exit_reason === 'take_profit' ? 'Take Profit' : t.exit_reason === 'signal' ? 'Señal salida' : '-'
                      const isShort = t.type === 'sell'
                      return (
                        <tr key={t.id} className="border-b border-slate-800">
                          <td className="py-1.5 px-2"><span className={`text-xs font-medium px-1.5 py-0.5 rounded ${isShort ? 'bg-red-900/50 text-red-300' : 'bg-emerald-900/50 text-emerald-300'}`}>{isShort ? 'Short' : 'Long'}</span></td>
                          <td className="px-2">{t.entry_date?.split('T')[0]}</td>
                          <td className="px-2">{t.exit_date?.split('T')[0] ?? '-'}</td>
                          <td className="px-2 text-right">{Number(t.entry_price).toFixed(2)}</td>
                          <td className="px-2 text-right">{t.exit_price ? Number(t.exit_price).toFixed(2) : '-'}</td>
                          <td className={`px-2 text-right font-medium ${pnl && pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{pnl != null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}€` : '-'}</td>
                          <td className={`px-2 text-right ${pnlPct && pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : '-'}</td>
                          <td className="px-2"><span className={`text-xs px-1.5 py-0.5 rounded ${t.exit_reason === 'stop_loss' ? 'bg-red-900/60 text-red-400' : t.exit_reason === 'take_profit' ? 'bg-emerald-900/60 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>{exitReasonLabel}</span></td>
                          <td className="px-2 text-right">{t.duration_days ?? '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeRun && activeRun.status === 'failed' && (
        <div className="bg-red-900/30 rounded-lg p-5 border border-red-700">
          <p className="text-red-400">Error: {activeRun.error_message}</p>
        </div>
      )}
    </div>
  )
}

// --- Sub-components ---

function OperandDisplay({ operand, onParamChange, onValueChange }: {
  operand: ConditionOperand
  onParamChange: (key: string, value: number) => void
  onValueChange: (value: number) => void
}) {
  if (operand.type === 'indicator') {
    const bandLabels: Record<string, string> = { lower: 'inf', mid: 'media', upper: 'sup' }
    return (
      <span className="inline-flex items-center gap-1 bg-slate-800 rounded px-1.5 py-0.5">
        <span className="text-white font-medium">{operand.name}</span>
        {operand.params && Object.entries(operand.params).filter(([k]) => k !== 'band').map(([k, v]) => (
          <input
            key={k}
            type="number"
            value={v}
            onChange={(e) => onParamChange(k, Number(e.target.value))}
            className="w-12 px-1 py-0 bg-slate-700 border border-slate-600 rounded text-center text-white text-xs"
            title={k}
          />
        ))}
        {operand.name === 'BBANDS' && operand.params?.band && (
          <span className="text-xs text-blue-300">{bandLabels[String(operand.params.band)] || String(operand.params.band)}</span>
        )}
      </span>
    )
  }
  if (operand.type === 'price') {
    const labels: Record<string, string> = { close: 'Cierre', open: 'Apertura', high: 'Máximo', low: 'Mínimo' }
    return <span className="bg-slate-800 rounded px-1.5 py-0.5 text-cyan-300">{labels[operand.field || 'close'] || operand.field}</span>
  }
  if (operand.type === 'value') {
    return (
      <input
        type="number"
        step="any"
        value={operand.value ?? 0}
        onChange={(e) => onValueChange(Number(e.target.value))}
        className="w-16 px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-center text-amber-300 text-xs"
      />
    )
  }
  if (operand.type === 'volume') {
    return <span className="bg-slate-800 rounded px-1.5 py-0.5 text-purple-300">Volumen</span>
  }
  if (operand.type === 'candle_pattern') {
    const patternLabels: Record<string, string> = {
      bullish_engulfing: 'Envolvente alcista', bearish_engulfing: 'Envolvente bajista',
      bullish_hammer: 'Martillo alcista', bearish_hammer: 'Martillo bajista',
      bullish_marubozu: 'Marubozu alcista', bearish_marubozu: 'Marubozu bajista',
      bullish_long_line: 'Long line alcista', bearish_long_line: 'Long line bajista',
    }
    return <span className="bg-orange-900/60 rounded px-1.5 py-0.5 text-orange-300">{patternLabels[operand.pattern || ''] || operand.pattern}</span>
  }
  return <span>?</span>
}

function RunHistory({ runs, onView, onDelete }: {
  runs: BacktestRunSummary[] | undefined
  onView: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {runs?.map((r) => (
        <div key={r.id} className="flex items-center justify-between bg-slate-800 rounded px-3 py-2 text-sm">
          <button onClick={() => onView(r.id)} className="text-left flex-1">
            <span className="font-medium">{r.strategy_name}</span>
            <span className="text-slate-400 ml-2">{r.ticker}</span>
            {r.total_return_pct !== null && (
              <span className={`ml-2 ${r.total_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {r.total_return_pct >= 0 ? '+' : ''}{r.total_return_pct.toFixed(2)}%
              </span>
            )}
          </button>
          <button onClick={() => onDelete(r.id)} className="text-slate-500 hover:text-red-400 ml-2">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {(!runs || runs.length === 0) && <p className="text-sm text-slate-500">Sin backtests aún</p>}
    </div>
  )
}
