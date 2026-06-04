import { useEffect, useState } from 'react'
import {
  CalendarDays,
  Clock3,
  FilePlus,
  FileText,
  Fingerprint,
  KeyRound,
  ListChecks,
  Lock,
  LogOut,
  MapPin,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'

function formatTopbarDate(value) {
  return value.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatTopbarTime(value) {
  return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function Dashboard({ user, onLogout }) {
  const [activeView, setActiveView] = useState('overview')
  const [liveClock, setLiveClock] = useState(() => new Date())

  useEffect(() => {
    const clockId = window.setInterval(() => setLiveClock(new Date()), 30000)
    return () => window.clearInterval(clockId)
  }, [])

  return (
    <div className="dashboard-shell">
      <div className="admin-top-actions">
        <div className="admin-head-actions">
          <div className="user-chip">
            <span className="nav-user-name">{user?.username}</span>
            <span className="nav-user-role">{user?.role?.replace('_', ' ')}</span>
          </div>
          <div className="admin-live-datetime" title="Current local date and time">
            <div className="health-date-chip admin-live-chip">
              <span className="health-date-dot" />
              <span className="health-date-value">{formatTopbarDate(liveClock)}</span>
              <span className="health-date-icon-wrap" aria-hidden="true">
                <CalendarDays size={14} />
              </span>
            </div>
            <div className="health-date-chip admin-live-chip">
              <span className="health-date-dot" />
              <span className="health-date-value">{formatTopbarTime(liveClock)}</span>
              <span className="health-date-icon-wrap" aria-hidden="true">
                <Clock3 size={14} />
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn-outline"
            onClick={() => setActiveView(activeView === 'about' ? 'overview' : 'about')}
          >
            {activeView === 'about' ? 'Overview' : 'About'}
          </button>
          <button className="logout-btn" onClick={onLogout}>
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      <div className="admin-headline">
        <h1 className="text-5xl md:text-6xl font-black uppercase tracking-[0.04em] text-gray-100 mb-2">
          {user?.role === 'court_user' ? 'COURT CONSOLE' : 'INVESTIGATOR PANEL'}
        </h1>
      </div>

      {activeView === 'overview' && (
        <section className="investigator-hero">
          {user?.role === 'court_user' ? (
            <div className="court-entry-panel">
              <div className="court-entry-aura" aria-hidden="true" />
              <div className="court-entry-header">
                <p className="court-entry-kicker">Court User Access</p>
                <h2 className="court-entry-title">Choose an action</h2>
                <p className="court-entry-subtitle">Review accessible case files or submit a new access request.</p>
              </div>
              <div className="court-access-switch court-entry-switch">
                <Link to="/cases/created?view=cases" className="court-access-option">
                  <span className="court-access-option-icon" aria-hidden="true">
                    <FileText size={18} />
                  </span>
                  <span className="court-access-option-copy">
                    <span className="court-access-option-title">Accessible Cases</span>
                    <span className="court-access-option-meta">View authorized case files</span>
                  </span>
                </Link>
                <Link to="/cases/created?view=request" className="court-access-option">
                  <span className="court-access-option-icon" aria-hidden="true">
                    <Lock size={18} />
                  </span>
                  <span className="court-access-option-copy">
                    <span className="court-access-option-title">Request Access</span>
                    <span className="court-access-option-meta">Submit a new access request</span>
                  </span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="investigator-command-center">
              <div className="investigator-command-head">
                <div>
                  <p className="investigator-command-kicker">Investigator Command Center</p>
                  <h2 className="investigator-command-title">Evidence Operations Suite</h2>
                  <p className="investigator-command-subtitle">
                    Execute intake, sealing, verification, and forensic metadata capture with PQC-grade workflows.
                  </p>
                  <p className="investigator-command-note">
                    Assigned cases become visible here after admin approval.
                  </p>
                </div>
                <div className="investigator-command-actions">
                  <Link to="/cases/created" className="btn-primary">
                    My Assigned Cases
                  </Link>
                  <Link to="/cases" className="btn-outline investigator-create-btn">
                    Create Case File
                  </Link>
                </div>
              </div>

              <div className="investigator-tool-grid">
                <div className="investigator-tool-card static">
                  <span className="tool-icon">
                    <FilePlus size={18} />
                  </span>
                  <div className="tool-copy">
                    <p className="tool-title">Evidence Intake Wizard</p>
                    <p className="tool-desc">Structured acquisition with file description and upload controls.</p>
                  </div>
                  <span className="tool-meta">New Evidence Acquisition</span>
                </div>

                <div className="investigator-tool-card static">
                  <span className="tool-icon">
                    <Fingerprint size={18} />
                  </span>
                  <div className="tool-copy">
                    <p className="tool-title">Digital Fingerprint</p>
                    <p className="tool-desc">Local SHA3-512 hashing before upload with progress tracking.</p>
                  </div>
                  <span className="tool-meta">Hashing Console</span>
                </div>

                <div className="investigator-tool-card static">
                  <span className="tool-icon">
                    <KeyRound size={18} />
                  </span>
                  <div className="tool-copy">
                    <p className="tool-title">Quantum Sealer</p>
                    <p className="tool-desc">Seal files for transport using CRYSTALS-Kyber public keys.</p>
                  </div>
                  <span className="tool-meta">Seal for Transport</span>
                </div>

                <div className="investigator-tool-card static">
                  <span className="tool-icon">
                    <ShieldCheck size={18} />
                  </span>
                  <div className="tool-copy">
                    <p className="tool-title">Integrity Heatmap</p>
                    <p className="tool-desc">Real-time shield grid highlighting safe, pending, and tampered files.</p>
                  </div>
                  <span className="tool-meta">Integrity Dashboard</span>
                </div>

                <div className="investigator-tool-card static">
                  <span className="tool-icon">
                    <MapPin size={18} />
                  </span>
                  <div className="tool-copy">
                    <p className="tool-title">Field Notes & Metadata</p>
                    <p className="tool-desc">GPS, device type, category, and immutable intake timestamp.</p>
                  </div>
                  <span className="tool-meta">Forensic Context</span>
                </div>

                <div className="investigator-tool-card static">
                  <span className="tool-icon">
                    <ListChecks size={18} />
                  </span>
                  <div className="tool-copy">
                    <p className="tool-title">Chain of Custody Timeline</p>
                    <p className="tool-desc">Quick access to custody records, signatures, and audit actions.</p>
                  </div>
                  <span className="tool-meta">Audit Trail</span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {activeView === 'about' && (
        <div className="card mb-8">
          <div className="flex flex-col md:flex-row items-start gap-8">
            <div className="p-4 bg-orange/10 rounded-2xl border border-orange/20 shadow-[0_0_15px_rgba(185,239,60,0.15)]">
              <ShieldCheck className="text-orange" size={48} strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-gray-100 mb-6 tracking-tight">
                System Architecture & Security Protocols
              </h2>
              <p className="text-gray-light mb-10 leading-loose text-lg tracking-wide max-w-4xl">
                This platform implements a robust <strong style={{ color: 'var(--accent)' }}>Post-Quantum Cryptography (PQC)</strong> framework designed to secure digital evidence against both classical and quantum computing threats. It adheres to strict Chain of Custody standards, ensuring data integrity and non-repudiation through advanced cryptographic primitives.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-gray-dark/40 rounded-xl border border-gray-light/20 hover:border-gray-light/60 transition-all hover:bg-gray-dark/60 group">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-3 h-3 rounded-full bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.6)] group-hover:scale-110 transition-transform"></div>
                    <p className="text-sm text-gray-100 font-bold tracking-wider uppercase">Data Encryption</p>
                  </div>
                  <p className="text-sm text-gray-400 font-mono tracking-wide">AES-256-GCM (Authenticated Encryption)</p>
                </div>

                <div className="p-6 bg-gray-dark/40 rounded-xl border border-gray-light/20 hover:border-gray-light/60 transition-all hover:bg-gray-dark/60 group">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-3 h-3 rounded-full bg-purple-400 shadow-[0_0_12px_rgba(192,132,252,0.6)] group-hover:scale-110 transition-transform"></div>
                    <p className="text-sm text-gray-100 font-bold tracking-wider uppercase">Key Encapsulation</p>
                  </div>
                  <p className="text-sm text-gray-400 font-mono tracking-wide">CRYSTALS-Kyber512 (NIST Level 1)</p>
                </div>

                <div className="p-6 bg-gray-dark/40 rounded-xl border border-gray-light/20 hover:border-gray-light/60 transition-all hover:bg-gray-dark/60 group">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-3 h-3 rounded-full bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.6)] group-hover:scale-110 transition-transform"></div>
                    <p className="text-sm text-gray-100 font-bold tracking-wider uppercase">Digital Signatures</p>
                  </div>
                  <p className="text-sm text-gray-400 font-mono tracking-wide">CRYSTALS-Dilithium2 (Strong Unforgeability)</p>
                </div>

                <div className="p-6 bg-gray-dark/40 rounded-xl border border-gray-light/20 hover:border-gray-light/60 transition-all hover:bg-gray-dark/60 group">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-3 h-3 rounded-full bg-orange shadow-[0_0_12px_rgba(255,165,0,0.6)] group-hover:scale-110 transition-transform"></div>
                    <p className="text-sm text-gray-100 font-bold tracking-wider uppercase">Access Control</p>
                  </div>
                  <p className="text-sm text-gray-400 font-mono tracking-wide">Role-Based (RBAC) + JWT w/ Challenge</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
