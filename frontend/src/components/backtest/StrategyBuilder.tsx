import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { backtest } from '../../api'
import type { Condition, ConditionOperand, ConditionGroup, RiskManagement, StrategyRules, Comparator, LogicalOperator, ConditionOperandType, PriceField, CandlePattern, StopLossType, StrategySide } from '../../types'
import { Plus, Trash2, Save, X } from 'lucide-react'

// Available indicators with their params
const INDICATORS = [
  { name: 'SMA', label: 'SMA (Media Móvil Simple)', params: [{ key: 'length', label: 'Período', default: 20 }] },
  { name: 'EMA', label: 'EMA (Media Móvil Exponencial)', params: [{ key: 'length', label: 'Período', default: 20 }] },
  { name: 'RSI', label: 'RSI (Fuerza Relativa)', params: [{ key: 'length', label: 'Período', default: 14 }] },
  { name: 'MACD', label: 'MACD', params: [{ key: 'fast', label: 'Rápida', default: 12 }, { key: 'slow', label: 'Lenta', default: 26 }, { key: 'signal', label: 'Señal', default: 9 }] },
  { name: 'BBANDS', label: 'Bandas de Bollinger', params: [{ key: 'length', label: 'Período', default: 20 }, { key: 'std', label: 'Desv. Est.', default: 2.0 }] },
  { name: 'STOCH', label: 'Estocástico', params: [{ key: 'k', label: '%K', default: 14 }, { key: 'd', label: '%D', default: 3 }] },
  { name: 'ATR', label: 'ATR (Average True Range)', params: [{ key: 'length', label: 'Período', default: 14 }] },
  { name: 'OBV', label: 'OBV (On Balance Volume)', params: [] },
  { name: 'FRACTALS', label: 'Fractales de Williams', params: [{ key: 'period', label: 'Período', default: 21 }] },
]

const CANDLE_PATTERNS: { value: CandlePattern; label: string }[] = [
  { value: 'bullish_engulfing', label: 'Envolvente alcista' },
  { value: 'bearish_engulfing', label: 'Envolvente bajista' },
  { value: 'bullish_hammer', label: 'Martillo alcista' },
  { value: 'bearish_hammer', label: 'Martillo bajista' },
  { value: 'bullish_2020', label: 'Vela 20/20 alcista' },
  { value: 'bearish_2020', label: 'Vela 20/20 bajista' },
]

const BBANDS_BANDS: { value: string; label: string }[] = [
  { value: 'lower', label: 'Banda inferior' },
  { value: 'mid', label: 'Media' },
  { value: 'upper', label: 'Banda superior' },
]

const COMPARATORS: { value: Comparator; label: string }[] = [
  { value: 'greater_than', label: '> Mayor que' },
  { value: 'less_than', label: '< Menor que' },
  { value: 'crosses_above', label: '↗ Cruza por encima' },
  { value: 'crosses_below', label: '↘ Cruza por debajo' },
  { value: 'between', label: '↔ Entre' },
  { value: 'outside', label: '↕ Fuera de' },
]

const PRICE_FIELDS: { value: PriceField; label: string }[] = [
  { value: 'close', label: 'Cierre' },
  { value: 'open', label: 'Apertura' },
  { value: 'high', label: 'Máximo' },
  { value: 'low', label: 'Mínimo' },
]

function makeDefaultOperand(type: ConditionOperandType = 'price'): ConditionOperand {
  if (type === 'indicator') return { type: 'indicator', name: 'SMA', params: { length: 20 } }
  if (type === 'value') return { type: 'value', value: 0 }
  if (type === 'volume') return { type: 'volume' }
  if (type === 'candle_pattern') return { type: 'candle_pattern', pattern: 'bullish_hammer' }
  return { type: 'price', field: 'close' }
}

function makeDefaultCondition(): Condition {
  return {
    left: { type: 'indicator', name: 'RSI', params: { length: 14 } },
    comparator: 'less_than',
    right: { type: 'value', value: 30 },
  }
}

