import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  LogOut,
  Cpu,
  ScrollText,
  Shield,
  UserPlus,
  FileText,
  Users,
  UserCog,
  XCircle,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { adminAPI, evidenceAPI } from '../api'
import CustomSelect from './CustomSelect'

const ADMIN_MODULES = new Set(['overview', 'intake', 'health', 'alerts', 'users', 'pqc'])

function resolveRequestedModule(role, search = '') {
  if (role === 'auditor') return 'alerts'
  const requestedModule = new URLSearchParams(search).get('module')
  if (requestedModule && ADMIN_MODULES.has(requestedModule)) {
    return requestedModule
  }
  return 'overview'
}

function formatTimestamp(value) {
  if (!value) return 'N/A'
  const raw = String(value)
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(raw)
  const normalized = hasTimezone ? raw : `${raw}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return raw
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd} | ${hh}:${min}`
}

function parseServerDate(value) {
  if (!value) return null
  const raw = String(value)
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(raw)
  const normalized = hasTimezone ? raw : `${raw}Z`
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isPrivateOrLocalIp(ip) {
  const text = String(ip || '').trim().toLowerCase()
  if (!text) return false
  if (text === '::1' || text === 'localhost') return true
  if (text.startsWith('10.')) return true
  if (text.startsWith('192.168.')) return true
  if (text.startsWith('127.')) return true
  const parts = text.split('.')
  if (parts.length === 4) {
    const a = Number(parts[0])
    const b = Number(parts[1])
    if (a === 172 && b >= 16 && b <= 31) return true
  }
  return false
}

function compactUserAgent(ua) {
  const text = String(ua || '').trim()
  if (!text) return 'N/A'
  if (text.includes('Windows')) return 'Windows client'
  if (text.includes('Macintosh')) return 'macOS client'
  if (text.includes('Linux')) return 'Linux client'
  if (text.includes('Android')) return 'Android client'
  if (text.includes('iPhone') || text.includes('iPad')) return 'iOS client'
  return 'Unknown client'
}

function activityStatusMeta(lastActivityAt, lastLogin, isActive, nowMs = Date.now()) {
  if (!isActive) {
    return { label: 'Deactivated', tone: 'inactive' }
  }
  const parsedActivity = parseServerDate(lastActivityAt)
  const parsedLogin = parseServerDate(lastLogin)
  const reference = [parsedActivity, parsedLogin]
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0]
  if (!reference) {
    return { label: 'Never logged in', tone: 'never' }
  }
  const deltaMs = Math.max(0, nowMs - reference.getTime())
  if (deltaMs < 5 * 60 * 1000) {
    return { label: 'Active now', tone: 'live' }
  }
  const minutes = Math.floor(deltaMs / (60 * 1000))
  if (minutes < 60) {
    return { label: `Active ${minutes}m ago`, tone: minutes <= 10 ? 'active' : 'stale' }
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return { label: `Active ${hours}h ago`, tone: 'stale' }
  }
  const days = Math.floor(hours / 24)
  return { label: `Active ${days}d ago`, tone: 'stale' }
}

