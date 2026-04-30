import { useMutation } from '@tanstack/react-query'
import { api } from '../api/client'

export type CorrelationPeriod = '3mo' | '6mo' | '1y' | '2y' | '5y'

export interface CorrelationPair {
  a: string
  b: string
  correlation: number
}

export interface CorrelationResponse {
  tickers: string[]
  period: CorrelationPeriod
  matrix: number[][]
  avg_correlation: number
  max_pair: CorrelationPair
  min_pair: CorrelationPair
  individual_volatilities: number[]
  portfolio_volatility: number
  weighted_avg_volatility: number
  diversification_ratio: number
  weights: number[]
  n_observations: number
  missing_tickers: string[]
}

export interface CorrelationRequest {
  tickers: string[]
  period?: CorrelationPeriod
  weights?: number[]
}

export function useCorrelation() {
  return useMutation<CorrelationResponse, Error, CorrelationRequest>({
    mutationFn: (req) => api.post<CorrelationResponse>('/market/correlation', req),
  })
}
