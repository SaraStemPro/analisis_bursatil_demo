import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../context/auth-store'
import { BarChart3, BookOpen, FlaskConical, LineChart, LogOut, MessageCircle, Search, Shield, User } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: BarChart3 },
  { to: '/charts', label: 'Gráficos', icon: LineChart },
  { to: '/screener', label: 'Screener', icon: Search },
  { to: '/demo', label: 'Paper Trading', icon: BookOpen },
  { to: '/backtest', label: 'Backtesting', icon: FlaskConical },
  { to: '/tutor', label: 'Tutor IA', icon: MessageCircle },
]

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const location = useLocation()

  return (
    <nav className="bg-white text-gray-900 border-b border-gray-300">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <Link to="/" className="text-lg font-bold text-emerald-400">
          AnalisisBursatil
        </Link>

        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-1.5 px-3 py-2 rounded text-sm transition-colors ${
                location.pathname === to
                  ? 'bg-gray-200 text-emerald-400'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon size={16} />
              <span className="hidden md:inline">{label}</span>
            </Link>
          ))}
          {user?.role === 'professor' && (
            <Link
              to="/admin"
              className={`flex items-center gap-1.5 px-3 py-2 rounded text-sm transition-colors ${
                location.pathname === '/admin'
                  ? 'bg-gray-200 text-amber-400'
                  : 'text-amber-500/70 hover:bg-gray-100 hover:text-amber-400'
              }`}
            >
              <Shield size={16} />
              <span className="hidden md:inline">Admin</span>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Link to="/profile" className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900">
            <User size={16} />
            <span className="hidden md:inline">{user?.name}</span>
          </Link>
          <button onClick={logout} className="text-gray-500 hover:text-red-400 transition-colors">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </nav>
  )
}
