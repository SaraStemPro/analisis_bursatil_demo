import { useEffect, Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './context/auth-store'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Charts from './pages/Charts'
import Demo from './pages/Demo'
import Screener from './pages/Screener'
import Backtest from './pages/Backtest'
import Tutor from './pages/Tutor'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import AdminClase from './pages/AdminClase'
import Clase from './pages/Clase'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('ErrorBoundary caught:', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-6 max-w-lg">
            <h2 className="text-red-400 font-bold text-lg mb-2">Error en la aplicacion</h2>
            <pre className="text-red-300 text-sm whitespace-pre-wrap">{this.state.error.message}</pre>
            <pre className="text-red-400/60 text-xs mt-2 whitespace-pre-wrap">{this.state.error.stack}</pre>
            <button onClick={() => this.setState({ error: null })} className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
              Reintentar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Cargando...</div>
  if (!user) return <Navigate to="/login" />
  return <>{children}</>
}

export default function App() {
  const { loadUser } = useAuthStore()

  useEffect(() => { loadUser() }, [loadUser])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute><ErrorBoundary><Layout /></ErrorBoundary></ProtectedRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/charts" element={<Charts />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/screener" element={<Screener />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/tutor" element={<Tutor />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/clase" element={<AdminClase />} />
          <Route path="/clase" element={<Clase />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
