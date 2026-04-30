// --- Enums ---
export type UserRole = 'student' | 'professor' | 'admin'
export type OrderType = 'buy' | 'sell' | 'close'
export type OrderStatus = 'open' | 'closed' | 'cancelled'
export type BacktestStatus = 'running' | 'completed' | 'failed'
export type ExitReason = 'signal' | 'stop_loss' | 'take_profit'
export type Comparator = 'greater_than' | 'less_than' | 'crosses_above' | 'crosses_below' | 'between' | 'outside'
export type LogicalOperator = 'AND' | 'OR'
export type ConditionOperandType = 'indicator' | 'price' | 'volume' | 'value' | 'candle_pattern'
export type PriceField = 'open' | 'high' | 'low' | 'close'
export type CandlePattern = 'bullish_engulfing' | 'bearish_engulfing' | 'bullish_hammer' | 'bearish_hammer' | 'bullish_2020' | 'bearish_2020'
export type StopLossType = 'fixed' | 'fractal'

// --- Auth ---
export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  course_id: string | null
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

// --- Market ---
export interface TickerSearchResult {
  symbol: string
  name: string
  exchange: string
  type: string
}

export interface Quote {
  symbol: string
  name: string
  price: number
  change: number
  change_percent: number
  currency: string
  market_state: string
  exchange: string
}

