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
  arrowDirection: 'up' | 'down'
  moveMode: boolean

  setTicker: (ticker: string) => void
  addDrawing: (drawing: Drawing) => void
  updateDrawing: (id: string, points: DrawingPoint[]) => void
  removeDrawing: (id: string) => void
  clearAll: () => void
  selectTool: (tool: DrawingToolType | null) => void
  addPendingPoint: (point: DrawingPoint) => void
  resetInteraction: () => void
  selectDrawing: (id: string | null) => void
  setElliottWaveType: (type: 'impulse' | 'corrective') => void
  setArrowDirection: (dir: 'up' | 'down') => void
  setMoveMode: (mode: boolean) => void
}

export const useDrawingStore = create<DrawingStore>((set, get) => ({
  ticker: '',
  drawings: [],
  activeTool: null,
  pendingPoints: [],
  selectedId: null,
  elliottWaveType: 'impulse',
  arrowDirection: 'up',
  moveMode: false,

  setTicker: (ticker) => {
    set({ ticker, drawings: load(ticker), selectedId: null })
  },

  addDrawing: (drawing) => {
    const { ticker, drawings } = get()
    const updated = [...drawings, drawing]
    save(ticker, updated)
    set({ drawings: updated, pendingPoints: [], activeTool: null, selectedId: null })
  },

  updateDrawing: (id, points) => {
    const { ticker, drawings } = get()
    const updated = drawings.map((d) => d.id === id ? { ...d, points } : d)
    save(ticker, updated)
    set({ drawings: updated })
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
    set({ activeTool: null, pendingPoints: [], selectedId: null, moveMode: false })
  },

  selectDrawing: (id) => {
    set({ selectedId: id, activeTool: null, moveMode: false })
  },

  setElliottWaveType: (type) => {
    set({ elliottWaveType: type })
  },

  setArrowDirection: (dir) => {
    set({ arrowDirection: dir })
  },

  setMoveMode: (mode) => {
    set({ moveMode: mode })
  },
}))
