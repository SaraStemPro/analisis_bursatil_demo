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
  pasteMode: boolean
  dragAnchor: DrawingPoint | null
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
  paste: (cursorPoint?: DrawingPoint) => void
  startDrag: () => void
  finishDrag: (target: DrawingPoint) => void
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
  pasteMode: false,
  dragAnchor: null,
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
    set({ activeTool: null, pendingPoints: [], selectedId: null, moveMode: false, pasteMode: false, dragAnchor: null })
  },

  selectDrawing: (id) => {
    set({ selectedId: id, activeTool: null, moveMode: false, dragAnchor: null })
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
    if (drawing) set({ clipboard: structuredClone(drawing), pasteMode: true, selectedId: null })
  },

  paste: (cursorPoint?: DrawingPoint) => {
    const { clipboard, ticker, drawings } = get()
    if (!clipboard) return
    // If cursor position given, center the drawing on it; otherwise offset slightly
    let offsetTime = 0
    let offsetPrice = clipboard.points[0]?.price ? clipboard.points[0].price * 0.02 : 1
    if (cursorPoint && clipboard.points.length > 0) {
      const anchor = clipboard.points[0]
      offsetPrice = cursorPoint.price - anchor.price
      // Time offset: calculate difference in days between cursor and anchor
      const anchorMs = new Date(anchor.time).getTime()
      const cursorMs = new Date(cursorPoint.time).getTime()
      offsetTime = cursorMs - anchorMs
    }
    const newDrawing: Drawing = {
      ...structuredClone(clipboard),
      id: crypto.randomUUID(),
      points: clipboard.points.map((p) => {
        const newPrice = p.price + offsetPrice
        if (offsetTime !== 0) {
          const newMs = new Date(p.time).getTime() + offsetTime
          const d = new Date(newMs)
          const newTime = d.toISOString().split('T')[0]
          return { time: newTime, price: newPrice }
        }
        return { ...p, price: newPrice }
      }),
    } as Drawing
    const updated = [...drawings, newDrawing]
    save(ticker, updated)
    set({ drawings: updated, selectedId: newDrawing.id })
  },

  startDrag: () => {
    const { selectedId, drawings } = get()
    if (!selectedId) return
    const drawing = drawings.find((d) => d.id === selectedId)
    if (!drawing || !drawing.points.length) return
    // Use the first point of the drawing as anchor reference
    set({ moveMode: true, dragAnchor: drawing.points[0] })
  },

  finishDrag: (target) => {
    const { selectedId, dragAnchor, drawings, ticker } = get()
    if (!selectedId || !dragAnchor) {
      set({ moveMode: false, dragAnchor: null })
      return
    }
    const drawing = drawings.find((d) => d.id === selectedId)
    if (!drawing) {
      set({ moveMode: false, dragAnchor: null })
      return
    }
    const dPrice = target.price - dragAnchor.price
    const dTimeMs = new Date(target.time).getTime() - new Date(dragAnchor.time).getTime()
    const newPoints = drawing.points.map((p) => {
      const newPrice = p.price + dPrice
      if (dTimeMs !== 0) {
        const newMs = new Date(p.time).getTime() + dTimeMs
        const d = new Date(newMs)
        return { time: d.toISOString().split('T')[0], price: newPrice }
      }
      return { ...p, price: newPrice }
    })
    const updated = drawings.map((d) => d.id === selectedId ? { ...d, points: newPoints } : d)
    save(ticker, updated)
    set({ drawings: updated, moveMode: false, dragAnchor: null })
  },
}))