function parseAuditDetails(rawDetails) {
  if (!rawDetails) return {}
  if (typeof rawDetails === 'object') return rawDetails
  try {
    const parsed = JSON.parse(String(rawDetails))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function auditLogMeta(log) {
  const details = parseAuditDetails(log?.details)
  const attemptedUsername = String(
    details?.username || details?.attempted_username || ''
  ).trim()
  const reason = String(details?.reason || '').trim()
  const actor = String(log?.user?.username || '').trim() || attemptedUsername || 'System'
  const ip = String(log?.ip_address || '').trim()
  const userAgent = String(log?.user_agent || '').trim()
  return { actor, attemptedUsername, reason, ip, userAgent }
}

function formatAuditActionLabel(action) {
  const raw = String(action || '').trim()
  if (!raw) return 'N/A'
  const normalized = raw.toLowerCase()
  if (normalized === 'user_delete_access' || normalized === 'user_deactivate') {
    return 'USER DEACTIVATED'
  }
  if (normalized === 'user_deleted_permanent') {
    return 'USER DELETED (PERMANENT)'
  }
  if (normalized === 'pqid_view') {
    return 'PQID VIEWED'
  }
  return raw.toUpperCase()
}

function auditTargetLine(log) {
  const action = String(log?.action || '').toLowerCase()
  if (action !== 'pqid_view') return ''
  const details = parseAuditDetails(log?.details)
  const target = String(details?.target_username || '').trim()
  if (!target) return ''
  const actor = auditLogMeta(log).actor
  if (!actor) return `Viewed ${target}'s PQID`
  return `${actor} viewed ${target}'s PQID`
}

function backupIssueHeading(issue) {
  const kind = String(issue?.issue || '').toLowerCase()
  if (kind === 'deleted') return 'Deleted audit log'
  if (kind === 'modified') return 'Modified audit log'
  return 'Audit anomaly'
}

function backupIssueSnapshot(issue) {
  return issue?.current || issue?.baseline || null
}

const CRITICAL_ALERT_TOKENS = [
  'signature_verification_failed',
  'integrity_check_failed',
  'tamper_attempt',
  'decryption_failed',
]

const REPEATED_ALERT_POLICIES = [
  { tokens: ['login_attempt'], ipThreshold: 1, userThreshold: 1 },
  { tokens: ['token_refresh'], ipThreshold: 3, userThreshold: 3 },
  { tokens: ['evidence_view', 'custody_chain_view'], ipThreshold: 3, userThreshold: 3 },
]

const ONE_HOUR_MS = 60 * 60 * 1000

function actionMatchesTokens(actionText, tokens = []) {
  const normalized = String(actionText || '').toLowerCase()
  if (!normalized) return false
  return tokens.some((token) => normalized.includes(token))
}

function isFailureStatus(log) {
  return String(log?.status || '').toLowerCase() === 'failure'
}

function securityAlertType(log) {
  const action = String(log?.action || '').toLowerCase()
  if (action.includes('login_attempt')) return 'login_attempt'
  if (action.includes('token_refresh')) return 'token_refresh'
  if (action.includes('evidence_approve') || action.includes('evidence_deny')) return 'evidence_approval_failure'
  if (action.includes('evidence_upload')) return 'evidence_upload_failure'
  if (action.includes('evidence_view') || action.includes('custody_chain_view')) return 'evidence_access_failure'
  if (action.includes('user_registration')) return 'identity_provision_failure'
  if (action.includes('signature_verification_failed')) return 'signature_verification_failed'
  if (action.includes('integrity_check_failed')) return 'integrity_check_failed'
  if (action.includes('tamper_attempt')) return 'tamper_attempt'
  if (action.includes('decryption_failed')) return 'decryption_failed'
  if (action.includes('api_request')) return 'api_request_failure'
  return 'generic_security_failure'
}

function failureCountByIp(contextLogs, currentLog, windowMs = 60 * 60 * 1000, actionTokens = []) {
  const currentMeta = auditLogMeta(currentLog)
  const currentTs = parseServerDate(currentLog?.timestamp)
  if (!currentMeta.ip || !currentTs) return 0
  const tokenList = Array.isArray(actionTokens) ? actionTokens.filter(Boolean) : []
  return contextLogs.filter((entry) => {
    const entryMeta = auditLogMeta(entry)
    if (entryMeta.ip !== currentMeta.ip) return false
    if (!isFailureStatus(entry)) return false
    if (tokenList.length > 0 && !actionMatchesTokens(entry?.action, tokenList)) return false
    const ts = parseServerDate(entry?.timestamp)
    if (!ts) return false
    return Math.abs(currentTs.getTime() - ts.getTime()) <= windowMs
  }).length
}

function failureCountByUsername(contextLogs, currentLog, windowMs = 60 * 60 * 1000, actionTokens = []) {
  const currentMeta = auditLogMeta(currentLog)
  const currentTs = parseServerDate(currentLog?.timestamp)
  const username = String(currentMeta.attemptedUsername || currentMeta.actor || '').trim().toLowerCase()
  if (!username || !currentTs) return 0
  const tokenList = Array.isArray(actionTokens) ? actionTokens.filter(Boolean) : []
  return contextLogs.filter((entry) => {
    if (!isFailureStatus(entry)) return false
    const entryMeta = auditLogMeta(entry)
    const entryUser = String(entryMeta.attemptedUsername || entryMeta.actor || '').trim().toLowerCase()
    if (!entryUser || entryUser !== username) return false
    if (tokenList.length > 0 && !actionMatchesTokens(entry?.action, tokenList)) return false
    const ts = parseServerDate(entry?.timestamp)
    if (!ts) return false
    return Math.abs(currentTs.getTime() - ts.getTime()) <= windowMs
  }).length
}

function actionTokensForAlertType(alertType, log) {
  if (alertType === 'login_attempt') return ['login_attempt']
  if (alertType === 'token_refresh') return ['token_refresh']
  if (alertType === 'evidence_access_failure') return ['evidence_view', 'custody_chain_view']
  const action = String(log?.action || '').toLowerCase()
  return action ? [action] : []
}

function shouldSurfaceSecurityAlert(log, contextLogs = []) {
  const action = String(log?.action || '').toLowerCase()
  const chainStatus = String(log?.chain_status || '').toLowerCase()

  if (chainStatus === 'tampered') return true
  if (CRITICAL_ALERT_TOKENS.some((token) => action.includes(token))) return true
  if (!isFailureStatus(log)) return false

  const repeatPolicy = REPEATED_ALERT_POLICIES.find((policy) => actionMatchesTokens(action, policy.tokens))
  if (!repeatPolicy) return false

  const ipFailures = failureCountByIp(contextLogs, log, ONE_HOUR_MS, repeatPolicy.tokens)
  const userFailures = failureCountByUsername(contextLogs, log, ONE_HOUR_MS, repeatPolicy.tokens)
  return ipFailures >= repeatPolicy.ipThreshold || userFailures >= repeatPolicy.userThreshold
}

function describeFailureReason(reasonCode, fallbackText) {
  const code = String(reasonCode || '').trim().toLowerCase()
  const reasonMap = {
    invalid_credentials: 'Invalid username or password was submitted.',
    user_inactive: 'The account is currently inactive, so login was blocked.',
    session_not_found: 'Refresh token session record was not found on the server.',
    session_revoked_or_expired: 'Refresh session is revoked or already expired.',
    user_inactive_or_missing: 'Refresh token belongs to an inactive or missing user.',
  }
  if (code && reasonMap[code]) return reasonMap[code]
  if (fallbackText) return fallbackText
  return 'No explicit failure reason was provided by the API.'
}

function SecurityAlertDetails({ log, contextLogs = [] }) {
  const meta = auditLogMeta(log)
  const details = parseAuditDetails(log?.details)
  const action = String(log?.action || '')
  const alertType = securityAlertType(log)
  const status = String(log?.status || '').toLowerCase() === 'success' ? 'Success' : 'Failure'
  const actionTokens = actionTokensForAlertType(alertType, log)
  const sameIpFailures1h = failureCountByIp(contextLogs, log, ONE_HOUR_MS, actionTokens)
  const sameUserFailures1h = failureCountByUsername(contextLogs, log, ONE_HOUR_MS, actionTokens)
  const networkZone = isPrivateOrLocalIp(meta.ip) ? 'Private/Local' : 'Public'
  const riskSignal =
    status === 'Failure' && sameIpFailures1h >= 5
      ? 'High'
      : status === 'Failure' && sameIpFailures1h >= 3
        ? 'Medium'
        : 'Low'

  const reasonCode = details?.reason || meta.reason
  const reasonText = describeFailureReason(reasonCode, String(meta.reason || '').trim())
  const endpoint = details?.path ? `${String(details.method || 'UNKNOWN').toUpperCase()} ${details.path}` : 'N/A'
  const statusCode = details?.status_code ?? 'N/A'
  const resourceRef = log?.resource_type
    ? `${log.resource_type}${log?.resource_id ? `:${log.resource_id}` : ''}`
    : 'N/A'
  const caseId = details?.case_id || details?.caseId
  const filename = details?.filename
  const fileHash = details?.file_hash || details?.expected_hash
  const observedHash = details?.observed_hash
  const sigAlgorithm = details?.sig_algorithm
  const sigCandidates = Array.isArray(details?.sig_candidates)
    ? details.sig_candidates.filter(Boolean).join(', ')
    : ''

  const block = (title, summary, observations = []) => (
    <>
      <div><strong>Alert Type:</strong> {title}</div>
      <div><strong>Summary:</strong> {summary}</div>
      {observations.map((line, idx) => (
        <div key={`${title}-${idx}`}><strong>Detail:</strong> {line}</div>
      ))}
    </>
  )

  return (
    <div className="log-details-panel">
      {alertType === 'login_attempt' && block(
        'Login Authentication Failure',
        `A login attempt was rejected for ${meta.attemptedUsername || meta.actor || 'an unknown account target'}.`,
        [
          reasonText,
          `Observed ${sameIpFailures1h} failed attempts from this IP and ${sameUserFailures1h} for this username in the past hour.`,
          riskSignal === 'High'
            ? 'Pattern indicates possible brute-force activity and should be investigated immediately.'
            : 'Failure pattern is limited but still worth monitoring for escalation.',
        ]
      )}
      {alertType === 'token_refresh' && block(
        'Refresh Session Validation Failure',
        'A refresh-token exchange failed, indicating session state mismatch or expiry.',
        [
          reasonText,
          'This can happen after legitimate token expiry, but repeated failures may indicate stale or replayed session tokens.',
        ]
      )}
      {alertType === 'evidence_approval_failure' && block(
        'Evidence Approval Workflow Failure',
        'An admin approval/rejection operation failed during custody workflow processing.',
        [
          'Approval state transition did not complete cleanly for the referenced evidence record.',
          'Review related custody signatures and admin permissions before retrying the workflow action.',
        ]
      )}
      {alertType === 'evidence_upload_failure' && block(
        'Evidence Upload Security Failure',
        'An evidence upload operation failed during secure ingestion.',
        [
          'Possible causes include encryption/signature generation issues, invalid file payload, or missing key material.',
          'Confirm uploader PQC key availability and validate the uploaded artifact format.',
        ]
      )}
      {alertType === 'evidence_access_failure' && block(
        'Evidence Access Validation Failure',
        'An evidence access/read operation failed in protected retrieval flow.',
        [
          'The request may have failed due to permission checks, key mismatch, or integrity enforcement.',
          'Correlate with custody records and user role permissions for this resource.',
        ]
      )}
      {alertType === 'identity_provision_failure' && block(
        'Identity Provisioning Failure',
        'User provisioning encountered a failure during account creation workflow.',
        [
          'This can indicate validation errors, duplicate identity data, or cryptographic key setup failure.',
          'Verify registration payload, uniqueness constraints, and PQC key generation health.',
        ]
      )}
      {alertType === 'signature_verification_failed' && block(
        'Signature Verification Failure',
        'Cryptographic signature verification failed during evidence integrity checks.',
        [
          'The signed payload did not validate against the expected public signature key.',
          'Treat this as a high-confidence integrity alert and verify evidence provenance before further access.',
        ]
      )}
      {alertType === 'integrity_check_failed' && block(
        'Hash-Chain Integrity Failure',
        'A record failed integrity verification checks against expected hash-chain values.',
        [
          'This may indicate record tampering, corruption, or chain discontinuity.',
          'Re-run integrity validation and compare neighboring chain hashes for break-point analysis.',
        ]
      )}
      {alertType === 'tamper_attempt' && block(
        'Tamper Attempt Detected',
        'A tamper-related action was recorded and flagged as suspicious.',
        [
          'This event indicates potential unauthorized modification behavior around protected data.',
          'Correlate this timestamp with user activity and custody-chain transitions.',
        ]
      )}
      {alertType === 'decryption_failed' && block(
        'Decryption Operation Failure',
        'Evidence decryption failed during an access attempt.',
        [
          'Likely causes include key mismatch, corrupted encrypted payload, or malformed cryptographic parameters.',
          'Validate KEM key material and compare encrypted artifact hashes with stored metadata.',
        ]
      )}
      {alertType === 'api_request_failure' && block(
        'Protected API Request Failure',
        'A protected API call returned an error response during an authenticated workflow.',
        [
          `Endpoint: ${endpoint} returned status ${statusCode}.`,
          'Repeated failures on sensitive endpoints may indicate probing or privilege misuse.',
        ]
      )}
      {alertType === 'generic_security_failure' && block(
        'General Security Failure',
        'A failed security-relevant event was detected and flagged for review.',
        [
          reasonText,
          'Review associated action metadata and server error text for deeper root-cause analysis.',
        ]
      )}
      <div><strong>Action:</strong> {formatAuditActionLabel(action)}</div>
      <div><strong>Status:</strong> {status}</div>
      <div><strong>Actor:</strong> {meta.actor || 'N/A'}</div>
      <div><strong>Username Target:</strong> {meta.attemptedUsername || 'N/A'}</div>
      <div><strong>IP Address:</strong> {meta.ip || 'N/A'} ({networkZone})</div>
      <div><strong>Risk Signal:</strong> {riskSignal}</div>
      <div><strong>Client:</strong> {compactUserAgent(meta.userAgent)}</div>
      <div><strong>User Agent:</strong> {meta.userAgent || 'N/A'}</div>
      <div><strong>Resource:</strong> {resourceRef}</div>
      {caseId && <div><strong>Case ID:</strong> {caseId}</div>}
      {filename && <div><strong>Filename:</strong> {filename}</div>}
      {fileHash && <div><strong>File Hash:</strong> {fileHash}</div>}
      {observedHash && <div><strong>Observed Hash:</strong> {observedHash}</div>}
      {sigAlgorithm && <div><strong>Signature Algorithm:</strong> {sigAlgorithm}</div>}
      {sigCandidates && <div><strong>Signature Candidates:</strong> {sigCandidates}</div>}
      <div><strong>Error Message:</strong> {log?.error_message || 'N/A'}</div>
      <div><strong>Chain Status:</strong> {log?.chain_status || 'unknown'}</div>
    </div>
  )
}

function todayIsoDate() {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isTodayLocal(dateValue) {
  return dateValue === todayIsoDate()
}

function clientTzOffsetMinutes() {
  return new Date().getTimezoneOffset()
}

function daysFromToday(dateValue) {
  const parts = String(dateValue || '').split('-')
  if (parts.length !== 3) return 0
  const y = Number(parts[0])
  const m = Number(parts[1]) - 1
  const d = Number(parts[2])
  const selected = new Date(y, m, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (Number.isNaN(selected.getTime())) return 0
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((selected.getTime() - today.getTime()) / msPerDay)
}

function healthDayLabel(dateValue) {
  const diff = daysFromToday(dateValue)
  if (diff === 0) return 'Live Today'
  const abs = Math.abs(diff)
  const suffix = abs === 1 ? 'day' : 'days'
  return `${abs} ${suffix} ago`
}

function formatHealthDate(dateValue) {
  const parts = String(dateValue || '').split('-')
  if (parts.length !== 3) return dateValue || 'Select date'
  const year = Number(parts[0])
  const month = Number(parts[1]) - 1
  const day = Number(parts[2])
  const parsed = new Date(year, month, day)
  if (Number.isNaN(parsed.getTime())) return dateValue
  return parsed.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatHealthTime(dateValue) {
  return dateValue.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatTopbarDate(dateValue) {
  return dateValue.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDurationFromMinutes(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min`
  if (hours > 0) return `${hours} hr`
  return `${minutes} min`
}

function formatPercentOneDecimal(value) {
  const n = Number(value || 0)
  if (Number.isNaN(n)) return "0.0%"
  return `${n.toFixed(1)}%`
}

function integrityStorageKey(userId) {
  return `integrity_check_state_${userId}`
}

function SystemHealthChart({ points = [], selectedHour = null, onHourClick }) {
  const startLabel = points.length > 0 ? points[0].label : '--:--'
  const endLabel = points.length > 0 ? points[points.length - 1].label : '--:--'
  const yTicks = [100, 75, 50, 25, 0]

  return (
    <div className="health-chart-wrap">
      <div className="health-chart-meta">
        <span className="health-chart-range">{startLabel} to {endLabel}</span>
        <span className="health-chart-interval">Hourly server load (%)</span>
      </div>
      <div className="health-chart-shell">
        <div className="health-y-axis" aria-hidden="true">
          {yTicks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <div
          className="health-chart"
          style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(0, 1fr))` }}
        >
          {points.map((point, idx) => {
            const showTick = idx === 0 || idx === points.length - 1 || idx % 3 === 0
            const pct = Number(point.avg_load_pct ?? point.percentage ?? 0)
            const coverage = Number(point.coverage_pct || 0)
            const sampledMinutes = Number(point.sampled_minutes || 0)
            const consideredMinutes = Number(point.considered_minutes || 0)
            const hasSamples = sampledMinutes > 0
            const height = hasSamples ? Math.max(3, pct) : 2
            const isSelected = selectedHour === point.hour
            return (
              <div key={`${idx}-${point.hour}-${pct}`} className="health-bar-col">
                <button
                  type="button"
                  className={`health-hour-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => onHourClick?.(point.hour)}
                  title={`Hour ${point.label} | avg load ${pct}% | uptime ${point.uptime_pct || 0}% | sampled ${sampledMinutes}/${consideredMinutes} min (${coverage}% coverage)`}
                >
                  <div
                    className={`health-bar ${hasSamples ? 'is-on' : 'is-empty'}`}
                    style={{ height: `${height}%` }}
                  />
                </button>
                {showTick && <span className="health-tick">{point.label}</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MinuteHealthChart({ points = [], hour }) {
  const yTicks = [100, 75, 50, 25, 0]

  return (
    <div className="minute-chart-wrap">
      <div className="health-chart-meta">
        <span className="health-chart-range">{String(hour).padStart(2, '0')}:00 to {String(hour).padStart(2, '0')}:59</span>
        <span className="health-chart-interval">Minute server load (%)</span>
      </div>
      <div className="minute-chart-shell">
        <div className="minute-y-axis" aria-hidden="true">
          {yTicks.map((tick) => (
            <span key={tick}>{tick}%</span>
          ))}
        </div>
        <div
          className="minute-chart"
          style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(7px, 1fr))` }}
        >
          {points.map((point, idx) => {
            const showTick = idx === 0 || idx === 59 || idx % 5 === 0
            const pct = Number(point.percentage || 0)
            const hasSample = Boolean(point.has_sample)
            const height = hasSample ? Math.max(3, pct) : 2
            return (
              <div key={`${point.minute}-${point.percentage}`} className="minute-col">
                <div
                  className={`minute-bar ${hasSample ? 'is-on' : 'is-empty'}`}
                  style={{ height: `${height}%` }}
                  title={hasSample ? `${point.label} | load ${pct}%` : `${point.label} | no heartbeat sample`}
                />
                {showTick && <span className="minute-tick">{point.label.slice(-2)}</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
export default function Admin({ user, onLogout }) {
  const location = useLocation()
  const [error, setError] = useState('')
  const [overview, setOverview] = useState(null)
  const [caseApprovals, setCaseApprovals] = useState([])
  const [caseApprovalsLoading, setCaseApprovalsLoading] = useState(false)
  const [courtRequests, setCourtRequests] = useState([])
  const [courtRequestsLoading, setCourtRequestsLoading] = useState(false)
  const [users, setUsers] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [expandedUserId, setExpandedUserId] = useState(null)
  const [userDrafts, setUserDrafts] = useState({})
  const [actionBusy, setActionBusy] = useState(false)
  const [activeModule, setActiveModule] = useState(() => resolveRequestedModule(user?.role, location.search))
  const [overviewQueue, setOverviewQueue] = useState('court')
  const [courtRequestFilter, setCourtRequestFilter] = useState('pending')
  const [caseApprovalFilter, setCaseApprovalFilter] = useState('pending')
  const [healthDate, setHealthDate] = useState(todayIsoDate())
  const [healthPoints, setHealthPoints] = useState([])
  const [selectedHealthHour, setSelectedHealthHour] = useState(null)
  const [healthMinutePoints, setHealthMinutePoints] = useState([])
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthMinuteLoading, setHealthMinuteLoading] = useState(false)
  const [healthSummary, setHealthSummary] = useState(null)
  const [integrityChecking, setIntegrityChecking] = useState(false)
  const [integrityCheckedAt, setIntegrityCheckedAt] = useState(null)
  const [integritySummary, setIntegritySummary] = useState({ total: 0, verified: 0, tampered: 0 })
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupResult, setBackupResult] = useState(null)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [healthClock, setHealthClock] = useState(() => new Date())
  const [expandedAlertLogId, setExpandedAlertLogId] = useState(null)
  const [roleEditUserId, setRoleEditUserId] = useState(null)
  const [activityNowMs, setActivityNowMs] = useState(() => Date.now())
  const [logsDate, setLogsDate] = useState(todayIsoDate())
  const healthDateInputRef = useRef(null)
  const [pqidCopiedId, setPqidCopiedId] = useState(null)
  const pqidCopyTimerRef = useRef(null)
  const [pqidRevealMap, setPqidRevealMap] = useState({})
  const [pqidPromptOpen, setPqidPromptOpen] = useState(false)
  const [pqidPromptUser, setPqidPromptUser] = useState(null)
  const [pqidPromptValue, setPqidPromptValue] = useState('')
  const [pqidPromptError, setPqidPromptError] = useState('')
  const [pqidPromptBusy, setPqidPromptBusy] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportFromDate, setExportFromDate] = useState(todayIsoDate())
  const [exportFromTime, setExportFromTime] = useState('00:00')
  const [exportToDate, setExportToDate] = useState(todayIsoDate())
  const [exportToTime, setExportToTime] = useState('23:59')
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState('')

  const loadAdminData = async () => {
    setError('')
    try {
      if (user?.role === 'auditor') {
        const logsRes = await adminAPI.getAuditLogs({ date: logsDate, tz_offset_minutes: clientTzOffsetMinutes() })
        setOverview(null)
        setUsers([])
        setAuditLogs(logsRes.data.logs || [])
      } else {
        const requestedModule = resolveRequestedModule(user?.role, location.search)
        const shouldLoadLogs = requestedModule === 'alerts'
        const [overviewRes, usersRes, logsRes] = await Promise.all([
          adminAPI.overview(),
          adminAPI.listUsers(),
          shouldLoadLogs
            ? adminAPI.getAuditLogs({ date: logsDate, tz_offset_minutes: clientTzOffsetMinutes() })
            : Promise.resolve(null),
        ])
        setOverview(overviewRes.data || null)
        setUsers(usersRes.data.users || [])
        if (shouldLoadLogs) {
          setAuditLogs(logsRes?.data?.logs || [])
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initialize ADMIN CONSOLE')
    }
  }

  const handleCopyPqid = async (pqid, userId) => {
    if (!pqid) return
    try {
      await navigator.clipboard.writeText(pqid)
      if (pqidCopyTimerRef.current) {
        window.clearTimeout(pqidCopyTimerRef.current)
      }
      setPqidCopiedId(userId)
      pqidCopyTimerRef.current = window.setTimeout(() => {
        setPqidCopiedId(null)
        pqidCopyTimerRef.current = null
      }, 2000)
    } catch {
      // No clipboard access; ignore silently.
    }
  }

  const openPqidPrompt = (targetUser) => {
    if (!targetUser) return
    setPqidPromptUser(targetUser)
    setPqidPromptValue('')
    setPqidPromptError('')
    setPqidPromptOpen(true)
  }

  const closePqidPrompt = () => {
    if (pqidPromptBusy) return
    setPqidPromptOpen(false)
    setPqidPromptUser(null)
    setPqidPromptValue('')
    setPqidPromptError('')
  }

  const handleRevealPqid = async () => {
    if (!pqidPromptUser) return
    const password = String(pqidPromptValue || '').trim()
    if (!password) {
      setPqidPromptError('Password is required to view the PQID.')
      return
    }
    setPqidPromptBusy(true)
    setPqidPromptError('')
    try {
      const response = await adminAPI.getUserPqid(pqidPromptUser.id, password)
      const pqid = response.data?.pqid
      if (pqid) {
        setPqidRevealMap((prev) => ({ ...prev, [pqidPromptUser.id]: pqid }))
      }
      if (activeModule === 'alerts') {
        const logsRes = await adminAPI.getAuditLogs({ date: logsDate, tz_offset_minutes: clientTzOffsetMinutes() })
        setAuditLogs(logsRes.data?.logs || [])
      }
      setPqidPromptOpen(false)
      setPqidPromptUser(null)
      setPqidPromptValue('')
    } catch (err) {
      setPqidPromptError(err.response?.data?.error || 'Password verification failed.')
    } finally {
      setPqidPromptBusy(false)
    }
  }

  const handleHidePqid = (userId) => {
    setPqidRevealMap((prev) => {
      if (!prev[userId]) return prev
      const next = { ...prev }
      delete next[userId]
      return next
    })
    if (pqidCopiedId === userId) {
      setPqidCopiedId(null)
    }
  }

  useEffect(() => {
    loadAdminData()
  }, [user?.role])

  useEffect(() => {
    return () => {
      if (pqidCopyTimerRef.current) {
        window.clearTimeout(pqidCopyTimerRef.current)
        pqidCopyTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    setActiveModule(resolveRequestedModule(user?.role, location.search))
  }, [location.search, user?.role])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadAdminData()
      }
    }
    const handleFocus = () => {
      loadAdminData()
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [user?.role, location.search, logsDate])

  const usersByRole = useMemo(() => {
    const grouped = { admin: [], investigator: [], court_user: [] }
    users.forEach((entry) => {
      const key = grouped[entry.role] ? entry.role : 'investigator'
      grouped[key].push(entry)
    })
    return grouped
  }, [users])

  const alertLogs = useMemo(
    () => auditLogs.filter((log) => shouldSurfaceSecurityAlert(log, auditLogs)),
    [auditLogs]
  )

  const onlineMinutes = healthSummary?.online_minutes ?? 0
  const offlineMinutes = healthSummary?.offline_minutes ?? 0
  const uptimePct = healthSummary?.uptime_pct ?? 0
  const alertCountFromLoadedLogs = alertLogs.length
  const healthLoadPct = Number(overview?.health?.server_load_pct ?? 0)
  const healthActivitySeries = Array.isArray(overview?.health?.activity) ? overview.health.activity : []
  const healthActivityAvg = healthActivitySeries.length > 0
    ? Math.round(
      healthActivitySeries.reduce((sum, value) => sum + Number(value || 0), 0) / healthActivitySeries.length
    )
    : 0
  const healthTileHint = healthLoadPct > 0
    ? `${healthLoadPct}% load`
    : healthActivityAvg > 0
      ? `${healthActivityAvg}% activity`
      : uptimePct > 0
        ? `${formatPercentOneDecimal(uptimePct)} uptime`
        : 'Live telemetry'
  const pqcSnapshot = overview?.pqc || {}
  const integrityStats = pqcSnapshot.integrity_checks_24h || {}
  const sigAlgoList = Array.isArray(pqcSnapshot.sig_algorithms_in_use)
    ? pqcSnapshot.sig_algorithms_in_use
    : []
  const alertTileCount = Math.max(alertCountFromLoadedLogs, Number(overview?.overview?.tamper_alerts_24h || 0))
  const courtRequestCounts = useMemo(
    () => courtRequests.reduce(
      (acc, entry) => {
        const status = String(entry.status || '').toLowerCase()
        if (status === 'approved') acc.approved += 1
        else if (status === 'denied') acc.denied += 1
        else acc.pending += 1
        return acc
      },
      { pending: 0, approved: 0, denied: 0 }
    ),
    [courtRequests]
  )
  const filteredCourtRequests = useMemo(() => {
    if (!courtRequestFilter) return courtRequests
    return courtRequests.filter(
      (entry) => String(entry.status || '').toLowerCase() === courtRequestFilter
    )
  }, [courtRequests, courtRequestFilter])

  const loadHealthHistory = async (dateValue) => {
    if (user?.role === 'auditor') return
    try {
      setHealthLoading(true)
      const res = await adminAPI.healthHistory(dateValue, clientTzOffsetMinutes())
      const points = res.data.points || []
      setHealthPoints(points)
      setHealthSummary(res.data.summary || null)
      const defaultHour = points.find((p) => p.status === 1)?.hour ?? 0
      setSelectedHealthHour(defaultHour)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load health history')
    } finally {
      setHealthLoading(false)
    }
  }

  const loadHealthMinutes = async (dateValue, hourValue) => {
    if (user?.role === 'auditor') return
    try {
      setHealthMinuteLoading(true)
      const res = await adminAPI.healthHistoryMinutes(dateValue, hourValue, clientTzOffsetMinutes())
      setHealthMinutePoints(res.data.points || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load minute timeline')
    } finally {
      setHealthMinuteLoading(false)
    }
  }

  const loadCaseApprovals = async (status = caseApprovalFilter) => {
    if (user?.role === 'auditor') return
    try {
      setCaseApprovalsLoading(true)
      setError('')
      const res = await adminAPI.caseApprovals({ status, limit: 200 })
      setCaseApprovals(res.data.cases || [])
    } catch (err) {
      setCaseApprovals([])
      setError(err.response?.data?.error || 'Failed to load case approvals')
    } finally {
      setCaseApprovalsLoading(false)
    }
  }

  const loadCourtRequests = async () => {
    if (user?.role === 'auditor') return
    try {
      setCourtRequestsLoading(true)
      setError('')
      const res = await evidenceAPI.listCourtAccessRequests({ status: 'all', limit: 200 })
      setCourtRequests(res.data.requests || [])
    } catch (err) {
      setCourtRequests([])
      setError(err.response?.data?.error || 'Failed to load court requests')
    } finally {
      setCourtRequestsLoading(false)
    }
  }

  const setDraft = (userId, key, value) => {
    setUserDrafts((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || {}),
        [key]: value,
      },
    }))
  }

  const getDraftValue = (user, key) => {
    if (userDrafts[user.id] && key in userDrafts[user.id]) {
      return userDrafts[user.id][key]
    }
    return user[key]
  }

  const refreshAfterAction = async () => {
    if (user?.role === 'auditor') {
      const logsRes = await adminAPI.getAuditLogs({ date: logsDate, tz_offset_minutes: clientTzOffsetMinutes() })
      setAuditLogs(logsRes.data.logs || [])
    } else {
      const shouldLoadLogs = activeModule === 'alerts'
      const [overviewRes, logsRes, usersRes] = await Promise.all([
        adminAPI.overview(),
        shouldLoadLogs
          ? adminAPI.getAuditLogs({ date: logsDate, tz_offset_minutes: clientTzOffsetMinutes() })
          : Promise.resolve(null),
        adminAPI.listUsers(),
      ])
      setOverview(overviewRes.data || null)
      if (shouldLoadLogs) {
        setAuditLogs(logsRes?.data?.logs || [])
      }
      setUsers(usersRes.data.users || [])
      if (activeModule === 'overview') {
        if (overviewQueue === 'court') {
          await loadCourtRequests()
        } else if (overviewQueue === 'case') {
          await loadCaseApprovals(caseApprovalFilter)
        }
      }
    }
  }

  useEffect(() => {
    if (user?.role !== 'auditor' && activeModule === 'overview') {
      if (overviewQueue === 'court') {
        loadCourtRequests()
      } else if (overviewQueue === 'case') {
        loadCaseApprovals(caseApprovalFilter)
      }
    }
  }, [activeModule, overviewQueue, caseApprovalFilter, user?.role])

  useEffect(() => {
    if (user?.role !== 'auditor' && activeModule === 'health') {
      loadHealthHistory(healthDate)
    }
  }, [activeModule, healthDate, user?.role])

  useEffect(() => {
    if (
      user?.role !== 'auditor' &&
      activeModule === 'health' &&
      selectedHealthHour !== null
    ) {
      loadHealthMinutes(healthDate, selectedHealthHour)
    }
  }, [activeModule, healthDate, selectedHealthHour, user?.role])

  useEffect(() => {
    if (user?.role === 'auditor' || activeModule !== 'health' || !isTodayLocal(healthDate)) {
      return
    }
    const intervalId = window.setInterval(() => {
      loadHealthHistory(healthDate)
      if (selectedHealthHour !== null) {
        loadHealthMinutes(healthDate, selectedHealthHour)
      }
    }, 60000)
    return () => window.clearInterval(intervalId)
  }, [activeModule, healthDate, selectedHealthHour, user?.role])

  useEffect(() => {
    const clockId = window.setInterval(() => setHealthClock(new Date()), 30000)
    return () => window.clearInterval(clockId)
  }, [])

  useEffect(() => {
    if (activeModule !== 'users') return
    const id = window.setInterval(() => setActivityNowMs(Date.now()), 15000)
    return () => window.clearInterval(id)
  }, [activeModule])

  useEffect(() => {
    if (activeModule !== 'alerts') return
    const fetchLogs = async () => {
      try {
        const res = await adminAPI.getAuditLogs({ date: logsDate, tz_offset_minutes: clientTzOffsetMinutes() })
        setAuditLogs(res.data.logs || [])
      } catch (err) {
        console.error("Failed to fetch logs", err)
      }
    }
    fetchLogs()
  }, [logsDate, activeModule])

  useEffect(() => {
    if (activeModule !== 'alerts') return
    setExpandedAlertLogId(null)
  }, [logsDate, auditLogs, activeModule])

  useEffect(() => {
    if (user?.role === 'auditor' || activeModule !== 'users') return
    const refreshUsers = async () => {
      try {
        const usersRes = await adminAPI.listUsers()
        setUsers(usersRes.data.users || [])
      } catch {
        // Keep current list if periodic refresh fails.
      }
    }
    refreshUsers()
    const id = window.setInterval(refreshUsers, 30000)
    return () => window.clearInterval(id)
  }, [activeModule, user?.role])

  useEffect(() => {
    if (!user?.id) return
    try {
      const raw = window.localStorage.getItem(integrityStorageKey(user.id))
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.checkedAt) {
        setIntegrityCheckedAt(parsed.checkedAt)
      }
      if (parsed?.summary) {
        setIntegritySummary(parsed.summary)
      }
    } catch {
      // Ignore malformed local storage values.
    }
  }, [user?.id])

  const summarizeIntegrity = (logs) => {
    const total = logs.length
    const verified = logs.filter((log) => log.chain_status === 'verified').length
    const tampered = logs.filter((log) => log.chain_status === 'tampered').length
    return { total, verified, tampered }
  }

  const openHealthDatePicker = () => {
    const input = healthDateInputRef.current
    if (!input) return
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker()
      } else {
        input.focus()
        input.click()
      }
    } catch {
      input.focus()
      input.click()
    }
  }

  const handleApproveCase = async (caseId) => {
    try {
      setActionBusy(true)
      await adminAPI.approveCase(caseId)
      await refreshAfterAction()
      await loadCaseApprovals(caseApprovalFilter)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve case')
    } finally {
      setActionBusy(false)
    }
  }

  const handleRejectCase = async (caseId) => {
    try {
      setActionBusy(true)
      const reason = window.prompt('Reason for rejection (optional):') || ''
      await adminAPI.rejectCase(caseId, reason)
      await refreshAfterAction()
      await loadCaseApprovals(caseApprovalFilter)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reject case')
    } finally {
      setActionBusy(false)
    }
  }

  const handleApproveCourtRequest = async (requestId) => {
    try {
      setActionBusy(true)
      await evidenceAPI.approveCourtAccessRequest(requestId, {})
      await loadCourtRequests()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve court request')
    } finally {
      setActionBusy(false)
    }
  }

  const handleDenyCourtRequest = async (requestId) => {
    try {
      setActionBusy(true)
      const reason = window.prompt('Reason for denial (optional):') || ''
      await evidenceAPI.denyCourtAccessRequest(requestId, { notes: reason })
      await loadCourtRequests()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to deny court request')
    } finally {
      setActionBusy(false)
    }
  }

  const handleChangeAccess = async (user) => {
    try {
      setActionBusy(true)
      await adminAPI.updateUser(user.id, {
        role: getDraftValue(user, 'role'),
      })
      setRoleEditUserId(null)
      await refreshAfterAction()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change user access')
    } finally {
      setActionBusy(false)
    }
  }

  const handleDeactivateUser = async (userId) => {
    const ok = window.confirm('Deactivate this user? They will not be able to login until reactivated.')
    if (!ok) return
    try {
      setActionBusy(true)
      await adminAPI.deleteUser(userId)
      await refreshAfterAction()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to deactivate user')
    } finally {
      setActionBusy(false)
    }
  }

  const handlePurgeUser = async (user) => {
    const ok = window.confirm(`Permanently delete ${user.username}? This cannot be undone.`)
    if (!ok) return
    try {
      setActionBusy(true)
      await adminAPI.purgeUser(user.id)
      await refreshAfterAction()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user permanently')
    } finally {
      setActionBusy(false)
    }
  }

  const handleActivateUser = async (user) => {
    try {
      setActionBusy(true)
      setError('')
      await adminAPI.updateUser(user.id, { is_active: true })
      await refreshAfterAction()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to activate user')
    } finally {
      setActionBusy(false)
    }
  }

  const handleExportLogs = async () => {
    const defaultDate = logsDate || todayIsoDate()
    setExportFromDate(defaultDate)
    setExportToDate(defaultDate)
    setExportFromTime('00:00')
    setExportToTime('23:59')
    setExportError('')
    setExportDialogOpen(true)
  }

  const closeExportDialog = () => {
    if (exportBusy) return
    setExportDialogOpen(false)
  }

  const parseLocalDateTime = (dateValue, timeValue, fallbackTime) => {
    const dateText = dateValue || todayIsoDate()
    const timeText = timeValue || fallbackTime
    const parsed = new Date(`${dateText}T${timeText}`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const formatExportFilename = (fromDate, toDate) => {
    const pad = (value) => String(value).padStart(2, '0')
    const format = (value) => {
      if (!value) return 'unknown'
      return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}-${pad(value.getHours())}${pad(value.getMinutes())}`
    }
    return `audit-logs-${format(fromDate)}_to_${format(toDate)}.pdf`
  }

  const handleExportConfirm = async () => {
    if (exportBusy) return
    const fromLocal = parseLocalDateTime(exportFromDate, exportFromTime, '00:00')
    const toLocal = parseLocalDateTime(exportToDate, exportToTime, '23:59')
    if (!fromLocal || !toLocal) {
      setExportError('Please enter a valid start and end date/time.')
      return
    }
    if (toLocal.getTime() < fromLocal.getTime()) {
      setExportError('End time must be after start time.')
      return
    }
    try {
      setExportBusy(true)
      setExportError('')
      const response = await adminAPI.exportLogs({
        from: fromLocal.toISOString(),
        to: toLocal.toISOString(),
      })
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = formatExportFilename(fromLocal, toLocal)
      a.click()
      window.URL.revokeObjectURL(url)
      setExportDialogOpen(false)
    } catch (err) {
      setExportError(err.response?.data?.error || 'Failed to export logs')
    } finally {
      setExportBusy(false)
    }
  }

  const handleIntegrityCheck = async () => {
    try {
      setIntegrityChecking(true)
      const logsRes = await adminAPI.getAuditLogs({ date: logsDate, tz_offset_minutes: clientTzOffsetMinutes() })
      const logs = logsRes.data.logs || []
      const summary = summarizeIntegrity(logs)
      const checkedAt = new Date().toISOString()
      setAuditLogs(logs)
      setIntegritySummary(summary)
      setIntegrityCheckedAt(checkedAt)
      if (user?.id) {
        window.localStorage.setItem(
          integrityStorageKey(user.id),
          JSON.stringify({ checkedAt, summary })
        )
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed integrity check')
    } finally {
      setIntegrityChecking(false)
    }
  }

  const handleBackup = async () => {
    try {
      setBackupBusy(true)
      setError('')
      setBackupResult(null)
      const res = await adminAPI.createBackup()
      const data = res?.data
      if (!data) return
      setBackupResult(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to run audit backup check')
    } finally {
      setBackupBusy(false)
    }
  }

  const handleRestore = async () => {
    const confirmed = window.confirm(
      'Restore the most recent backup? This will replace the current database.'
    )
    if (!confirmed) return
    try {
      setRestoreBusy(true)
      setError('')
      await adminAPI.restoreBackup()
      await loadAdminData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to restore backup')
    } finally {
      setRestoreBusy(false)
    }
  }

  const isAuditor = user?.role === 'auditor'
  const moduleCards = isAuditor
    ? [{ id: 'alerts', label: 'Alert Center', hint: `${alertLogs.length} alerts`, icon: ScrollText }]
    : [
      {
        id: 'overview',
        label: 'Overview',
        hint: `${overview?.overview?.active_investigations ?? 0} open cases`,
        icon: LayoutGrid,
      },
      {
        id: 'intake',
        label: 'Intake Console',
        hint: 'Cases and onboarding',
        icon: FolderPlus,
      },
      {
        id: 'health',
        label: 'System Health',
        hint: healthTileHint,
        icon: Cpu,
      },
      {
        id: 'alerts',
        label: 'Alert Center',
        hint: `${alertTileCount} alerts`,
        icon: ScrollText,
      },
      {
        id: 'users',
        label: 'Users',
        hint: `${users.length} managed`,
        icon: Users,
      },
      {
        id: 'pqc',
        label: 'PQC Profile',
        hint: `${overview?.pqc?.key_health || 'unknown'}`,
        icon: Cpu,
      },
    ]

  return (
    <div className="admin-command">
      <div className="admin-top-actions">
        <div className="admin-head-actions">
          <div className="user-chip">
            <span className="nav-user-name">{user?.username}</span>
            <span className="nav-user-role">{user?.role?.replace('_', ' ')}</span>
          </div>
          {isAuditor && (
            <Link to="/cases" className="btn-outline">
              <FileText size={15} />
              Cases
            </Link>
          )}
          <div className="admin-live-datetime" title="Current local date and time">
            <div className="health-date-chip admin-live-chip">
              <span className="health-date-dot" />
              <span className="health-date-value">{formatTopbarDate(healthClock)}</span>
              <span className="health-date-icon-wrap" aria-hidden="true">
                <CalendarDays size={14} />
              </span>
            </div>
            <div className="health-date-chip admin-live-chip">
              <span className="health-date-dot" />
              <span className="health-date-value">{formatHealthTime(healthClock)}</span>
              <span className="health-date-icon-wrap" aria-hidden="true">
                <Clock3 size={14} />
              </span>
            </div>
          </div>
          <button className="logout-btn" onClick={onLogout}>
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </div>
      <div className="admin-headline">
        <h1>{isAuditor ? 'Audit Command Console' : 'ADMIN CONSOLE'}</h1>
        <p>
          {isAuditor
            ? 'Read-only immutable history review with PQC integrity indicators.'
            : 'Master-of-trust oversight for evidence approval, integrity, and access control.'}
        </p>
      </div>

      {error && (
        <div className="admin-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      <section className="module-switcher">
        {moduleCards.map((module) => {
          const Icon = module.icon
          const isActive = activeModule === module.id
          return (
            <button
              key={module.id}
              type="button"
              className={`module-tile ${isActive ? 'active' : ''}`}
              onClick={() => setActiveModule(module.id)}
            >
              <Icon size={16} />
              <div>
                <p>{module.label}</p>
                <small>{module.hint}</small>
              </div>
            </button>
          )
        })}
      </section>

      {!isAuditor && activeModule === 'intake' && (
        <section className="admin-section intake-console">
          <div className="section-title intake-console-title">
            <h2>Intake Console</h2>
            <span className="intake-console-tag">Case intake and user provisioning</span>
          </div>
          <div className="intake-actions-grid">
            <Link to="/cases" className="intake-action-card">
              <div className="intake-action-head">
                <span className="intake-icon-pill">
                  <FileText size={18} />
                </span>
                <h3>Create Case</h3>
              </div>
              <p>Create a new case using a dedicated intake form.</p>
            </Link>
            <Link to="/cases/created" className="intake-action-card">
              <div className="intake-action-head">
                <span className="intake-icon-pill">
                  <FolderOpen size={18} />
                </span>
                <h3>Cases</h3>
              </div>
              <p>Open created cases and upload evidence files per case.</p>
            </Link>
            <Link to="/register" className="intake-action-card">
              <div className="intake-action-head">
                <span className="intake-icon-pill">
                  <UserPlus size={18} />
                </span>
                <h3>Create User</h3>
              </div>
              <p>Register and verify new users for secure platform access.</p>
            </Link>
          </div>
        </section>
      )}

      {!isAuditor && activeModule === 'overview' && (
        <section className="bento-grid">
          <article className="bento-card bento-xl">
            <div className="bento-label">Open Cases</div>
            <div className="bento-value">{overview?.overview?.active_investigations ?? 0}</div>
            <p className="bento-note">Open case files currently active in the system.</p>
            <div className="overview-queue-toggle" data-active={overviewQueue} role="tablist" aria-label="Overview queue">
              <span className="overview-toggle-indicator" aria-hidden="true" />
              <button
                type="button"
                role="tab"
                aria-selected={overviewQueue === 'court'}
                className={`overview-toggle-btn ${overviewQueue === 'court' ? 'active' : ''}`}
                onClick={() => setOverviewQueue('court')}
              >
                Court
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={overviewQueue === 'case'}
                className={`overview-toggle-btn ${overviewQueue === 'case' ? 'active' : ''}`}
                onClick={() => setOverviewQueue('case')}
              >
                Cases
              </button>
            </div>
            <p className="overview-toggle-hint">
              Use this switch to review Court access requests or Case intake decisions.
            </p>

            {overviewQueue === 'court' && (
              <div className="inline-approval-panel">
                <div className="section-title">
                  <h2>Court Access Requests</h2>
                  <span>{courtRequestFilter} • {filteredCourtRequests.length} requests</span>
                </div>

                <div className="approval-filter-bar">
                  <button
                    type="button"
                    className={`approval-filter-btn ${courtRequestFilter === 'pending' ? 'active' : ''}`}
                    onClick={() => setCourtRequestFilter('pending')}
                  >
                    Pending ({courtRequestCounts.pending})
                  </button>
                  <button
                    type="button"
                    className={`approval-filter-btn ${courtRequestFilter === 'approved' ? 'active' : ''}`}
                    onClick={() => setCourtRequestFilter('approved')}
                  >
                    Approved ({courtRequestCounts.approved})
                  </button>
                  <button
                    type="button"
                    className={`approval-filter-btn ${courtRequestFilter === 'denied' ? 'active' : ''}`}
                    onClick={() => setCourtRequestFilter('denied')}
                  >
                    Denied ({courtRequestCounts.denied})
                  </button>
                </div>

                {courtRequestsLoading ? (
                  <div className="empty-card">Loading court requests...</div>
                ) : filteredCourtRequests.length === 0 ? (
                  <div className="empty-card">No {courtRequestFilter} court requests.</div>
                ) : (
                  <div className="approval-list">
                    {filteredCourtRequests.map((entry) => (
                      <div key={entry.id} className="approval-item">
                        <div>
                          <p className="approval-name">
                            Case {entry.case_number || 'N/A'} • {entry.quantum_ledger_number || 'Ledger Pending'}
                          </p>
                          <p className="approval-meta">
                            Requested by {entry.requested_by_username || `user:${entry.requested_by}`} • {entry.requested_duration_minutes} mins
                          </p>
                          <p className="approval-meta">
                            Requested {formatTimestamp(entry.created_at)}
                          </p>
                          {entry.reason && <p className="approval-meta">Reason: {entry.reason}</p>}
                        </div>
                        {courtRequestFilter === 'pending' ? (
                          <div className="approval-pill">
                            <button
                              className="pill-btn approve"
                              onClick={() => handleApproveCourtRequest(entry.id)}
                              disabled={actionBusy}
                            >
                              <CheckCircle2 size={15} />
                              Approve
                            </button>
                            <button
                              className="pill-btn deny"
                              onClick={() => handleDenyCourtRequest(entry.id)}
                              disabled={actionBusy}
                            >
                              <XCircle size={15} />
                              Deny
                            </button>
                          </div>
                        ) : (
                          <span className={`approval-status-tag ${courtRequestFilter}`}>
                            {courtRequestFilter.toUpperCase()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {overviewQueue === 'case' && (
              <div className="inline-approval-panel">
                <div className="section-title">
                  <h2>Case Intake Approvals</h2>
                  <span>{caseApprovalFilter} • {caseApprovals.length} records</span>
                </div>

                <div className="approval-filter-bar">
                  <button
                    type="button"
                    className={`approval-filter-btn ${caseApprovalFilter === 'pending' ? 'active' : ''}`}
                    onClick={() => setCaseApprovalFilter('pending')}
                  >
                    Pending
                  </button>
                  <button
                    type="button"
                    className={`approval-filter-btn ${caseApprovalFilter === 'approved' ? 'active' : ''}`}
                    onClick={() => setCaseApprovalFilter('approved')}
                  >
                    Approved
                  </button>
                  <button
                    type="button"
                    className={`approval-filter-btn ${caseApprovalFilter === 'rejected' ? 'active' : ''}`}
                    onClick={() => setCaseApprovalFilter('rejected')}
                  >
                    Rejected
                  </button>
                </div>

                {caseApprovalsLoading ? (
                  <div className="empty-card">Loading pending case approvals...</div>
                ) : caseApprovals.length === 0 ? (
                  <div className="empty-card">No {caseApprovalFilter} case approvals.</div>
                ) : (
                  <div className="approval-list">
                    {caseApprovals.map((caseItem) => (
                      <div key={caseItem.id} className="approval-item">
                        <div>
                          <p className="approval-name">
                            {caseItem.case_number || 'Case'} • {caseItem.case_title || 'Untitled Case'}
                          </p>
                          <p className="approval-meta">
                            Ledger: {caseItem.quantum_ledger_number || 'Pending'} | Submitted by {caseItem.created_by_username || `user:${caseItem.created_by}`}
                          </p>
                          <p className="approval-meta">
                            Created: {formatTimestamp(caseItem.created_at)}
                          </p>
                        </div>
                        {caseApprovalFilter === 'pending' ? (
                          <div className="approval-pill">
                            <button
                              className="pill-btn deny"
                              onClick={() => handleRejectCase(caseItem.id)}
                              disabled={actionBusy}
                            >
                              <XCircle size={15} />
                              Reject
                            </button>
                            <button
                              className="pill-btn approve"
                              onClick={() => handleApproveCase(caseItem.id)}
                              disabled={actionBusy}
                            >
                              <CheckCircle2 size={15} />
                              Approve
                            </button>
                          </div>
                        ) : (
                          <span className={`approval-status-tag ${caseApprovalFilter}`}>
                            {caseApprovalFilter.toUpperCase()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </article>
        </section>
      )}

      {!isAuditor && activeModule === 'health' && (
        <section className="admin-section">
          <div className="section-title">
            <h2>System Health</h2>
            <div className="health-controls">
              <div className="health-date-control">
                <div className="health-date-chip">
                  <span className="health-date-dot" />
                  <span className="health-date-value">{formatHealthDate(healthDate)}</span>
                  <span className="health-date-icon-wrap" onClick={openHealthDatePicker}>
                    <CalendarDays size={14} />
                  </span>
                  <input
                    ref={healthDateInputRef}
                    id="health-date"
                    type="date"
                    className="health-date-native"
                    value={healthDate}
                    max={todayIsoDate()}
                    onChange={(e) => setHealthDate(e.target.value)}
                    aria-label="Select monitoring date"
                  />
                  <button
                    type="button"
                    className="health-date-hitbox"
                    onClick={openHealthDatePicker}
                    aria-label="Open date picker"
                  />
                </div>
                <div className="health-date-chip" title="Current local time">
                  <span className="health-date-dot" />
                  <span className="health-date-value">{formatHealthTime(healthClock)}</span>
                  <span className="health-date-icon-wrap">
                    <Clock3 size={14} />
                  </span>
                </div>
              </div>
              <button
                type="button"
                className={`health-status-btn ${isTodayLocal(healthDate) ? 'live' : 'history'}`}
                onClick={() => setHealthDate(todayIsoDate())}
              >
                {isTodayLocal(healthDate) && <span className="live-dot" />}
                {healthDayLabel(healthDate)}
              </button>
              <div className="health-date-chip health-load-chip" title="Current server load">
                <span className="health-date-dot" />
                <span className="health-date-value">{formatPercentOneDecimal(overview?.health?.server_load_pct ?? 0)} live load</span>
                <span className="health-date-icon-wrap">
                  <Cpu size={14} />
                </span>
              </div>
            </div>
          </div>
          <div className="bento-card">
            <div className="health-kpis">
              <div className="health-kpi">
                <small>Uptime</small>
                <strong>{formatPercentOneDecimal(uptimePct)}</strong>
              </div>
              <div className="health-kpi">
                <small>Online</small>
                <strong>{formatDurationFromMinutes(onlineMinutes)}</strong>
              </div>
              <div className="health-kpi">
                <small>Offline</small>
                <strong>{formatDurationFromMinutes(offlineMinutes)}</strong>
              </div>
            </div>
            {healthLoading ? (
              <div className="empty-card">Loading 24-hour health timeline...</div>
            ) : (
              <SystemHealthChart
                points={healthPoints}
                selectedHour={selectedHealthHour}
                onHourClick={(hour) => setSelectedHealthHour(hour)}
              />
            )}
            {!healthLoading && selectedHealthHour !== null && (
              <>
                {healthMinuteLoading ? (
                  <div className="empty-card">Loading minute timeline...</div>
                ) : (
                  <MinuteHealthChart points={healthMinutePoints} hour={selectedHealthHour} />
                )}
              </>
            )}
            <div className="health-legend">
              <span><i className="swatch on" /> sampled minute</span>
              <span><i className="swatch empty" /> no sample / service offline</span>
            </div>
          </div>
        </section>
      )}

      {!isAuditor && activeModule === 'pqc' && (
        <section className="admin-section">
          <div className="section-title">
            <h2>PQC Profile</h2>
            <span>{pqcSnapshot?.key_health || 'unknown'}</span>
          </div>
          <div className="pqc-stack">
            <span>Key Encapsulation: {pqcSnapshot?.kem_algorithm || 'N/A'}</span>
            <span>Signature: {pqcSnapshot?.sig_algorithm || 'N/A'}</span>
            <span>Status: {pqcSnapshot?.has_oqs ? 'liboqs active' : 'fallback/degraded'}</span>
          </div>
          <div className="pqc-grid">
            <div className="pqc-card">
              <small>Active Identities</small>
              <strong>{pqcSnapshot?.active_identities ?? 'N/A'}</strong>
              <span>Total {pqcSnapshot?.pqc_identities ?? 'N/A'}</span>
            </div>
            <div className="pqc-card">
              <small>Evidence Signed</small>
              <strong>
                {pqcSnapshot?.evidence_signed_pct != null
                  ? `${formatPercentOneDecimal(pqcSnapshot.evidence_signed_pct)}`
                  : 'N/A'}
              </strong>
              <span>
                {pqcSnapshot?.evidence_signed ?? 0} of {pqcSnapshot?.evidence_total ?? 0}
              </span>
            </div>
            <div className="pqc-card">
              <small>Signature Match</small>
              <strong>
                {pqcSnapshot?.sig_algorithm_match_pct != null
                  ? `${formatPercentOneDecimal(pqcSnapshot.sig_algorithm_match_pct)}`
                  : 'N/A'}
              </strong>
              <span>Using {pqcSnapshot?.sig_algorithm || 'N/A'}</span>
            </div>
            <div className="pqc-card">
              <small>Integrity Checks (since baseline)</small>
              <strong>
                {integrityStats?.pass_rate != null
                  ? `${formatPercentOneDecimal(integrityStats.pass_rate)} pass`
                  : 'N/A'}
              </strong>
              <span>
                {integrityStats?.passed ?? 0} passed • {integrityStats?.failed ?? 0} failed
              </span>
              <span>
                Baseline {formatTimestamp(pqcSnapshot?.integrity_baseline_at)}
              </span>
            </div>
            <div className="pqc-card">
              <small>Last Integrity Check</small>
              <strong>{formatTimestamp(pqcSnapshot?.last_integrity_check_at)}</strong>
              <span>Audit anchored</span>
            </div>
            <div className="pqc-card">
              <small>Last Key Issue</small>
              <strong>{formatTimestamp(pqcSnapshot?.last_key_issue_at)}</strong>
              <span>Identity issuance</span>
            </div>
          </div>
          <div className="pqc-algorithms">
            <span className="pqc-algorithms-label">Algorithms Observed</span>
            <div className="pqc-algorithms-list">
              {sigAlgoList.length > 0 ? (
                sigAlgoList.map((alg) => (
                  <span key={alg} className="pqc-chip">{alg}</span>
                ))
              ) : (
                <span className="pqc-chip empty">No signatures yet</span>
              )}
            </div>
          </div>
        </section>
      )}

      {!isAuditor && activeModule === 'users' && (
        <section className="admin-section">
          <div className="section-title">
            <h2>User Management</h2>
            <span>{users.length} users</span>
          </div>
          {[
            { key: 'admin', label: 'Admins' },
            { key: 'investigator', label: 'Investigators' },
            { key: 'court_user', label: 'Court Users' },
          ].map((group) => (
            <div key={group.key} className="user-group">
              <div className="user-group-head">
                <h3>{group.label}</h3>
                <span>{usersByRole[group.key].length}</span>
              </div>
              <div className="user-cards">
                {usersByRole[group.key].length === 0 && (
                  <div className="empty-card">No users in this role.</div>
                )}
                {usersByRole[group.key].map((user) => {
                  const expanded = expandedUserId === user.id
                  const activity = activityStatusMeta(
                    user.last_activity_at,
                    user.last_login,
                    user.is_active,
                    activityNowMs
                  )
                  return (
                    <article
                      key={user.id}
                      className={`user-glass ${expanded ? 'expanded' : ''}`}
                      onClick={() => {
                        if (expanded) {
                          setExpandedUserId(null)
                          if (roleEditUserId === user.id) setRoleEditUserId(null)
                        } else {
                          setExpandedUserId(user.id)
                        }
                      }}
                    >
                      <div className="user-head">
                        <div className="mono-avatar">{user.username.charAt(0).toUpperCase()}</div>
                        <div>
                          <p className={`user-name ${!user.is_active ? 'deactivated' : ''}`}>{user.username}</p>
                          <p className="user-email">{user.email}</p>
                        </div>
                        <div className={`user-activity-tag ${activity.tone}`}>{activity.label}</div>
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>

                      {expanded && (
                        <div className="user-expand" onClick={(e) => e.stopPropagation()}>
                          <div className="user-actions">
                            {user.is_active ? (
                              <>
                                {roleEditUserId === user.id && (
                                  <label className="access-level-field">
                                    Access Level
                                    <CustomSelect
                                      value={getDraftValue(user, 'role')}
                                      onChange={(value) => setDraft(user.id, 'role', value)}
                                      options={[
                                        { value: 'admin', label: 'Admin' },
                                        { value: 'investigator', label: 'Investigator' },
                                        { value: 'court_user', label: 'Court User' },
                                      ]}
                                      placeholder="Select access level"
                                      className="access-level-shell"
                                      triggerClassName="access-level-select"
                                    />
                                  </label>
                                )}
                                <button
                                  className="btn-primary"
                                  onClick={() =>
                                    roleEditUserId === user.id
                                      ? handleChangeAccess(user)
                                      : setRoleEditUserId(user.id)
                                  }
                                  disabled={actionBusy}
                                >
                                  <UserCog size={16} />
                                  {roleEditUserId === user.id ? 'Save Access' : 'Change Access'}
                                </button>
                                <button
                                  className="btn-outline"
                                  onClick={() => handleDeactivateUser(user.id)}
                                  disabled={actionBusy}
                                >
                                  Deactivate User
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="btn-secondary"
                                  onClick={() => handleActivateUser(user)}
                                  disabled={actionBusy}
                                >
                                  Activate User
                                </button>
                                <button
                                  className="btn-outline danger"
                                  onClick={() => handlePurgeUser(user)}
                                  disabled={actionBusy}
                                >
                                  Delete User
                                </button>
                              </>
                            )}
                          </div>
                          <div className="user-meta">
                            <div className="user-meta-row">
                              <span>Created</span>
                              <strong>{formatTimestamp(user.created_at)}</strong>
                            </div>
                            <div className="user-meta-row">
                              <span>Created By</span>
                              <strong>{user.created_by?.username || 'Unknown'}</strong>
                            </div>
                            <div className="user-meta-row">
                              <span>Physical Verification</span>
                              <strong>
                                {user.is_physically_verified
                                  ? `Verified in person by ${user.verified_by?.username || 'Unknown'}`
                                  : 'Not verified'}
                              </strong>
                            </div>
                          </div>
                          {user.has_pqid && (
                            <div className="user-pqid-block">
                              <p className="user-pqid-label">PQID</p>
                              <p className="user-pqid-value">
                                {pqidRevealMap[user.id] ? pqidRevealMap[user.id] : 'Protected'}
                              </p>
                              <div className="user-pqid-actions">
                                {pqidRevealMap[user.id] ? (
                                  <>
                                    <button
                                      type="button"
                                      className="btn-outline btn-pqid-copy"
                                      onClick={() => handleCopyPqid(pqidRevealMap[user.id], user.id)}
                                    >
                                      Copy PQID
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-outline"
                                      onClick={() => handleHidePqid(user.id)}
                                    >
                                      Hide PQID
                                    </button>
                                    {pqidCopiedId === user.id && (
                                      <span className="pqid-copied">Copied</span>
                                    )}
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn-outline btn-pqid-copy"
                                    onClick={() => openPqidPrompt(user)}
                                  >
                                    View PQID
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {activeModule === 'alerts' && (
        <section className="audit-section">
          <div className="section-title">
            <h2>Alert Center</h2>
            <div className="audit-actions">
              <div className="health-date-control" style={{ marginRight: '1rem' }}>
                <div className="health-date-chip">
                  <span className="health-date-dot" />
                  <span className="health-date-value">{formatHealthDate(logsDate)}</span>
                  <span className="health-date-icon-wrap" onClick={openHealthDatePicker}>
                    <CalendarDays size={14} />
                  </span>
                  <input
                    ref={healthDateInputRef}
                    id="logs-date"
                    type="date"
                    className="health-date-native"
                    value={logsDate}
                    max={todayIsoDate()}
                    onChange={(e) => setLogsDate(e.target.value)}
                    aria-label="Select log date"
                  />
                  <button
                    type="button"
                    className="health-date-hitbox"
                    onClick={openHealthDatePicker}
                    aria-label="Open date picker"
                  />
                </div>
                <button
                  type="button"
                  className={`health-status-btn ${isTodayLocal(logsDate) ? 'live' : 'history'}`}
                  onClick={() => setLogsDate(todayIsoDate())}
                  style={{ marginLeft: '0.5rem' }}
                >
                  {isTodayLocal(logsDate) && <span className="live-dot" />}
                  {healthDayLabel(logsDate)}
                </button>
              </div>

              <button className="btn-secondary" onClick={handleIntegrityCheck} disabled={integrityChecking}>
                <Shield size={15} />
                {integrityChecking ? 'Checking...' : 'Check Integrity'}
              </button>
              <button className="btn-outline" onClick={handleExportLogs}>
                <Download size={15} />
                Export
              </button>
              <button className="btn-outline" onClick={handleBackup} disabled={backupBusy}>
                {backupBusy ? 'Checking...' : 'Backup'}
              </button>
            </div>
          </div>
          {integrityCheckedAt && (
            <div className="integrity-check-meta">
              <span>Last checked: {formatTimestamp(integrityCheckedAt)}</span>
              <span>{integritySummary.tampered} broken</span>
            </div>
          )}

          {backupResult && (
            <div
              style={{
                padding: '1rem',
                background: backupResult.manipulated ? '#fee2e2' : '#ecfdf3',
                border: `1px solid ${backupResult.manipulated ? '#ef4444' : '#16a34a'}`,
                borderRadius: '4px',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ color: backupResult.manipulated ? '#b91c1c' : '#166534', marginTop: 0 }}>
                {backupResult.manipulated ? 'Audit Manipulation Detected' : 'Audit Backup Check'}
              </h3>
              <p style={{ color: backupResult.manipulated ? '#991b1b' : '#166534', fontSize: '0.9rem' }}>
                {backupResult.message}
              </p>
              {backupResult.backup_filename && (
                <p style={{ color: backupResult.manipulated ? '#991b1b' : '#166534', fontSize: '0.85rem' }}>
                  Backup file: {backupResult.backup_filename}
                </p>
              )}
              {backupResult.summary && (
                <div className="integrity-check-meta" style={{ marginBottom: backupResult.logs?.length ? '0.75rem' : 0 }}>
                  <span>{backupResult.summary.total || 0} issues</span>
                  <span>{backupResult.summary.modified || 0} modified</span>
                  <span>{backupResult.summary.deleted || 0} deleted</span>
                </div>
              )}
              {backupResult.logs?.length > 0 && (
                <div style={{ maxHeight: '260px', overflowY: 'auto', background: '#fff', padding: '0.75rem', borderRadius: '4px' }}>
                  {backupResult.logs.map((issue, index) => {
                    const snapshot = backupIssueSnapshot(issue)
                    const actionLabel = snapshot?.action ? formatAuditActionLabel(snapshot.action) : 'N/A'
                    return (
                      <div
                        key={`${issue.issue || 'issue'}-${issue.id || index}`}
                        style={{
                          paddingBottom: index === backupResult.logs.length - 1 ? 0 : '0.75rem',
                          marginBottom: index === backupResult.logs.length - 1 ? 0 : '0.75rem',
                          borderBottom: index === backupResult.logs.length - 1 ? 'none' : '1px solid #e5e7eb',
                        }}
                      >
                        <div style={{ fontWeight: 700, color: '#111827' }}>
                          #{issue.id || 'Unknown'} • {backupIssueHeading(issue)}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#374151', marginTop: '0.25rem' }}>
                          Action: {actionLabel}
                          {snapshot?.timestamp ? ` • ${formatTimestamp(snapshot.timestamp)}` : ''}
                        </div>
                        {issue.message && (
                          <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: '0.25rem' }}>
                            {issue.message}
                          </div>
                        )}
                        {issue.changed_fields?.length > 0 && (
                          <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: '0.25rem' }}>
                            Changed fields: {issue.changed_fields.join(', ')}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <button
                className="btn-outline"
                style={{
                  marginTop: '0.75rem',
                  borderColor: backupResult.manipulated ? '#ef4444' : '#16a34a',
                  color: backupResult.manipulated ? '#ef4444' : '#16a34a',
                }}
                onClick={() => setBackupResult(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="section-title">
            <h2>Security Alerts ({formatHealthDate(logsDate)})</h2>
            <span>{alertLogs.length} detected</span>
          </div>
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Alert Action</th>
                  <th>Chain Status</th>
                  <th>Integrity Check</th>
                </tr>
              </thead>
              <tbody>
                {alertLogs.slice(0, 80).map((log) => {
                  const meta = auditLogMeta(log)
                  const pqidNote = auditTargetLine(log)
                  const expanded = expandedAlertLogId === log.id
                  return (
                    <Fragment key={`alert-fragment-${log.id}`}>
                      <tr
                        className={`audit-row-clickable ${expanded ? 'expanded' : ''}`}
                        onClick={() => setExpandedAlertLogId(expanded ? null : log.id)}
                        title="Click to inspect security alert details"
                      >
                        <td>{formatTimestamp(log.timestamp)}</td>
                        <td>
                          <div className="action-cell">
                            <AlertTriangle size={14} />
                            <div className="action-stack">
                              <span>{formatAuditActionLabel(log.action)}</span>
                              <small>{pqidNote || meta.actor}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`chain-badge ${log.chain_status === 'verified' ? 'ok' : 'bad'}`}>
                            {log.chain_status || 'unknown'}
                          </span>
                        </td>
                        <td>
                          {integrityCheckedAt ? (
                            <span className={`integrity-check-badge ${log.chain_status === 'verified' ? 'ok' : 'bad'}`}>
                              {log.chain_status === 'verified' ? 'Verified' : 'Broken'}
                            </span>
                          ) : (
                            <span className="integrity-check-badge pending">Unchecked</span>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="audit-row-details">
                          <td colSpan={4}>
                            <SecurityAlertDetails log={log} contextLogs={auditLogs} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
            {alertLogs.length === 0 && (
              <div className="empty-card">
                <Clock3 size={16} />
                No security alerts detected for {formatHealthDate(logsDate)}.
              </div>
            )}
          </div>

          <div className="section-title" style={{ marginTop: '1rem' }}>
            <h2>All Audit Logs ({formatHealthDate(logsDate)})</h2>
            <span>{auditLogs.length} records</span>
          </div>
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User Action</th>
                  <th>Chain Status</th>
                  <th>Integrity Check</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.slice(0, 120).map((log) => {
                  const meta = auditLogMeta(log)
                  const pqidNote = auditTargetLine(log)
                  return (
                    <tr key={`audit-row-${log.id}`}>
                      <td>{formatTimestamp(log.timestamp)}</td>
                      <td>
                        <div className="action-cell">
                          <Shield size={14} />
                          <div className="action-stack">
                            <span>{formatAuditActionLabel(log.action)}</span>
                            <small>{pqidNote || meta.actor}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`chain-badge ${log.chain_status === 'verified' ? 'ok' : 'bad'}`}>
                          {log.chain_status || 'unknown'}
                        </span>
                      </td>
                      <td>
                        {integrityCheckedAt ? (
                          <span className={`integrity-check-badge ${log.chain_status === 'verified' ? 'ok' : 'bad'}`}>
                            {log.chain_status === 'verified' ? 'Verified' : 'Broken'}
                          </span>
                        ) : (
                          <span className="integrity-check-badge pending">Unchecked</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {auditLogs.length === 0 && (
              <div className="empty-card">
                <Clock3 size={16} />
                No audit entries found for {formatHealthDate(logsDate)}.
              </div>
            )}
          </div>
        </section>
      )}

      {pqidPromptOpen && (
        <div className="case-book-modal-backdrop" role="presentation">
          <div className="case-book-modal" role="dialog" aria-label="Confirm password to view PQID">
            <div className="case-book-modal-head">
              <div>
                <p className="case-book-modal-kicker">Protected Action</p>
                <h2 className="case-book-modal-title">Confirm Password to View PQID</h2>
              </div>
              <button type="button" className="btn-outline" onClick={closePqidPrompt}>
                Close
              </button>
            </div>
            <form
              className="case-book-modal-body"
              onSubmit={(e) => {
                e.preventDefault()
                handleRevealPqid()
              }}
            >
              <div>
                <p className="case-book-modal-kicker" style={{ marginBottom: '0.35rem' }}>
                  Target User
                </p>
                <strong>{pqidPromptUser?.username || 'Unknown user'}</strong>
              </div>
              <div className="input-group">
                <label className="field-label" htmlFor="pqid-password-input">
                  Admin Password
                </label>
                <input
                  id="pqid-password-input"
                  className="input-field"
                  type="password"
                  autoComplete="current-password"
                  value={pqidPromptValue}
                  onChange={(e) => setPqidPromptValue(e.target.value)}
                  disabled={pqidPromptBusy}
                  placeholder="Enter your password to proceed"
                />
              </div>
              {pqidPromptError && (
                <div className="auth-alert">
                  <AlertTriangle className="auth-alert-icon" size={16} />
                  <div className="auth-alert-text">{pqidPromptError}</div>
                </div>
              )}
              <div className="case-book-nav">
                <button type="button" className="btn-outline" onClick={closePqidPrompt} disabled={pqidPromptBusy}>
                  Cancel
                </button>
                <button type="submit" className="btn-secondary" disabled={pqidPromptBusy}>
                  {pqidPromptBusy ? 'Verifying...' : 'View PQID'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {exportDialogOpen && (
        <div className="case-book-modal-backdrop" role="presentation">
          <div className="case-book-modal" role="dialog" aria-label="Export audit logs">
            <div className="case-book-modal-head">
              <div>
                <p className="case-book-modal-kicker">Audit Export</p>
                <h2 className="case-book-modal-title">Export Logs to PDF</h2>
              </div>
              <button
                type="button"
                className="btn-outline"
                onClick={closeExportDialog}
                disabled={exportBusy}
              >
                Close
              </button>
            </div>
            <div className="case-book-modal-body">
              <div className="audit-export-grid">
                <div className="audit-export-field">
                  <label className="audit-export-label" htmlFor="export-from-date">From Date</label>
                  <input
                    id="export-from-date"
                    type="date"
                    className="input-field"
                    value={exportFromDate}
                    onChange={(e) => setExportFromDate(e.target.value)}
                    max={todayIsoDate()}
                  />
                </div>
                <div className="audit-export-field">
                  <label className="audit-export-label" htmlFor="export-from-time">From Time</label>
                  <input
                    id="export-from-time"
                    type="time"
                    className="input-field"
                    value={exportFromTime}
                    onChange={(e) => setExportFromTime(e.target.value)}
                  />
                </div>
                <div className="audit-export-field">
                  <label className="audit-export-label" htmlFor="export-to-date">To Date</label>
                  <input
                    id="export-to-date"
                    type="date"
                    className="input-field"
                    value={exportToDate}
                    onChange={(e) => setExportToDate(e.target.value)}
                    max={todayIsoDate()}
                  />
                </div>
                <div className="audit-export-field">
                  <label className="audit-export-label" htmlFor="export-to-time">To Time</label>
                  <input
                    id="export-to-time"
                    type="time"
                    className="input-field"
                    value={exportToTime}
                    onChange={(e) => setExportToTime(e.target.value)}
                  />
                </div>
              </div>
              <p className="audit-export-note">Times are interpreted in your local timezone and exported in UTC.</p>
              {exportError && <div className="audit-export-error">{exportError}</div>}
              <div className="audit-export-actions">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={closeExportDialog}
                  disabled={exportBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleExportConfirm}
                  disabled={exportBusy}
                >
                  {exportBusy ? 'Exporting...' : 'Export PDF'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
