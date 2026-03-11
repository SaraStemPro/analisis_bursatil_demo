import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../context/auth-store'
import { demo } from '../api'
import { BookOpen, FlaskConical, LineChart, MessageCircle, Search, Trophy, TrendingUp } from 'lucide-react'

export default function Dashboard() {
  const { user } = useAuthStore()
  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: demo.portfolio })
  const { data: ranking } = useQuery({ queryKey: ['ranking'], queryFn: demo.ranking, refetchInterval: 60000 })

  const cards = [
    { to: '/charts', label: 'Gráficos', desc: 'Analiza acciones con velas japonesas e indicadores', icon: LineChart, color: 'bg-blue-600' },
    { to: '/demo', label: 'Paper Trading', desc: 'Practica compra/venta con dinero ficticio', icon: BookOpen, color: 'bg-emerald-600' },
    { to: '/backtest', label: 'Backtesting', desc: 'Prueba estrategias contra datos históricos', icon: FlaskConical, color: 'bg-purple-600' },
    { to: '/screener', label: 'Screener', desc: 'Busca y filtra acciones por fundamentales para construir tu portfolio', icon: Search, color: 'bg-cyan-600' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {user?.name}</h1>
        <p className="text-slate-400 mt-1">Bienvenido a tu plataforma de análisis bursátil</p>
      </div>

      {portfolio && (
        <div className="bg-slate-900 rounded-lg p-5 border border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={20} className="text-emerald-400" />
            <h2 className="font-semibold">Tu portfolio</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-slate-400">Valor total</p>
              <p className="text-lg font-bold">{Number(portfolio.total_value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Saldo disponible</p>
              <p className="text-lg font-bold">{Number(portfolio.balance).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">P&L total</p>
              <p className={`text-lg font-bold ${Number(portfolio.total_pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {Number(portfolio.total_pnl) >= 0 ? '+' : ''}{Number(portfolio.total_pnl).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Rendimiento</p>
              <p className={`text-lg font-bold ${Number(portfolio.total_pnl_pct) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {Number(portfolio.total_pnl_pct) >= 0 ? '+' : ''}{Number(portfolio.total_pnl_pct).toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map(({ to, label, desc, icon: Icon, color }) => (
          <Link
            key={to}
            to={to}
            className="bg-slate-900 rounded-lg p-5 border border-slate-700 hover:border-slate-500 transition-colors group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`${color} p-2 rounded`}>
                <Icon size={20} className="text-white" />
              </div>
              <h3 className="font-semibold group-hover:text-emerald-400 transition-colors">{label}</h3>
            </div>
            <p className="text-sm text-slate-400">{desc}</p>
          </Link>
        ))}
      </div>

      {/* Ranking */}
      {ranking && ranking.length > 0 && (
        <div className="bg-slate-900 rounded-lg p-5 border border-amber-700/50">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={20} className="text-amber-400" />
            <h2 className="font-semibold">Ranking</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-left border-b border-slate-700">
                <th className="pb-2 px-2 w-10">#</th>
                <th className="pb-2 px-2">Usuario</th>
                <th className="pb-2 px-2 text-right">Valor portfolio</th>
                <th className="pb-2 px-2 text-right">Rendimiento</th>
                <th className="pb-2 px-2 text-right">Posiciones</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, idx) => {
                const isMe = r.username === user?.name
                return (
                  <tr key={r.username} className={`border-b border-slate-800 ${isMe ? 'bg-emerald-900/20' : ''}`}>
                    <td className="py-2 px-2 font-medium">
                      {idx === 0 ? <span className="text-amber-400">1</span>
                        : idx === 1 ? <span className="text-slate-300">2</span>
                        : idx === 2 ? <span className="text-amber-700">3</span>
                        : idx + 1}
                    </td>
                    <td className="py-2 px-2">
                      <span className={`font-medium ${isMe ? 'text-emerald-400' : ''}`}>{r.username}</span>
                      {isMe && <span className="text-xs text-emerald-600 ml-1.5">(tú)</span>}
                    </td>
                    <td className="py-2 px-2 text-right font-medium">
                      {r.total_value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${r.total_pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.total_pnl_pct >= 0 ? '+' : ''}{r.total_pnl_pct.toFixed(2)}%
                    </td>
                    <td className="py-2 px-2 text-right text-slate-400">{r.positions_count}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tutor IA — bloque destacado */}
      <Link
        to="/tutor"
        className="block bg-slate-900 rounded-lg p-6 border border-amber-700/50 hover:border-amber-500/70 transition-colors group"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-amber-600 p-3 rounded">
            <MessageCircle size={24} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold group-hover:text-amber-400 transition-colors">Tutor IA</h3>
            <p className="text-sm text-slate-400">Pregunta al tutor basado en los apuntes del curso. Sube PDFs, consulta dudas y repasa conceptos clave de análisis bursátil.</p>
          </div>
        </div>
      </Link>
    </div>
  )
}
