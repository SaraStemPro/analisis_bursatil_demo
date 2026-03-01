import { create } from 'zustand'
import type { Drawing, DrawingPoint, DrawingToolType } from '../types/drawings'

const STORAGE_PREFIX = 'drawings:'

function load(ticker: string): Drawing[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + ticker)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(ticker: string, drawings: Drawing[]): void {
  localStorage.setItem(STORAGE_PREFIX + ticker, JSON.stringify(drawings))
}

interface DrawingStore {
  ticker: string
  drawings: Drawing[]
  activeTool: DrawingToolType | null
  pendingPoints: DrawingPoint[]
  selectedId: string | null
  elliottWaveType: 'impulse' | 'corrective'

  setTicker: (ticker: string) => void
  addDrawing: (drawing: Drawing) => void
  removeDrawing: (id: string) => void
  clearAll: () => void
  selectTool: (tool: DrawingToolType | null) => void
  addPendingPoint: (point: DrawingPoint) => void
  resetInteraction: () => void
  selectDrawing: (id: string | null) => void
  setElliottWaveType: (type: 'impulse' | 'corrective') => void
}

export const useDrawingStore = create<DrawingStore>((set, get) => ({
  ticker: '',
  drawings: [],
  activeTool: null,
  pendingPoints: [],
  selectedId: null,
  elliottWaveType: 'impulse',

  setTicker: (ticker) => {
    set({ ticker, drawings: load(ticker), selectedId: null })
  },

  addDrawing: (drawing) => {
    const { ticker, drawings } = get()
    const updated = [...drawings, drawing]
    save(ticker, updated)
    set({ drawings: updated, pendingPoints: [], activeTool: null, selectedId: null })
  },

  removeDrawing: (id) => {
    const { ticker, drawings } = get()
    const updated = drawings.filter((d) => d.id !== id)
    save(ticker, updated)
    set({ drawings: updated, selectedId: null })
  },

  clearAll: () => {
    const { ticker } = get()
    save(ticker, [])
    set({ drawings: [], selectedId: null })
  },

  selectTool: (tool) => {
    set({ activeTool: tool, pendingPoints: [], selectedId: null })
  },

  addPendingPoint: (point) => {
    set((state) => ({ pendingPoints: [...state.pendingPoints, point] }))
  },

  resetInteraction: () => {
    set({ activeTool: null, pendingPoints: [], selectedId: null })
  },

  selectDrawing: (id) => {
    set({ selectedId: id, activeTool: null })
  },

  setElliottWaveType: (type) => {
    set({ elliottWaveType: type })
  },
}))
