import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../context/auth-store'
import { demo } from '../api'
import { BookOpen, FlaskConical, LineChart, MessageCircle, TrendingUp } from 'lucide-react'

export default function Dashboard() {
  const { user } = useAuthStore()
  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: demo.portfolio })

  const cards = [
    { to: '/charts', label: 'Gráficos', desc: 'Analiza acciones con velas japonesas e indicadores', icon: LineChart, color: 'bg-blue-600' },
    { to: '/demo', label: 'Paper Trading', desc: 'Practica compra/venta con dinero ficticio', icon: BookOpen, color: 'bg-emerald-600' },
    { to: '/backtest', label: 'Backtesting', desc: 'Prueba estrategias contra datos históricos', icon: FlaskConical, color: 'bg-purple-600' },
    { to: '/tutor', label: 'Tutor IA', desc: 'Pregunta al tutor basado en los apuntes del curso', icon: MessageCircle, color: 'bg-amber-600' },
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
    </div>
  )
}