interface OperandEditorProps {
  operand: ConditionOperand
  onChange: (o: ConditionOperand) => void
  label: string
}

function OperandEditor({ operand, onChange, label }: OperandEditorProps) {
  const indDef = INDICATORS.find(i => i.name === operand.name)

  return (
    <div className="space-y-1.5">
      <span className="text-xs text-gray-400">{label}</span>
      <select
        value={operand.type}
        onChange={(e) => onChange(makeDefaultOperand(e.target.value as ConditionOperandType))}
        className="block w-full px-2 py-1.5 bg-gray-100 border border-gray-300 rounded text-sm text-gray-900"
      >
        <option value="indicator">Indicador</option>
        <option value="price">Precio</option>
        <option value="volume">Volumen</option>
        <option value="value">Valor numérico</option>
        <option value="candle_pattern">Patrón de vela</option>
      </select>

      {operand.type === 'indicator' && (
        <>
          <select
            value={operand.name || 'SMA'}
            onChange={(e) => {
              const ind = INDICATORS.find(i => i.name === e.target.value)
              const params: Record<string, number> = {}
              ind?.params.forEach(p => { params[p.key] = p.default })
              onChange({ ...operand, name: e.target.value, params })
            }}
            className="block w-full px-2 py-1.5 bg-gray-100 border border-gray-300 rounded text-sm text-gray-900"
          >
            {INDICATORS.map(i => <option key={i.name} value={i.name}>{i.label}</option>)}
          </select>
          {indDef && indDef.params.length > 0 && (
            <div className="flex gap-2">
              {indDef.params.map(p => (
                <div key={p.key} className="flex-1">
                  <label className="text-xs text-gray-400">{p.label}</label>
                  <input
                    type="number"
                    value={operand.params?.[p.key] ?? p.default}
                    onChange={(e) => onChange({ ...operand, params: { ...operand.params, [p.key]: Number(e.target.value) } })}
                    className="block w-full px-2 py-1 bg-gray-100 border border-gray-300 rounded text-sm text-gray-900"
                  />
                </div>
              ))}
            </div>
          )}
          {operand.name === 'BBANDS' && (
            <div>
              <label className="text-xs text-gray-400">Banda</label>
              <select
                value={String(operand.params?.['band'] ?? 'lower')}
                onChange={(e) => onChange({ ...operand, params: { ...operand.params, band: e.target.value } })}
                className="block w-full px-2 py-1.5 bg-gray-100 border border-gray-300 rounded text-sm text-gray-900"
              >
                {BBANDS_BANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
          )}
        </>
      )}

      {operand.type === 'price' && (
        <select
          value={operand.field || 'close'}
          onChange={(e) => onChange({ ...operand, field: e.target.value as PriceField })}
          className="block w-full px-2 py-1.5 bg-gray-100 border border-gray-300 rounded text-sm text-gray-900"
        >
          {PRICE_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      )}

      {operand.type === 'value' && (
        <input
          type="number"
          step="any"
          value={operand.value ?? 0}
          onChange={(e) => onChange({ ...operand, value: Number(e.target.value) })}
          className="block w-full px-2 py-1.5 bg-gray-100 border border-gray-300 rounded text-sm text-gray-900"
        />
      )}

      {operand.type === 'candle_pattern' && (
        <select
          value={operand.pattern || 'bullish_hammer'}
          onChange={(e) => onChange({ ...operand, pattern: e.target.value as CandlePattern })}
          className="block w-full px-2 py-1.5 bg-gray-100 border border-gray-300 rounded text-sm text-gray-900"
        >
          {CANDLE_PATTERNS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      )}
    </div>
  )
}

interface ConditionEditorProps {
  condition: Condition
  onChange: (c: Condition) => void
  onRemove: () => void
}

function ConditionEditor({ condition, onChange, onRemove }: ConditionEditorProps) {
  const needsUpper = condition.comparator === 'between' || condition.comparator === 'outside'

  return (
    <div className="bg-gray-100 rounded-lg p-3 border border-gray-300 space-y-2">
      <div className="flex justify-between items-start">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
          <OperandEditor
            operand={condition.left}
            onChange={(o) => onChange({ ...condition, left: o })}
            label="Izquierda"
          />
          <div className="space-y-1.5">
            <span className="text-xs text-gray-400">Comparador</span>
            <select
              value={condition.comparator}
              onChange={(e) => {
                const comp = e.target.value as Comparator
                const needsUp = comp === 'between' || comp === 'outside'
                onChange({
                  ...condition,
                  comparator: comp,
                  right_upper: needsUp && !condition.right_upper ? makeDefaultOperand('value') : needsUp ? condition.right_upper : undefined,
                })
              }}
              className="block w-full px-2 py-1.5 bg-gray-100 border border-gray-300 rounded text-sm text-gray-900"
            >
              {COMPARATORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {/* Offset: velas atrás */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 whitespace-nowrap">Velas atrás:</span>
              <input
                type="number"
                min="0"
                max="100"
                value={condition.offset || 0}
                onChange={(e) => onChange({ ...condition, offset: Number(e.target.value) })}
                className="w-14 px-1.5 py-1 bg-gray-100 border border-gray-300 rounded text-xs text-gray-900 text-center"
              />
              {(condition.offset ?? 0) > 0 && (
                <span className="text-xs text-amber-400">{condition.offset} velas antes</span>
              )}
            </div>
          </div>
          <OperandEditor
            operand={condition.right}
            onChange={(o) => onChange({ ...condition, right: o })}
            label="Derecha"
          />
        </div>
        <button onClick={onRemove} className="ml-2 mt-5 text-gray-400 hover:text-red-400">
          <Trash2 size={14} />
        </button>
      </div>
      {needsUpper && condition.right_upper && (
        <div className="ml-0 md:ml-[66.66%] max-w-[33.33%]">
          <OperandEditor
            operand={condition.right_upper}
            onChange={(o) => onChange({ ...condition, right_upper: o })}
            label="Límite superior"
          />
        </div>
      )}
    </div>
  )
}

interface ConditionGroupEditorProps {
  group: ConditionGroup
  onChange: (g: ConditionGroup) => void
  title: string
  color: string
}

function ConditionGroupEditor({ group, onChange, title, color }: ConditionGroupEditorProps) {
  return (
    <div className={`border rounded-lg p-4 space-y-3 ${color}`}>
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">{title}</h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Operador:</span>
          <select
            value={group.operator}
            onChange={(e) => onChange({ ...group, operator: e.target.value as LogicalOperator })}
            className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs text-gray-900"
          >
            <option value="AND">AND (todas)</option>
            <option value="OR">OR (alguna)</option>
          </select>
        </div>
      </div>

      {group.conditions.map((cond, i) => (
        <div key={i}>
          {i > 0 && (
            <div className="text-center text-xs text-gray-400 py-1">{group.operator}</div>
          )}
          <ConditionEditor
            condition={cond}
            onChange={(c) => {
              const updated = [...group.conditions]
              updated[i] = c
              onChange({ ...group, conditions: updated })
            }}
            onRemove={() => {
              if (group.conditions.length <= 1) return
              onChange({ ...group, conditions: group.conditions.filter((_, j) => j !== i) })
            }}
          />
        </div>
      ))}

      <button
        onClick={() => onChange({ ...group, conditions: [...group.conditions, makeDefaultCondition()] })}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <Plus size={14} /> Añadir condición
      </button>
    </div>
  )
}

interface Props {
  onClose: () => void
  editStrategy?: { id: string; name: string; description: string | null; rules: StrategyRules } | null
}

export default function StrategyBuilder({ onClose, editStrategy }: Props) {
  const qc = useQueryClient()

  const [name, setName] = useState(editStrategy?.name || '')
  const [description, setDescription] = useState(editStrategy?.description || '')
  const [entry, setEntry] = useState<ConditionGroup>(
    editStrategy?.rules.entry || { operator: 'AND', conditions: [makeDefaultCondition()] }
  )
  const [exit, setExit] = useState<ConditionGroup>(
    editStrategy?.rules.exit || { operator: 'AND', conditions: [{ left: { type: 'indicator', name: 'RSI', params: { length: 14 } }, comparator: 'greater_than', right: { type: 'value', value: 70 } }] }
  )
  const [entryShort, setEntryShort] = useState<ConditionGroup>(
    editStrategy?.rules.entry_short || { operator: 'AND', conditions: [makeDefaultCondition()] }
  )
  const [exitShort, setExitShort] = useState<ConditionGroup>(
    editStrategy?.rules.exit_short || { operator: 'AND', conditions: [{ left: { type: 'indicator', name: 'RSI', params: { length: 14 } }, comparator: 'greater_than', right: { type: 'value', value: 70 } }] }
  )
  const [risk, setRisk] = useState<RiskManagement>(
    editStrategy?.rules.risk_management || { stop_loss_pct: 5, stop_loss_type: 'fixed', take_profit_pct: 15, position_size_pct: 100, max_risk_pct: null }
  )
  const [side, setSide] = useState<StrategySide>(editStrategy?.rules.side || 'long')

  const createMut = useMutation({
    mutationFn: () => {
      const rules: StrategyRules = {
        entry, exit, risk_management: risk, side,
        entry_short: side === 'both' ? entryShort : undefined,
        exit_short: side === 'both' ? exitShort : undefined,
      }
      if (editStrategy) {
        return backtest.updateStrategy(editStrategy.id, { name, description: description || undefined, rules })
      }
      return backtest.createStrategy({ name, description: description || undefined, rules })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['strategies'] })
      onClose()
    },
  })

  return (
    <div className="bg-white rounded-lg p-5 border border-purple-700/50 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">{editStrategy ? 'Editar estrategia' : 'Nueva estrategia'}</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-900"><X size={20} /></button>
      </div>

      {/* Name & description */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-gray-500">Nombre</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mi estrategia"
            className="block mt-1 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 focus:outline-none focus:border-purple-500"
          />
        </div>
        <div>
          <label className="text-sm text-gray-500">Descripción (opcional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción breve de la estrategia"
            className="block mt-1 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      {/* Side selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">Tipo de posición:</span>
        <button
          onClick={() => setSide('long')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${side === 'long' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-900'}`}
        >
          Long
        </button>
        <button
          onClick={() => setSide('short')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${side === 'short' ? 'bg-red-600 text-gray-900' : 'bg-gray-100 text-gray-500 hover:text-gray-900'}`}
        >
          Short
        </button>
        <button
          onClick={() => setSide('both')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${side === 'both' ? 'bg-purple-600 text-gray-900' : 'bg-gray-100 text-gray-500 hover:text-gray-900'}`}
        >
          Long + Short
        </button>
      </div>
      {side === 'both' && (
        <p className="text-xs text-gray-400 -mt-2">Condiciones independientes para Long y Short. Cada lado tiene sus propias reglas de entrada y salida.</p>
      )}

      {side === 'both' ? (
        <>
          {/* Long conditions */}
          <div className="border border-emerald-700/30 rounded-lg p-3 space-y-3">
            <h3 className="text-sm font-semibold text-emerald-400">Long</h3>
            <ConditionGroupEditor group={entry} onChange={setEntry} title="Entrada Long (cuándo abrir largo)" color="border-emerald-700/50" />
            <ConditionGroupEditor group={exit} onChange={setExit} title="Salida Long (cuándo cerrar largo)" color="border-red-700/50" />
          </div>
          {/* Short conditions */}
          <div className="border border-red-700/30 rounded-lg p-3 space-y-3">
            <h3 className="text-sm font-semibold text-red-400">Short</h3>
            <ConditionGroupEditor group={entryShort} onChange={setEntryShort} title="Entrada Short (cuándo abrir corto)" color="border-red-700/50" />
            <ConditionGroupEditor group={exitShort} onChange={setExitShort} title="Salida Short (cuándo cerrar corto)" color="border-amber-700/50" />
          </div>
        </>
      ) : (
        <>
          <ConditionGroupEditor
            group={entry}
            onChange={setEntry}
            title={side === 'short' ? 'Condiciones de ENTRADA (cuándo abrir corto)' : 'Condiciones de ENTRADA (cuándo comprar)'}
            color="border-emerald-700/50"
          />
          <ConditionGroupEditor
            group={exit}
            onChange={setExit}
            title={side === 'short' ? 'Condiciones de SALIDA (cuándo cerrar corto)' : 'Condiciones de SALIDA (cuándo vender)'}
            color="border-red-700/50"
          />
        </>
      )}

      {/* Risk management */}
      <div className="border border-amber-700/50 rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm">Gestión de riesgo</h4>

        {/* Stop loss type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Tipo de Stop Loss</label>
            <select
              value={risk.stop_loss_type}
              onChange={(e) => setRisk({ ...risk, stop_loss_type: e.target.value as StopLossType })}
              className="block mt-1 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm"
            >
              <option value="fixed">Fijo (% de pérdida)</option>
              <option value="fractal">{side === 'short' ? 'Dinámico (fractal de resistencia)' : side === 'both' ? 'Dinámico (fractal soporte/resistencia)' : 'Dinámico (fractal de soporte)'}</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {risk.stop_loss_type === 'fractal'
                ? side === 'short'
                  ? 'El stop se coloca en el último fractal de resistencia (máximo local)'
                  : side === 'both'
                    ? 'Long: stop en fractal de soporte. Short: stop en fractal de resistencia'
                    : 'El stop se coloca en el último fractal de soporte (mínimo local)'
                : 'El stop se activa cuando la pérdida alcanza el % indicado'}
            </p>
          </div>
          <div>
            <label className="text-xs text-gray-500">
              {risk.stop_loss_type === 'fractal' ? 'Stop Loss fallback (%)' : 'Stop Loss (%)'}
            </label>
            <input
              type="number"
              step="0.5"
              value={risk.stop_loss_pct ?? ''}
              onChange={(e) => setRisk({ ...risk, stop_loss_pct: e.target.value ? Number(e.target.value) : null })}
              placeholder="Sin stop"
              className="block mt-1 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm"
            />
            {risk.stop_loss_type === 'fractal' && (
              <p className="text-xs text-gray-400 mt-1">Se usa si no hay fractal disponible</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500">Take Profit (%)</label>
            <input
              type="number"
              step="0.5"
              value={risk.take_profit_pct ?? ''}
              onChange={(e) => setRisk({ ...risk, take_profit_pct: e.target.value ? Number(e.target.value) : null })}
              placeholder="Sin take profit"
              className="block mt-1 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Capital por operación (%)</label>
            <input
              type="number"
              step="5"
              min="1"
              max="100"
              value={risk.position_size_pct}
              onChange={(e) => setRisk({ ...risk, position_size_pct: Number(e.target.value) })}
              className="block mt-1 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">% del capital disponible que se invierte en cada trade. Ej: 100% = usar todo el cash, 50% = invertir la mitad</p>
          </div>
          <div>
            <label className="text-xs text-gray-500">Riesgo máx. por trade (%)</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="100"
              value={risk.max_risk_pct ?? ''}
              onChange={(e) => setRisk({ ...risk, max_risk_pct: e.target.value ? Number(e.target.value) : null })}
              placeholder="Sin límite"
              className="block mt-1 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Ajusta el tamaño de posición para no arriesgar más de este % del capital (ej: 2%)</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => createMut.mutate()}
          disabled={!name.trim() || createMut.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-white font-medium text-sm"
        >
          <Save size={16} /> {createMut.isPending ? 'Guardando...' : editStrategy ? 'Guardar cambios' : 'Crear estrategia'}
        </button>
        <button onClick={onClose} className="px-4 py-2 text-gray-500 hover:text-gray-900 text-sm">
          Cancelar
        </button>
        {createMut.isError && (
          <span className="text-red-400 text-sm self-center">
            {createMut.error instanceof Error ? createMut.error.message : 'Error al guardar'}
          </span>
        )}
      </div>
    </div>
  )
}
