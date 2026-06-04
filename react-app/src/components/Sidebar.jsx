import { Home, FileText, Settings, BarChart3, UserPlus, ListChecks } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export default function Sidebar({ user }) {
  const getNavClass = ({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`

  return (
    <aside className="sidebar mt-16">
      <div className="sidebar-shell">
        <div className="sidebar-heading">
          <p className="sidebar-title">Navigation</p>
          <p className="sidebar-subtitle">Trust operations</p>
        </div>

        <div className="sidebar-section">
          <NavLink to="/dashboard" className={getNavClass}>
            <Home size={18} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink to="/cases" className={getNavClass}>
            <FileText size={18} />
            <span>Create Case</span>
          </NavLink>

          <NavLink to="/cases/created" className={getNavClass}>
            <ListChecks size={18} />
            <span>Intake Console</span>
          </NavLink>
        </div>

        {user?.role === 'admin' && (
          <div className="sidebar-section">
            <p className="sidebar-group-label">Administration</p>

            <NavLink to="/admin" className={getNavClass}>
              <BarChart3 size={18} />
              <span>Admin</span>
            </NavLink>

            {user?.role === 'admin' && (
              <NavLink to="/register" className={getNavClass}>
                <UserPlus size={18} />
                <span>Create User</span>
              </NavLink>
            )}

            {user?.role === 'admin' && (
              <NavLink to="/admin" className={getNavClass}>
                <Settings size={18} />
                <span>Settings</span>
              </NavLink>
            )}
          </div>
        )}

        <div className="sidebar-foot">
          <span className="foot-dot" />
          <div>
            <p className="foot-title">Secure Mode</p>
            <p className="foot-sub">PQC channels active</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
