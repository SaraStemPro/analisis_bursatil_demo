import { api } from './client'
import type {
  TokenResponse, User, TickerSearchResult, Quote, HistoryResponse,
  IndicatorDefinition, CalculateResponse, IndicatorRequest, Preset,
  Portfolio, Order, Performance, PortfolioSummary, DetailedQuote,
  ScreenerFilters, ScreenerResult,
  ChatResponse, Conversation, Document,
  Strategy, BacktestRun, BacktestRunSummary, BacktestTrade, StrategyRules,
} from '../types'

// --- Auth ---
export const auth = {
  register: (data: { email: string; password: string; name: string; invite_code: string }) =>
    api.post<User>('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post<TokenResponse>('/auth/login', data),
  me: () => api.get<User>('/auth/me'),
}

// --- Market ---
export const market = {
  search: (q: string) => api.get<TickerSearchResult[]>(`/market/search?q=${encodeURIComponent(q)}`),
  quote: (ticker: string) => api.get<Quote>(`/market/quote/${ticker}`),
  history: (ticker: string, period = '1mo', interval = '1d') =>
    api.get<HistoryResponse>(`/market/history/${ticker}?period=${period}&interval=${interval}`),
  detailedQuote: (ticker: string) => api.get<DetailedQuote>(`/market/detailed-quote/${ticker}`),
  screener: (filters: ScreenerFilters) => api.post<ScreenerResult>('/market/screener', filters),
  screenerSectors: (universe: string) => api.get<{ sectors: string[] }>(`/market/screener/sectors/${universe}`),
}

// --- Indicators ---
export const indicators = {
  catalog: () => api.get<{ indicators: IndicatorDefinition[] }>('/indicators/catalog'),
  calculate: (data: { ticker: string; period: string; interval: string; indicators: IndicatorRequest[] }) =>
    api.post<CalculateResponse>('/indicators/calculate', data),
  getPresets: () => api.get<Preset[]>('/indicators/presets'),
  createPreset: (data: { name: string; indicators: IndicatorRequest[] }) =>
    api.post<Preset>('/indicators/presets', data),
}

// --- Demo ---
export const demo = {
  portfolio: () => api.get<Portfolio>('/demo/portfolio'),
  createOrder: (data: { ticker: string; type: string; quantity: number; price?: number; stop_loss?: number; take_profit?: number }) =>
    api.post<Order>('/demo/order', data),
  closePosition: (data: { ticker: string; quantity: number; side: string }) =>
    api.post<Order>('/demo/close-position', data),
  closeAll: () => api.post<Order[]>('/demo/close-all', {}),
  orders: () => api.get<Order[]>('/demo/orders'),
  performance: () => api.get<Performance>('/demo/performance'),
  portfolioSummary: () => api.get<PortfolioSummary>('/demo/portfolio/summary'),
  reset: (initial_balance = 100000) => api.post<Portfolio>('/demo/reset', { initial_balance }),
}

// --- Tutor ---
export const tutor = {
  chat: (data: { message: string; conversation_id?: string }) =>
    api.post<ChatResponse>('/tutor/chat', data),
  conversations: () => api.get<Conversation[]>('/tutor/conversations'),
  uploadDocument: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<Document>('/tutor/documents', formData)
  },
  documents: () => api.get<Document[]>('/tutor/documents'),
  faq: () => api.get<{ items: { question: string; count: number }[] }>('/tutor/faq'),
}

// --- Backtest ---
export const backtest = {
  templates: () => api.get<Strategy[]>('/backtest/strategies/templates'),
  strategies: () => api.get<Strategy[]>('/backtest/strategies'),
  createStrategy: (data: { name: string; description?: string; rules: StrategyRules }) =>
    api.post<Strategy>('/backtest/strategies', data),
  getStrategy: (id: string) => api.get<Strategy>(`/backtest/strategies/${id}`),
  updateStrategy: (id: string, data: { name?: string; description?: string; rules?: StrategyRules }) =>
    api.put<Strategy>(`/backtest/strategies/${id}`, data),
  deleteStrategy: (id: string) => api.delete<void>(`/backtest/strategies/${id}`),
  run: (data: { strategy_id: string; ticker: string; start_date: string; end_date: string; initial_capital?: number; commission_pct?: number }) =>
    api.post<BacktestRun>('/backtest/run', data),
  runs: () => api.get<BacktestRunSummary[]>('/backtest/runs'),
  getRun: (id: string) => api.get<BacktestRun>(`/backtest/runs/${id}`),
  getRunTrades: (id: string) => api.get<BacktestTrade[]>(`/backtest/runs/${id}/trades`),
  deleteRun: (id: string) => api.delete<void>(`/backtest/runs/${id}`),
  compare: (run_ids: string[]) => api.post<{ runs: BacktestRun[] }>('/backtest/compare', { run_ids }),
}
