import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { demo, market } from '../../api'
import { ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import TickerSearchInput from './TickerSearchInput'
import { isCfd, askPrice, totalCost, cfdLabel, marginPerContract, SPREAD_PCT } from '../../lib/cfdUtils'

interface Props {
  initialTicker?: string
}

export default function OrderForm({ initialTicker }: Props) {
  const qc = useQueryClient()
  const [ticker, setTicker] = useState(initialTicker || '')

  useEffect(() => {
    if (initialTicker) setTicker(initialTicker)
  }, [initialTicker])
  const [tickerName, setTickerName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [stopLossMode, setStopLossMode] = useState<'price' | 'pct'>('pct')
  const [stopLossValue, setStopLossValue] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const { data: quote } = useQuery({
    queryKey: ['demoQuote', ticker],
    queryFn: () => market.quote(ticker),
    enabled: ticker.length > 0,
    refetchInterval: 60_000,
  })

  const marketClosed = quote && ['CLOSED', 'PREPRE', 'POSTPOST'].includes(quote.market_state.toUpperCase())

  const orderMut = useMutation({
    mutationFn: (data: { ticker: string; type: string; quantity: number; stop_loss?: number; notes: string }) => demo.createOrder(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['performance'] })
      qc.invalidateQueries({ queryKey: ['portfolioSummary'] })
      setTicker('')
      setTickerName('')
      setQuantity(1)
      setStopLossValue('')
      setNotes('')
      setError('')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  })

  const handleOrder = (type: 'buy' | 'sell') => {
    if (!ticker) return
    if (!stopLossValue || Number(stopLossValue) <= 0) {
      setError('El stop loss es obligatorio. Define un precio o % de pérdida máxima.')
      return
    }
    if (!notes.trim()) {
      setError('El diario de trading es obligatorio. Justifica tu operación.')
      return
    }
    // Compute stop_loss price
    let stopLossPrice: number | undefined
    if (quote) {
      if (stopLossMode === 'price') {
        stopLossPrice = Number(stopLossValue)
      } else {
        const pct = Number(stopLossValue) / 100
        stopLossPrice = type === 'buy'
          ? quote.price * (1 - pct)
          : quote.price * (1 + pct)
      }
    }
    orderMut.mutate({ ticker, type, quantity, stop_loss: stopLossPrice, notes: notes.trim() })
  }

  return (
    <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
      <h2 className="font-semibold mb-3">Nueva orden</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <TickerSearchInput
          value={ticker}
          onChange={(t, name) => { setTicker(t); if (name) setTickerName(name) }}
        />
        <div>
          <label className="text-sm text-slate-400">Cantidad</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            className="block mt-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white w-24 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-slate-400">Stop Loss <span className="text-red-400">*</span></label>
          <div className="flex mt-1 gap-1">
            <select
              value={stopLossMode}
              onChange={(e) => { setStopLossMode(e.target.value as 'price' | 'pct'); setStopLossValue('') }}
              className="px-2 py-2 bg-slate-800 border border-slate-600 rounded-l text-white text-xs w-14"
            >
              <option value="pct">%</option>
              <option value="price">Precio</option>
            </select>
            <input
              type="number"
              step="any"
              min={0.01}
              value={stopLossValue}
              onChange={(e) => { setStopLossValue(e.target.value); if (error) setError('') }}
              placeholder={stopLossMode === 'pct' ? 'Ej: 5' : 'Ej: 150.00'}
              className={`px-2 py-2 bg-slate-800 border rounded-r text-white w-24 focus:outline-none text-sm ${
                error && !stopLossValue ? 'border-red-500' : 'border-slate-600 focus:border-emerald-500'
              }`}
            />
          </div>
        </div>
        <button
          onClick={() => handleOrder('buy')}
          disabled={!ticker || orderMut.isPending || !!marketClosed}
          className="flex items-center gap-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded text-white font-medium text-sm"
        >
          <ArrowUpCircle size={16} /> Comprar (Long)
        </button>
        <button
          onClick={() => handleOrder('sell')}
          disabled={!ticker || orderMut.isPending || !!marketClosed}
          className="flex items-center gap-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded text-white font-medium text-sm"
        >
          <ArrowDownCircle size={16} /> Vender (Short)
        </button>
        {marketClosed && (
          <span className="text-amber-400 text-xs flex items-center gap-1">
            Mercado cerrado
          </span>
        )}
      </div>

      {/* Product description */}
      {ticker && quote && (() => {
        const cfd = isCfd(ticker)
        const ask = askPrice(quote.price)
        const cost = totalCost(ticker, quote.price, quantity)
        return (
          <div className="mt-3 p-3 bg-slate-800 rounded text-sm">
            <p className="text-slate-300">
              Vas a operar con <span className="font-bold text-white">{quantity}</span>{' '}
              {cfd ? 'contratos' : 'unidades'} de{' '}
              <span className="font-bold text-emerald-400">{tickerName || ticker}</span>
              {cfd && <span className="text-amber-400/80 text-xs ml-1">({cfdLabel(ticker)})</span>}
            </p>
            <div className="mt-1.5 space-y-0.5 text-xs text-slate-400">
              <p>Precio mid: <span className="text-white">{quote.price.toFixed(quote.price < 10 ? 5 : 2)} {quote.currency}</span> · Ask (compra): <span className="text-white">{ask.toFixed(ask < 10 ? 5 : 2)} {quote.currency}</span> <span className="text-slate-600">(+{(SPREAD_PCT * 100).toFixed(2)}% spread)</span></p>
              {cfd && (
                <p>Margen por contrato (5%): <span className="text-white">{marginPerContract(ticker, quote.price).toLocaleString('es-ES', { style: 'currency', currency: quote.currency })}</span></p>
              )}
              <p className="text-slate-300 font-medium">
                {cfd ? 'Margen total' : 'Coste total'}: <span className="text-white">{cost.toLocaleString('es-ES', { style: 'currency', currency: quote.currency })}</span>
              </p>
            </div>
          </div>
        )
      })()}

      {/* Diario de operaciones */}
      <div className="mt-3">
        <label className="text-sm text-slate-400">
          Diario de Trading — ¿por qué abres esta posición? <span className="text-red-400">*</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); if (error && e.target.value.trim()) setError('') }}
          maxLength={500}
          rows={2}
          placeholder="Ej: Soporte en media de 200, RSI sobrevendido, patrón de martillo..."
          className={`block mt-1 w-full px-3 py-2 bg-slate-800 border rounded text-white text-sm focus:outline-none resize-none placeholder:text-slate-500 ${
            error && !notes.trim() ? 'border-red-500 focus:border-red-500' : 'border-slate-600 focus:border-emerald-500'
          }`}
        />
      </div>

      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  )
}
