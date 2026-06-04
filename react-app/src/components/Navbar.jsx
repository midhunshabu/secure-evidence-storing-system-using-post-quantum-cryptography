import { LogOut } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export default function Navbar({ user, onLogout }) {
  const navItems =
    user?.role === 'admin'
      ? [
        { to: '/admin', label: 'Admin Panel' },
        { to: '/cases', label: 'Cases' },
        { to: '/register', label: 'Create User' },
      ]
      : [
        { to: '/dashboard', label: 'Dashboard' },
        { to: '/cases', label: 'Cases' },
      ]

  return (
    <nav className="navbar">
      <div className="container mx-auto px-8 h-16 flex items-center justify-between navbar-shell">
        <div className="flex items-center gap-3 brand-block">
          <div className="brand-glyph">
            ◆
          </div>
          <div>
            <h1 className="brand-title">PQC Cases</h1>
            <p className="brand-sub">Forensic Control Interface</p>
          </div>
        </div>

        <div className="navbar-right">
          <div className="top-nav-links">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `top-nav-btn ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="user-chip">
            <span className="nav-user-name">{user?.username}</span>
            <span className="nav-user-role">{user?.role?.replace('_', ' ')}</span>
          </div>
          <button
            onClick={onLogout}
            className="logout-btn"
          >
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
