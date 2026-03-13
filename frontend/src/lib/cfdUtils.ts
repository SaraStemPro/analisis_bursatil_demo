/** CFD/Futures detection and pricing — mirrors backend logic */

const SPREAD_PCT = 0.0001 // 0.01%
const CFD_MARGIN_PCT = 0.05 // 5%

export function isCfd(ticker: string): boolean {
  const t = ticker.toUpperCase()
  return t.startsWith('^') || t.endsWith('=X') || t.endsWith('=F')
}

/** Notional value per contract. Forex (<10) is multiplied by 10000 */
export function notionalValue(ticker: string, price: number): number {
  if (isCfd(ticker) && price < 10) return price * 10000
  return price
}

/** Ask price (what you pay when buying) = price + spread */
export function askPrice(price: number): number {
  return price * (1 + SPREAD_PCT)
}

/** Spread cost for a given price */
export function spreadCost(price: number): number {
  return price * SPREAD_PCT
}

/** Margin required per contract for CFDs */
export function marginPerContract(ticker: string, price: number): number {
  return notionalValue(ticker, price) * CFD_MARGIN_PCT
}

/** Total cost to open a position */
export function totalCost(ticker: string, price: number, quantity: number): number {
  const ask = askPrice(price)
  if (isCfd(ticker)) {
    return notionalValue(ticker, ask) * quantity * CFD_MARGIN_PCT
  }
  return ask * quantity
}

export function cfdLabel(ticker: string): string {
  const t = ticker.toUpperCase()
  if (t.startsWith('^')) return 'CFD sobre indice'
  if (t.endsWith('=X')) return 'CFD sobre divisa'
  if (t.endsWith('=F')) return 'Futuro'
  return ''
}

export { SPREAD_PCT, CFD_MARGIN_PCT }
