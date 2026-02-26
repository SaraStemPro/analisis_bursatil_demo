import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../context/auth-store'
import { BarChart3, BookOpen, FlaskConical, LineChart, LogOut, MessageCircle, User } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: BarChart3 },
  { to: '/charts', label: 'Gráficos', icon: LineChart },
  { to: '/demo', label: 'Paper Trading', icon: BookOpen },
  { to: '/backtest', label: 'Backtesting', icon: FlaskConical },
  { to: '/tutor', label: 'Tutor IA', icon: MessageCircle },
]

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const location = useLocation()

  return (
    <nav className="bg-slate-900 text-white border-b border-slate-700">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <Link to="/" className="text-lg font-bold text-emerald-400">
          BursatilEdu
        </Link>

        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-1.5 px-3 py-2 rounded text-sm transition-colors ${
                location.pathname === to
                  ? 'bg-slate-700 text-emerald-400'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={16} />
              <span className="hidden md:inline">{label}</span>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link to="/profile" className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white">
            <User size={16} />
            <span className="hidden md:inline">{user?.name}</span>
          </Link>
          <button onClick={logout} className="text-slate-400 hover:text-red-400 transition-colors">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </nav>
  )
}
