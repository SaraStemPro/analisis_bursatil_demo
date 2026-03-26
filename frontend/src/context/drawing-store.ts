import { create } from 'zustand'
import type { Drawing, DrawingPoint, DrawingToolType } from '../types/drawings'

const STORAGE_PREFIX = 'drawings:'

function load(ticker: string): Drawing[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + ticker)
    if (!raw) return []
    const drawings: Drawing[] = JSON.parse(raw)
    // Migration: default chartId to 'main' for old drawings
    return drawings.map((d) => d.chartId ? d : { ...d, chartId: 'main' })
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
  activeChartId: string
  clipboard: Drawing | null

  setTicker: (ticker: string) => void
  addDrawing: (drawing: Drawing) => void
  updateDrawing: (id: string, points: DrawingPoint[]) => void
  updateDrawingColor: (id: string, color: string) => void
  removeDrawing: (id: string) => void
  clearAll: () => void
  selectTool: (tool: DrawingToolType | null) => void
  addPendingPoint: (point: DrawingPoint) => void
  resetInteraction: () => void
  selectDrawing: (id: string | null) => void
  setElliottWaveType: (type: 'impulse' | 'corrective') => void
  setArrowDirection: (dir: 'up' | 'down') => void
  setMoveMode: (mode: boolean) => void
  setActiveChartId: (chartId: string) => void
  copySelected: () => void
  paste: () => void
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
  activeChartId: 'main',
  clipboard: null,

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

  updateDrawingColor: (id, color) => {
    const { ticker, drawings } = get()
    const updated = drawings.map((d) => d.id === id ? { ...d, color } : d)
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

  setActiveChartId: (chartId) => {
    set({ activeChartId: chartId })
  },

  copySelected: () => {
    const { selectedId, drawings } = get()
    if (!selectedId) return
    const drawing = drawings.find((d) => d.id === selectedId)
    if (drawing) set({ clipboard: structuredClone(drawing) })
  },

  paste: () => {
    const { clipboard, ticker, drawings } = get()
    if (!clipboard) return
    // Offset price slightly so the paste is visible next to the original
    const offset = clipboard.points[0]?.price ? clipboard.points[0].price * 0.02 : 1
    const newDrawing: Drawing = {
      ...structuredClone(clipboard),
      id: crypto.randomUUID(),
      points: clipboard.points.map((p) => ({ ...p, price: p.price + offset })),
    } as Drawing
    const updated = [...drawings, newDrawing]
    save(ticker, updated)
    set({ drawings: updated, selectedId: newDrawing.id })
  },
}))