export interface OHLCV {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface HistoryResponse {
  symbol: string
  period: string
  interval: string
  data: OHLCV[]
}

// --- Indicators ---
export interface IndicatorParam {
  name: string
  type: string
  default: number
  min: number | null
  max: number | null
}

export interface IndicatorDefinition {
  name: string
  display_name: string
  category: string
  overlay: boolean
  params: IndicatorParam[]
}

export interface IndicatorRequest {
  name: string
  params: Record<string, number>
}

export interface IndicatorSeries {
  name: string
  params: Record<string, number>
  data: Record<string, (number | null)[]>
}

export interface CalculateResponse {
  ticker: string
  period: string
  interval: string
  indicators: IndicatorSeries[]
  dates?: string[]
}

export interface Preset {
  id: string
  name: string
  indicators: IndicatorRequest[]
  created_at: string
}

// --- Demo ---
export interface Position {
  order_id: string
  ticker: string
  quantity: number
  entry_price: number
  current_price: number
  pnl: number
  pnl_pct: number
  side: 'long' | 'short'
  portfolio_group: string | null
  currency: 'EUR' | 'USD'
  fx_rate_entry: number | null
  fx_rate_current: number | null
  fx_pnl: number | null
  stop_loss: number | null
  take_profit: number | null
  invested_value: number | null
  notes: string | null
  created_at: string | null
}

export interface Portfolio {
  id: string
  balance: number
  initial_balance: number
  total_value: number
  total_pnl: number
  total_pnl_pct: number
  positions: Position[]
  created_at: string
}

export interface Order {
  id: string
  ticker: string
  type: OrderType
  quantity: number
  price: number
  stop_loss: number | null
  take_profit: number | null
  status: OrderStatus
  side: string | null
  pnl: number | null
  portfolio_group: string | null
  notes: string | null
  cost: number | null
  fx_rate: number | null
  created_at: string
  closed_at: string | null
}

export interface Cartera {
  name: string
  positions: { order_id: string; ticker: string; quantity: number; entry_price: number; current_price: number; pnl: number; pnl_pct: number; side: string; currency: string; fx_pnl: number | null; stop_loss?: number | null; take_profit?: number | null; invested_value?: number | null; notes?: string | null; created_at?: string | null }[]
  total_invested: number
  total_current: number
  total_pnl: number
  total_pnl_pct: number
  sectors: number
  diversity_score: number
}

export interface SectorAllocation {
  sector: string
  weight_pct: number
  value: number
}

export interface PortfolioSummary {
  total_value: number
  balance: number
  invested: number
  positions_count: number
  sectors: SectorAllocation[]
  diversity_score: number
}

export interface DetailedQuote {
  symbol: string
  name: string
  price: number
  change_percent: number
  market_cap: number | null
  sector: string | null
  industry: string | null
  pe_ratio: number | null
  forward_pe: number | null
  peg_ratio: number | null
  price_to_book: number | null
  dividend_yield: number | null
  profit_margin: number | null
  roe: number | null
  revenue_growth: number | null
  debt_to_equity: number | null
  beta: number | null
  fifty_two_week_high: number | null
  fifty_two_week_low: number | null
  avg_volume: number | null
  volatility: number | null
  return_1y: number | null
  return_3y: number | null
  max_drawdown: number | null
}

export interface ScreenerFilters {
  universe: 'sp500' | 'ibex35' | 'tech' | 'healthcare' | 'finance' | 'energy' | 'industrials' | 'consumer' | 'indices' | 'currencies' | 'commodities' | 'all'
  sectors?: string[]
  market_cap_min?: number
  market_cap_max?: number
  pe_min?: number
  pe_max?: number
  dividend_min?: number
  dividend_max?: number
  price_min?: number
  price_max?: number
  change_min?: number
  change_max?: number
  beta_min?: number
  beta_max?: number
  volatility_min?: number
  volatility_max?: number
  roe_min?: number
  roe_max?: number
  mdd_min?: number
  mdd_max?: number
}

export interface ScreenerResult {
  universe: string
  total: number
  filtered: number
  stocks: DetailedQuote[]
}

export interface Performance {
  total_return: number
  total_return_pct: number
  sharpe_ratio: number | null
  max_drawdown: number
  max_drawdown_pct: number
  win_rate: number
  total_trades: number
  profitable_trades: number
  losing_trades: number
  best_trade_pnl: number | null
  worst_trade_pnl: number | null
  avg_trade_duration_days: number | null
}

// --- Tutor ---
export interface Source {
  document_id: string
  filename: string
  page: number | null
  chunk_text: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources: Source[] | null
  created_at: string
}

export interface ChatResponse {
  conversation_id: string
  message: Message
}

export interface Conversation {
  id: string
  created_at: string
  last_message: string | null
  message_count: number
}

export interface Document {
  id: string
  filename: string
  course_id: string | null
  uploaded_by: string
  processed: boolean
  uploaded_at: string
}

export interface ConversationMessages {
  id: string
  messages: Message[]
}

// --- Backtest ---
export interface ConditionOperand {
  type: ConditionOperandType
  name?: string
  params?: Record<string, number | string>
  field?: PriceField
  value?: number
  pattern?: CandlePattern
}

export interface Condition {
  left: ConditionOperand
  comparator: Comparator
  right: ConditionOperand
  right_upper?: ConditionOperand
  offset?: number
}

export interface ConditionGroup {
  operator: LogicalOperator
  conditions: Condition[]
}

export interface RiskManagement {
  stop_loss_pct: number | null
  stop_loss_type: StopLossType
  take_profit_pct: number | null
  position_size_pct: number
  max_risk_pct: number | null
}

export type StrategySide = 'long' | 'short' | 'both'

export interface StrategyRules {
  entry: ConditionGroup
  exit: ConditionGroup
  entry_short?: ConditionGroup | null
  exit_short?: ConditionGroup | null
  risk_management: RiskManagement
  side?: StrategySide
}

export interface Strategy {
  id: string
  user_id: string | null
  name: string
  description: string | null
  is_template: boolean
  rules: StrategyRules
  created_at: string
  updated_at: string
}

export interface BacktestMetrics {
  total_return: number
  total_return_pct: number
  annualized_return_pct: number | null
  sharpe_ratio: number | null
  max_drawdown: number
  max_drawdown_pct: number
  win_rate: number
  profit_factor: number | null
  total_trades: number
  avg_trade_duration_days: number | null
  best_trade_pnl: number | null
  worst_trade_pnl: number | null
  buy_and_hold_return_pct: number | null
}

export interface EquityPoint {
  date: string
  equity: number
}

export interface BacktestTrade {
  id: string
  type: OrderType
  entry_date: string
  entry_price: number
  exit_date: string | null
  exit_price: number | null
  quantity: number
  pnl: number | null
  pnl_pct: number | null
  exit_reason: ExitReason | null
  duration_days: number | null
}

export interface BacktestRun {
  id: string
  user_id: string
  strategy_id: string | null
  ticker: string
  start_date: string
  end_date: string
  initial_capital: number
  commission_pct: number
  status: BacktestStatus
  metrics: BacktestMetrics | null
  equity_curve: EquityPoint[] | null
  trades: BacktestTrade[] | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}

export interface BacktestRunSummary {
  id: string
  strategy_id: string | null
  strategy_name: string
  ticker: string
  start_date: string
  end_date: string
  status: BacktestStatus
  total_return_pct: number | null
  total_trades: number | null
  created_at: string
}

// --- Portfolio Backtest (multi-ticker) ---

export interface TickerAllocation {
  ticker: string
  weight_pct: number
}

export interface PortfolioTickerResult {
  ticker: string
  weight_pct: number
  allocated_capital: number
  metrics: BacktestMetrics | null
  trades_count: number
  run_id: string
}

export interface PortfolioBacktestRun {
  id: string
  strategy_name: string
  tickers: string[]
  universe: string | null
  start_date: string
  end_date: string
  initial_capital: number
  commission_pct: number
  portfolio_metrics: BacktestMetrics | null
  equity_curve: EquityPoint[] | null
  ticker_results: PortfolioTickerResult[]
  failed_tickers: string[]
  status: BacktestStatus
  error_message: string | null
  created_at: string
  completed_at: string | null
}

export interface StrategySignal {
  date: string
  type: 'entry_long' | 'entry_short' | 'exit_long' | 'exit_short'
}

export interface SignalsResponse {
  signals: StrategySignal[]
  ticker: string
}

export interface PortfolioRunSummary {
  id: string
  strategy_name: string | null
  ticker_count: number
  universe: string | null
  start_date: string
  end_date: string
  total_return_pct: number | null
  status: BacktestStatus
  created_at: string
}
