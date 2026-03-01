export type DrawingToolType = 'trendline' | 'arrow' | 'text' | 'fibonacci' | 'elliott'

export interface DrawingPoint {
  time: string
  price: number
}

interface BaseDrawing {
  id: string
  type: DrawingToolType
  points: DrawingPoint[]
  color: string
  visible: boolean
}

export interface TrendlineDrawing extends BaseDrawing {
  type: 'trendline'
  lineWidth: number
}

export interface ArrowDrawing extends BaseDrawing {
  type: 'arrow'
  direction: 'up' | 'down'
}

export interface TextDrawing extends BaseDrawing {
  type: 'text'
  text: string
  fontSize: number
}

export interface FibonacciDrawing extends BaseDrawing {
  type: 'fibonacci'
  levels: number[]
}

export interface ElliottWaveDrawing extends BaseDrawing {
  type: 'elliott'
  waveType: 'impulse' | 'corrective'
  labels: string[]
}

export type Drawing = TrendlineDrawing | ArrowDrawing | TextDrawing | FibonacciDrawing | ElliottWaveDrawing

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]

export const IMPULSE_LABELS = ['1', '2', '3', '4', '5']
export const CORRECTIVE_LABELS = ['A', 'B', 'C']

export function requiredPoints(type: DrawingToolType): number | null {
  switch (type) {
    case 'arrow':
    case 'text':
      return 1
    case 'trendline':
    case 'fibonacci':
      return 2
    case 'elliott':
      return null // variable, finished by double-click
  }
}
