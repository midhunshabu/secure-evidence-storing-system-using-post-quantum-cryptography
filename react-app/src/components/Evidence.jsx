import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sha3_512 } from 'js-sha3'
import {
  Plus,
  FileText,
  BookOpen,
  Lock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  UserCog,
  XCircle,
  BadgeCheck,
  ShieldOff,
  ShieldCheck,
  Gavel,
  CalendarDays,
  Clock3,
  ChevronUp,
  Fingerprint,
  MapPin,
  Shield,
  Timer,
  FileSearch,
  Sparkles,
  UploadCloud,
  Loader2,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import CustomSelect from './CustomSelect'
import { evidenceAPI } from '../api'
import { isPqidBypassUser } from '../constants/pqid'
import { INDIA_STATE_DISTRICT_DATA, getDistrictsByStateCode, getStateByCode } from '../constants/indiaGeo'

const initialUploadData = {
  case_id: '',
  description: '',
  file: null,
  gps_location: '',
  intake_timestamp: '',
  client_sha3_512: '',
  seal_for_transport: true,
}

const HASH_CHUNK_SIZE = 2 * 1024 * 1024
const MIN_COURT_ACCESS_MINUTES = 1
const MAX_COURT_ACCESS_MINUTES = 43200
const DEFAULT_COURT_ACCESS_MINUTES = 60
const EXTENSION_UNITS = [
  { value: 'minutes', label: 'Minutes', multiplier: 1 },
  { value: 'hours', label: 'Hours', multiplier: 60 },
  { value: 'days', label: 'Days', multiplier: 1440 },
]

const initialCaseData = {
  case_number: '',
  case_title: '',
  incident_state: '',
  incident_state_code: '',
  incident_district: '',
  incident_district_code: '',
  incident_location: '',
  status: '',
  assigned_investigator_id: '',
}

function normalizeCaseRef(value) {
  return String(value || '').trim().toUpperCase()
}

function normalizeServerTimestamp(value) {
  if (!value) return null
  const raw = String(value)
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(raw)
  return hasTimezone ? raw : `${raw}Z`
}

function parseServerDate(value) {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const normalized = normalizeServerTimestamp(value)
  if (!normalized) return null
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDateTime(value) {
  const parsed = parseServerDate(value)
  if (!parsed) return 'N/A'
  return parsed.toLocaleString()
}

function formatDate(value) {
  const parsed = parseServerDate(value)
  if (!parsed) return 'N/A'
  return parsed.toLocaleDateString()
}

function formatCaseStatus(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'Unknown'
  if (raw === 'open') return 'Open'
  if (raw === 'investigation') return 'Investigation'
  if (raw === 'closed') return 'Closed'
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function normalizeCaseStatus(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw || raw === 'open') return 'open'
  if (raw === 'investigation') return 'investigation'
  if (raw === 'closed') return 'closed'
  return 'open'
}

function formatApprovalStatus(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw || raw === 'approved') return 'Approved'
  if (raw === 'pending') return 'Pending Approval'
  if (raw === 'rejected') return 'Rejected'
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function formatLiveDate(value) {
  return value.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatLiveTime(value) {
  return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatFileSize(value) {
  const size = Number(value || 0)
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatDurationMinutes(value) {
  const minutes = Math.max(0, Number(value || 0))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60
  if (remMinutes === 0) return `${hours} hr`
  return `${hours} hr ${remMinutes} min`
}

function formatRequestStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Unknown'
  if (normalized === 'pending') return 'Pending'
  if (normalized === 'approved') return 'Approved'
  if (normalized === 'denied') return 'Denied'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function clampCourtAccessMinutes(value, fallback = DEFAULT_COURT_ACCESS_MINUTES) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.round(parsed)
  return Math.min(MAX_COURT_ACCESS_MINUTES, Math.max(MIN_COURT_ACCESS_MINUTES, rounded))
}

function extensionUnitMeta(unit) {
  return EXTENSION_UNITS.find((entry) => entry.value === unit) || EXTENSION_UNITS[0]
}

function maxDurationValue(unit) {
  const meta = extensionUnitMeta(unit)
  return Math.max(1, Math.floor(MAX_COURT_ACCESS_MINUTES / meta.multiplier))
}

function extensionDefaultValue(unit) {
  if (unit === 'hours' || unit === 'days') return 1
  return DEFAULT_COURT_ACCESS_MINUTES
}

function clampExtensionValue(value, unit) {
  const parsed = Number(value)
  const meta = extensionUnitMeta(unit)
  const maxValue = Math.max(1, Math.floor(MAX_COURT_ACCESS_MINUTES / meta.multiplier))
  if (!Number.isFinite(parsed)) return 1
  const rounded = Math.round(parsed)
  return Math.min(maxValue, Math.max(1, rounded))
}

function durationValueToMinutes(value, unit, fallbackMinutes = DEFAULT_COURT_ACCESS_MINUTES) {
  const meta = extensionUnitMeta(unit)
  const safeValue = clampExtensionValue(value, unit)
  return clampCourtAccessMinutes(safeValue * meta.multiplier, fallbackMinutes)
}

function minutesToDurationValue(minutes, unit) {
  const meta = extensionUnitMeta(unit)
  const safeMinutes = clampCourtAccessMinutes(minutes, DEFAULT_COURT_ACCESS_MINUTES)
  const rawValue = Math.max(1, Math.round(safeMinutes / meta.multiplier))
  return clampExtensionValue(rawValue, unit)
}

function parseIsoDate(value) {
  return parseServerDate(value)
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((val) => String(val).padStart(2, '0')).join(':')
}

function formatCustodyAction(action) {
  const normalized = String(action || '').trim().toLowerCase()
  if (!normalized) return 'Unknown action'
  const map = {
    upload: 'Evidence Acquired',
    view: 'Evidence Viewed',
    download: 'Evidence Downloaded',
    submit_to_court: 'Submitted to Court',
    approve: 'Admin Approved',
    deny: 'Admin Denied',
    transfer: 'Evidence Transferred',
    assign_investigator: 'Investigator Assigned',
    close_case: 'Case Closed',
    reopen_case: 'Case Reopened',
    case_book_page_upload: 'Case Book Updated',
  }
  if (map[normalized]) return map[normalized]
  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function formatCustodyNotes(notes) {
  if (!notes || typeof notes !== 'string') return []
  let parsed
  try {
    parsed = JSON.parse(notes)
  } catch {
    const trimmed = String(notes || '').trim()
    if (!trimmed) return []
    return [{ label: 'Remarks', value: trimmed.slice(0, 160) }]
  }
  if (!parsed || typeof parsed !== 'object') return []
  const rows = []
  if (parsed.intake_timestamp) {
    rows.push({ label: 'Captured At', value: formatDateTime(parsed.intake_timestamp) })
  }
  if (parsed.gps_location) {
    rows.push({ label: 'Location', value: String(parsed.gps_location) })
  }
  if (parsed.raw_metadata) {
    rows.push({ label: 'Remarks', value: String(parsed.raw_metadata).slice(0, 160) })
  }
  return rows
}

function humanizeKexAlgorithm(value) {
  const raw = String(value || '').trim()
  if (!raw) return 'CRYSTALS-Kyber (server default)'
  const upper = raw.toUpperCase()
  const level = raw.match(/(\d{3,4})/)?.[1]
  if (upper.includes('KYBER')) {
    return level ? `CRYSTALS-Kyber-${level}` : 'CRYSTALS-Kyber'
  }
  if (upper.includes('ML-KEM')) {
    return level ? `ML-KEM-${level}` : 'ML-KEM'
  }
  return raw
}

function humanizeSigAlgorithm(value) {
  const raw = String(value || '').trim()
  if (!raw) return 'Dilithium'
  const upper = raw.toUpperCase()
  const level = raw.match(/(\d{2,3})/)?.[1]
  if (upper.includes('DILITHIUM')) {
    return level ? `Dilithium-${level}` : 'Dilithium'
  }
  if (upper.includes('ML-DSA')) {
    return level ? `ML-DSA-${level}` : 'ML-DSA'
  }
  return raw
}

function parseContentDispositionFilename(headerValue) {
  if (!headerValue) return ''
  const utfMatch = headerValue.match(/filename\\*=UTF-8''([^;]+)/i)
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1])
    } catch {
      return utfMatch[1]
    }
  }
  const asciiMatch = headerValue.match(/filename=\"?([^\";]+)\"?/i)
  return asciiMatch?.[1] || ''
}

function classifyPreviewKind(mime) {
  const normalized = String(mime || '').toLowerCase()
  if (normalized.startsWith('image/')) return 'image'
  if (normalized.startsWith('video/')) return 'video'
  if (normalized.startsWith('audio/')) return 'audio'
  if (normalized === 'application/pdf') return 'pdf'
  if (normalized.startsWith('text/')) return 'text'
  return 'generic'
}

function resolveFileFormat(entry) {
  const fromType = String(entry?.evidence_type || '').trim()
  if (fromType) return fromType.toUpperCase()
  const name = String(entry?.filename || '')
  if (!name.includes('.')) return 'N/A'
  return name.split('.').pop().toUpperCase()
}

function buildEvidenceLabelMap(entries = []) {
  const map = new Map()
  entries.forEach((entry, idx) => {
    if (entry?.id) {
      map.set(entry.id, `EV${idx + 1}`)
    }
  })
  return map
}

function integrityStorageKey(userId, role) {
  const roleLabel = role || 'unknown'
  return `evidence_integrity_${userId}_${roleLabel}`
}

function readIntegrityCache(userId, role) {
  if (!userId || typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(integrityStorageKey(userId, role))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeIntegrityCache(userId, role, data) {
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(integrityStorageKey(userId, role), JSON.stringify(data))
  } catch {
    // Ignore localStorage write failures.
  }
}

async function hashFileSha3(file, onProgress) {
  const hasher = sha3_512.create()
  const total = Number(file?.size || 0)
  if (total === 0) {
    return hasher.hex()
  }
  let offset = 0
  while (offset < total) {
    const chunk = file.slice(offset, offset + HASH_CHUNK_SIZE)
    const buffer = await chunk.arrayBuffer()
    hasher.update(new Uint8Array(buffer))
    offset += chunk.size
    if (onProgress) {
      const progress = Math.min(100, Math.round((offset / total) * 100))
      onProgress(progress)
    }
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  }
  return hasher.hex()
}

export default function Evidence({ user, mode = 'create' }) {
  const location = useLocation()
  const [evidence, setEvidence] = useState([])
  const [cases, setCases] = useState([])
  const [caseLoading, setCaseLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [caseSuccessPopup, setCaseSuccessPopup] = useState('')
  const [selectedEvidence, setSelectedEvidence] = useState(null)
  const [custodyPreview, setCustodyPreview] = useState(null)
  const [custodyPreviewLoading, setCustodyPreviewLoading] = useState(false)
  const [custodyPreviewError, setCustodyPreviewError] = useState('')
  const [uploadCaseId, setUploadCaseId] = useState(null)
  const [uploadMode, setUploadMode] = useState('evidence')
  const [uploadData, setUploadData] = useState(initialUploadData)
  const [showPqidPrompt, setShowPqidPrompt] = useState(false)
  const [pqidInput, setPqidInput] = useState('')
  const [pqidError, setPqidError] = useState('')
  const [pqidSubmitting, setPqidSubmitting] = useState(false)
  const [pqidPromptMeta, setPqidPromptMeta] = useState({
    title: 'PQID Verification',
    description: 'Enter your PQID to continue.',
    confirmLabel: 'Verify PQID',
  })
  const [caseData, setCaseData] = useState(initialCaseData)
  const [investigators, setInvestigators] = useState([])
  const [investigatorLoading, setInvestigatorLoading] = useState(false)
  const [investigatorError, setInvestigatorError] = useState('')
  const [pendingCasePayload, setPendingCasePayload] = useState(null)
  const [previewLedgerNumber, setPreviewLedgerNumber] = useState('')
  const [hashingState, setHashingState] = useState({
    status: 'idle',
    progress: 0,
    hash: '',
    error: '',
  })
  const [sealerState, setSealerState] = useState('pending')
  const [sealerError, setSealerError] = useState('')
  const [sealFlash, setSealFlash] = useState(false)
  const [locationStatus, setLocationStatus] = useState('idle')
  const [locationMessage, setLocationMessage] = useState('Awaiting file selection.')
  const hashingTaskRef = useRef(0)
  const locationTaskRef = useRef(0)
  const sealFlashTimerRef = useRef(null)
  const successMessageTimerRef = useRef(null)
  const caseSuccessTimerRef = useRef(null)
  const pqidActionRef = useRef(null)
  const previewUrlRef = useRef(null)
  const [evidenceIntegrity, setEvidenceIntegrity] = useState({})
  const [verifyingEvidenceId, setVerifyingEvidenceId] = useState('')
  const [inspectedEvidence, setInspectedEvidence] = useState(null)
  const [inspectorLoading, setInspectorLoading] = useState(false)
  const [sessionNow, setSessionNow] = useState(() => new Date())
  const [caseSearchQuery, setCaseSearchQuery] = useState('')
  const [activeCaseNumber, setActiveCaseNumber] = useState('')
  const [activeCaseInvestigatorId, setActiveCaseInvestigatorId] = useState('')
  const [showReassignPicker, setShowReassignPicker] = useState(false)
  const [showCourtGrantPanel, setShowCourtGrantPanel] = useState(false)
  const [caseActionLoading, setCaseActionLoading] = useState(false)
  const [caseBookLoading, setCaseBookLoading] = useState(false)
  const [activeCaseBook, setActiveCaseBook] = useState(null)
  const [showCaseBookViewer, setShowCaseBookViewer] = useState(false)
  const [activeBookPageIndex, setActiveBookPageIndex] = useState(0)
  const [activeBookPageUrl, setActiveBookPageUrl] = useState('')
  const [activeBookPageMimeType, setActiveBookPageMimeType] = useState('')
  const [bookPageLoading, setBookPageLoading] = useState(false)
  const [liveClock, setLiveClock] = useState(() => new Date())
  const [courtView, setCourtView] = useState('cases')
  const [courtUsers, setCourtUsers] = useState([])
  const [courtUsersLoading, setCourtUsersLoading] = useState(false)
  const [courtAccessRequests, setCourtAccessRequests] = useState([])
  const [courtAccessRequestsLoading, setCourtAccessRequestsLoading] = useState(false)
  const [extensionFeedback, setExtensionFeedback] = useState('')
  const [caseCourtAccessGrants, setCaseCourtAccessGrants] = useState([])
  const [caseCourtAccessGrantsLoading, setCaseCourtAccessGrantsLoading] = useState(false)
  const isPqidBypass = useMemo(() => isPqidBypassUser(user), [user])
  const [requestDurationOverrides, setRequestDurationOverrides] = useState({})
  const [requestDurationUnitOverrides, setRequestDurationUnitOverrides] = useState({})
  const [courtAccessForm, setCourtAccessForm] = useState({
    case_number: '',
    quantum_ledger_number: '',
    requested_duration_value: String(DEFAULT_COURT_ACCESS_MINUTES),
    requested_duration_unit: 'minutes',
    reason: '',
  })
  const [showExtensionDialog, setShowExtensionDialog] = useState(false)
  const [extensionUnit, setExtensionUnit] = useState('minutes')
  const [extensionValue, setExtensionValue] = useState(String(extensionDefaultValue('minutes')))
  const [extensionTarget, setExtensionTarget] = useState(null)
  const [adminGrantForm, setAdminGrantForm] = useState({
    court_user_id: '',
    duration_value: String(DEFAULT_COURT_ACCESS_MINUTES),
    duration_unit: 'minutes',
    notes: '',
  })
  const autoVerifiedEvidenceRef = useRef(new Set())
  const courtAccessFormRef = useRef(null)
  const courtAccessFormScrollRef = useRef(false)
  const extensionFeedbackTimerRef = useRef(null)

  const isCourtUser = user?.role === 'court_user'
  const isInvestigator = user?.role === 'investigator'
  const canPreviewSelectedEvidence = Boolean(
    selectedEvidence && (isCourtUser || isInvestigator)
  )
  const isCourtCasesView = !isCourtUser || courtView === 'cases'

  const getIntegrityRecord = useCallback((entry) => {
    if (!entry?.id) return null
    const record = evidenceIntegrity[entry.id]
    if (!record) return null
    const recordHash = record.hash || record.file_hash
    if (entry?.file_hash && recordHash && recordHash !== entry.file_hash) {
      return null
    }
    return record
  }, [evidenceIntegrity])

  const hasCachedIntegrity = useCallback(
    (entry) => Boolean(getIntegrityRecord(entry)?.checkedAt),
    [getIntegrityRecord]
  )

  const persistIntegrityRecord = useCallback((evidenceId, record) => {
    setEvidenceIntegrity((prev) => {
      const next = { ...prev, [evidenceId]: record }
      writeIntegrityCache(user?.id, user?.role, next)
      return next
    })
  }, [user?.id, user?.role])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [])
  useEffect(() => {
    if (!user?.id) {
      setEvidenceIntegrity({})
      autoVerifiedEvidenceRef.current = new Set()
      return
    }
    const cached = readIntegrityCache(user.id, user.role)
    setEvidenceIntegrity(cached)
    autoVerifiedEvidenceRef.current = new Set()
  }, [user?.id])
  const isCourtRequestView = isCourtUser && courtView === 'request'
  const isCreateMode = mode === 'create' && !isCourtUser
  const isCreatedMode = !isCreateMode
  const showAdminReturn = user?.role === 'admin'
  const districtOptions = useMemo(
    () => getDistrictsByStateCode(caseData.incident_state_code),
    [caseData.incident_state_code]
  )
  const stateOptions = useMemo(
    () => INDIA_STATE_DISTRICT_DATA.map((state) => ({
      value: state.code,
      label: state.label || `${state.name} (${state.code})`,
    })),
    []
  )
  const districtSelectOptions = useMemo(
    () => districtOptions.map((district) => ({
      value: district.code,
      label: district.label || `${district.name} (${district.code})`,
    })),
    [districtOptions]
  )
  const statusOptions = useMemo(
    () => ([
      { value: 'open', label: 'Open' },
      { value: 'investigation', label: 'Under Investigation' },
      { value: 'closed', label: 'Closed' },
    ]),
    []
  )
  const courtUserOptions = useMemo(
    () => courtUsers.map((entry) => ({
      value: String(entry.id),
      label: entry.username || `Court User ${entry.id}`,
    })),
    [courtUsers]
  )

  const showExtensionFeedback = (message) => {
    if (extensionFeedbackTimerRef.current) {
      window.clearTimeout(extensionFeedbackTimerRef.current)
    }
    setExtensionFeedback(message)
    extensionFeedbackTimerRef.current = window.setTimeout(() => {
      setExtensionFeedback('')
      extensionFeedbackTimerRef.current = null
    }, 4000)
  }

  useEffect(() => {
    if (!isCourtUser) return
    const params = new URLSearchParams(location.search)
    const view = params.get('view')
    if (view === 'request') {
      courtAccessFormScrollRef.current = true
      setCourtView('request')
    } else if (view === 'cases') {
      setCourtView('cases')
    }
  }, [location.search, isCourtUser])

  const fetchEvidence = async () => {
    try {
      const response = await evidenceAPI.list()
      setEvidence(response.data.evidence || [])
    } catch {
      setError('Failed to load uploaded files')
    }
  }

  const fetchCases = async (options = {}) => {
    const { silent = false } = options
    if (!silent) {
      setCaseLoading(true)
    }
    try {
      const response = await evidenceAPI.listCases()
      setCases(response.data.cases || [])
    } catch {
      if (!silent) {
        setError('Failed to load case files')
      }
    } finally {
      if (!silent) {
        setCaseLoading(false)
      }
    }
  }

  const fetchInvestigators = async () => {
    setInvestigatorLoading(true)
    try {
      const response = await evidenceAPI.listInvestigators()
      setInvestigators(response.data.investigators || [])
      setInvestigatorError('')
    } catch (err) {
      setInvestigators([])
      setInvestigatorError(err.response?.data?.error || 'Failed to load investigators list')
    } finally {
      setInvestigatorLoading(false)
    }
  }

  const fetchCourtUsers = async () => {
    if (user?.role !== 'admin') return
    setCourtUsersLoading(true)
    try {
      const response = await evidenceAPI.listCourtUsers()
      setCourtUsers(response.data.court_users || [])
    } catch (err) {
      setCourtUsers([])
      setError(err.response?.data?.error || 'Failed to load court users')
    } finally {
      setCourtUsersLoading(false)
    }
  }

  const fetchCourtAccessRequests = async (options = {}) => {
    if (!['admin', 'court_user'].includes(user?.role)) return
    const { silent = false } = options
    if (!silent) {
      setCourtAccessRequestsLoading(true)
    }
    try {
      const params = user?.role === 'admin' ? { status: 'pending', limit: 200 } : { status: 'all', limit: 100 }
      const response = await evidenceAPI.listCourtAccessRequests(params)
      setCourtAccessRequests(response.data.requests || [])
      setRequestDurationOverrides({})
    } catch (err) {
      setCourtAccessRequests([])
      if (!silent) {
        setError(err.response?.data?.error || 'Failed to load court access requests')
      }
    } finally {
      if (!silent) {
        setCourtAccessRequestsLoading(false)
      }
    }
  }

  const fetchCaseCourtAccessGrants = async (caseId) => {
    if (user?.role !== 'admin' || !caseId) {
      setCaseCourtAccessGrants([])
      return
    }
    setCaseCourtAccessGrantsLoading(true)
    try {
      const response = await evidenceAPI.listCaseCourtAccessGrants(caseId, false)
      setCaseCourtAccessGrants(response.data.grants || [])
    } catch (err) {
      setCaseCourtAccessGrants([])
      setError(err.response?.data?.error || 'Failed to load active court access grants')
    } finally {
      setCaseCourtAccessGrantsLoading(false)
    }
  }

  useEffect(() => {
    const bootstrap = async () => {
      if (isCreatedMode) {
        const tasks = [fetchEvidence(), fetchCases()]
        if (user?.role === 'admin') {
          tasks.push(fetchCourtUsers())
          tasks.push(fetchCourtAccessRequests())
        } else if (user?.role === 'court_user') {
          tasks.push(fetchCourtAccessRequests())
        }
        await Promise.all(tasks)
      }
    }

    bootstrap()
  }, [isCreatedMode, user?.role])

  useEffect(() => {
    const shouldLoadInvestigators = isCreateMode || (isCreatedMode && user?.role === 'admin')
    if (!shouldLoadInvestigators) {
      return
    }
    fetchInvestigators()
  }, [isCreateMode, isCreatedMode, user?.role])

  useEffect(() => {
    if (!isInvestigator) return
    setCaseData((prev) => ({
      ...prev,
      status: 'open',
      assigned_investigator_id: '',
    }))
  }, [isInvestigator])

  useEffect(() => {
    const clockId = window.setInterval(() => setLiveClock(new Date()), 30000)
    return () => window.clearInterval(clockId)
  }, [])

  useEffect(() => {
    if (!isCourtUser || !isCreatedMode) return undefined
    const id = window.setInterval(() => {
      fetchCases({ silent: true })
      fetchCourtAccessRequests({ silent: true })
    }, 15000)
    return () => window.clearInterval(id)
  }, [isCourtUser, isCreatedMode])

  useEffect(() => {
    return () => {
      if (extensionFeedbackTimerRef.current) {
        window.clearTimeout(extensionFeedbackTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!successMessage.includes('sealed')) return
    if (uploadMode !== 'evidence') return
    if (!uploadData.file) return
    setSealerState('sealed')
    triggerSealFlash()
  }, [successMessage, uploadMode, uploadData.file])

  useEffect(() => {
    return () => {
      if (sealFlashTimerRef.current) {
        window.clearTimeout(sealFlashTimerRef.current)
      }
      if (successMessageTimerRef.current) {
        window.clearTimeout(successMessageTimerRef.current)
      }
      if (caseSuccessTimerRef.current) {
        window.clearTimeout(caseSuccessTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!successMessage) return undefined
    if (successMessageTimerRef.current) {
      window.clearTimeout(successMessageTimerRef.current)
    }
    successMessageTimerRef.current = window.setTimeout(() => {
      setSuccessMessage('')
      successMessageTimerRef.current = null
    }, 4600)
    return undefined
  }, [successMessage])

  useEffect(() => {
    if (!isCourtUser) return undefined
    const id = window.setInterval(() => setSessionNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [isCourtUser])

  useEffect(() => {
    if (!isCourtUser && courtView !== 'cases') {
      setCourtView('cases')
    }
  }, [isCourtUser, courtView])

  useEffect(() => {
    if (!isCourtUser) return
    if (courtView !== 'request') return
    if (!courtAccessFormScrollRef.current) return
    courtAccessFormScrollRef.current = false
    window.requestAnimationFrame(() => {
      courtAccessFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [courtView, isCourtUser])

  useEffect(() => {
    return () => {
      if (activeBookPageUrl) {
        URL.revokeObjectURL(activeBookPageUrl)
      }
    }
  }, [activeBookPageUrl])

  useEffect(() => {
    setInspectedEvidence(null)
  }, [activeCaseNumber])

  const resetCasePreview = () => {
    setPendingCasePayload(null)
    setPreviewLedgerNumber('')
  }

  const updateCaseData = (nextOrUpdater) => {
    setCaseData((prev) => (
      typeof nextOrUpdater === 'function'
        ? nextOrUpdater(prev)
        : { ...prev, ...nextOrUpdater }
    ))
    resetCasePreview()
  }

  const isCaseFormValid = () => {
    if (
      !caseData.case_number ||
      !caseData.case_title ||
      !caseData.incident_state_code ||
      !caseData.incident_district_code ||
      !caseData.incident_location ||
      (!isInvestigator && !caseData.status)
    ) {
      setError(
        isInvestigator
          ? 'Case number, title, state, district, and reported station are required'
          : 'Case number, title, state, district, reported station, and status are required'
      )
      return false
    }
    if (!isInvestigator && caseData.status === 'investigation' && !caseData.assigned_investigator_id) {
      setError('Select an investigator from the users list when status is Under Investigation')
      return false
    }
    return true
  }

  const buildCasePayload = () => ({
    case_number: caseData.case_number.trim().toUpperCase(),
    case_title: caseData.case_title.trim(),
    incident_state: caseData.incident_state,
    incident_district: caseData.incident_district,
    state_code: caseData.incident_state_code,
    district_code: caseData.incident_district_code,
    incident_location: caseData.incident_location.trim(),
    status: isInvestigator ? 'open' : caseData.status,
    assigned_investigator_id: isInvestigator
      ? null
      : (caseData.assigned_investigator_id ? Number(caseData.assigned_investigator_id) : null),
  })

  const handlePreviewCaseLedger = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')

    if (!isCaseFormValid()) {
      return
    }

    const payload = buildCasePayload()

    try {
      const response = await evidenceAPI.previewCaseLedger(payload)
      const ledgerNumber = response?.data?.quantum_ledger_number
      if (!ledgerNumber) {
        setError('Failed to generate Quantum Ledger Number')
        return
      }
      setPendingCasePayload(payload)
      setPreviewLedgerNumber(ledgerNumber)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate Quantum Ledger Number')
    }
  }

  const performCreateCaseFile = async (pqidValue) => {
    setError('')
    setSuccessMessage('')
    setCaseSuccessPopup('')

    if (!pendingCasePayload || !previewLedgerNumber) {
      const message = 'Submit the form first to generate a Quantum Ledger Number'
      setError(message)
      throw new Error(message)
    }

    try {
      const response = await evidenceAPI.createCase({
        ...pendingCasePayload,
        quantum_ledger_number: previewLedgerNumber,
        pqid: pqidValue,
      })
      const createdLedgerNumber = response?.data?.case?.quantum_ledger_number || previewLedgerNumber
      setCaseData({
        ...initialCaseData,
        status: isInvestigator ? 'open' : '',
      })
      resetCasePreview()
      const message = isInvestigator
        ? `Case submitted for admin approval. Quantum Ledger Number: ${createdLedgerNumber}`
        : `Case file created successfully. Quantum Ledger Number: ${createdLedgerNumber}`
      setCaseSuccessPopup(message)
      if (caseSuccessTimerRef.current) {
        window.clearTimeout(caseSuccessTimerRef.current)
      }
      caseSuccessTimerRef.current = window.setTimeout(() => {
        setCaseSuccessPopup('')
        caseSuccessTimerRef.current = null
      }, 4600)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create case file')
      throw err
    }
  }

  const handleCreateCaseFile = () => {
    if (!pendingCasePayload || !previewLedgerNumber) {
      setError('Submit the form first to generate a Quantum Ledger Number')
      return
    }
    const description = isInvestigator
      ? 'Enter your PQID to submit this case file for admin approval.'
      : 'Enter your PQID to create this case file.'
    const confirmLabel = isInvestigator ? 'Verify PQID & Submit Case' : 'Verify PQID & Create Case'
    openPqidPrompt(
      {
        title: 'Approve Case Creation',
        description,
        confirmLabel,
      },
      (pqidValue) => performCreateCaseFile(pqidValue)
    )
  }

  const handleStateChange = (stateCode) => {
    const state = getStateByCode(stateCode)
    updateCaseData((prev) => ({
      ...prev,
      incident_state_code: stateCode,
      incident_state: state?.name || '',
      incident_district_code: '',
      incident_district: '',
    }))
  }

  const handleDistrictChange = (districtCode) => {
    const district = districtOptions.find((entry) => entry.code === districtCode)
    updateCaseData((prev) => ({
      ...prev,
      incident_district_code: districtCode,
      incident_district: district?.name || '',
    }))
  }

  const handleClearCaseForm = () => {
    setCaseData({
      ...initialCaseData,
      status: isInvestigator ? 'open' : '',
    })
    setError('')
    setSuccessMessage('')
    resetCasePreview()
  }

  const resetHashingState = () => {
    setHashingState({
      status: 'idle',
      progress: 0,
      hash: '',
      error: '',
    })
  }

  const resetLocationState = (message = 'Awaiting file selection.') => {
    locationTaskRef.current += 1
    setLocationStatus('idle')
    setLocationMessage(message)
    setUploadData((prev) => ({
      ...prev,
      gps_location: '',
    }))
  }

  const resetEvidenceUploadForm = () => {
    hashingTaskRef.current += 1
    setSealerState('pending')
    setSealFlash(false)
    setSealerError('')
    closePqidPrompt()
    resetLocationState()
    setHashingState({
      status: 'idle',
      progress: 0,
      hash: '',
      error: '',
    })
    setUploadData((prev) => ({
      ...prev,
      description: '',
      file: null,
      gps_location: '',
      intake_timestamp: '',
      client_sha3_512: '',
      seal_for_transport: true,
    }))
  }

  const triggerSealFlash = () => {
    if (sealFlashTimerRef.current) {
      window.clearTimeout(sealFlashTimerRef.current)
    }
    setSealFlash(true)
    sealFlashTimerRef.current = window.setTimeout(() => {
      setSealFlash(false)
      sealFlashTimerRef.current = null
    }, 1800)
  }

  const formatCoordinates = (coords) => {
    const lat = Number.isFinite(coords?.latitude) ? coords.latitude.toFixed(5) : ''
    const lon = Number.isFinite(coords?.longitude) ? coords.longitude.toFixed(5) : ''
    const accuracy = Number.isFinite(coords?.accuracy) ? ` ±${Math.round(coords.accuracy)}m` : ''
    const base = [lat, lon].filter(Boolean).join(', ')
    return base ? `${base}${accuracy}` : ''
  }

  const captureDeviceLocation = () => {
    locationTaskRef.current += 1
    const taskId = locationTaskRef.current
    if (!navigator.geolocation) {
      setLocationStatus('unavailable')
      setLocationMessage('Location services are unavailable on this device.')
      setUploadData((prev) => ({ ...prev, gps_location: '' }))
      return
    }
    setLocationStatus('locating')
    setLocationMessage('Locating device...')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (locationTaskRef.current !== taskId) return
        const formatted = formatCoordinates(position.coords)
        setUploadData((prev) => ({
          ...prev,
          gps_location: formatted,
        }))
        setLocationStatus('ready')
        setLocationMessage(formatted ? 'Location captured automatically.' : 'Location captured.')
      },
      (error) => {
        if (locationTaskRef.current !== taskId) return
        let message = 'Unable to capture location.'
        if (error?.code === 1) message = 'Location permission denied in the browser.'
        if (error?.code === 2) message = 'Location unavailable. Check GPS/network.'
        if (error?.code === 3) message = 'Location request timed out.'
        setUploadData((prev) => ({ ...prev, gps_location: '' }))
        setLocationStatus('denied')
        setLocationMessage(message)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const handleEvidenceFileSelection = async (file) => {
    hashingTaskRef.current += 1
    const taskId = hashingTaskRef.current
    if (!file) {
      resetHashingState()
      setSealerState('pending')
      setSealFlash(false)
      setSealerError('')
      resetLocationState()
      setSuccessMessage('')
      setUploadData((prev) => ({
        ...prev,
        file: null,
        intake_timestamp: '',
        client_sha3_512: '',
      }))
      return
    }

    const intakeTimestamp = new Date().toISOString()
    setSealerState('armed')
    triggerSealFlash()
    setSealerError('')
    setSuccessMessage('')
    setUploadData((prev) => ({
      ...prev,
      file,
      intake_timestamp: intakeTimestamp,
      client_sha3_512: '',
    }))
    captureDeviceLocation()
    setHashingState({
      status: 'hashing',
      progress: 0,
      hash: '',
      error: '',
    })

    try {
      const hash = await hashFileSha3(file, (progress) => {
        if (hashingTaskRef.current !== taskId) return
        setHashingState((prev) => ({
          ...prev,
          status: 'hashing',
          progress,
        }))
      })
      if (hashingTaskRef.current !== taskId) return
      setHashingState({
        status: 'complete',
        progress: 100,
        hash,
        error: '',
      })
      setUploadData((prev) => ({
        ...prev,
        client_sha3_512: hash,
      }))
    } catch (err) {
      if (hashingTaskRef.current !== taskId) return
      setSealerState('error')
      setHashingState({
        status: 'error',
        progress: 0,
        hash: '',
        error: 'Unable to compute SHA3-512 hash.',
      })
    }
  }

  const buildIntakeMetadata = () => {
    if (uploadMode !== 'evidence') return null
    const intakeTimestamp = uploadData.intake_timestamp || new Date().toISOString()
    const payload = {
      gps_location: uploadData.gps_location.trim() || undefined,
      intake_timestamp: intakeTimestamp,
      client_sha3_512: uploadData.client_sha3_512 || undefined,
      seal_for_transport: Boolean(uploadData.seal_for_transport),
    }
    const hasValue = Object.values(payload).some((value) => value !== undefined)
    return hasValue ? payload : null
  }

  const handleUploadFileChange = (file) => {
    if (uploadMode === 'case_file') {
      setUploadData((prev) => ({ ...prev, file }))
      return
    }
    handleEvidenceFileSelection(file)
  }

  const clearSelectedFile = () => {
    hashingTaskRef.current += 1
    setSealerState('pending')
    setSealFlash(false)
    setSealerError('')
    resetLocationState()
    setUploadData((prev) => ({
      ...prev,
      file: null,
      client_sha3_512: '',
    }))
    setHashingState({
      status: 'idle',
      progress: 0,
      hash: '',
      error: '',
    })
  }

  const openUploadForCase = (caseNumber, mode = 'evidence') => {
    setUploadCaseId(caseNumber)
    setUploadMode(mode)
    setShowPqidPrompt(false)
    setPqidInput('')
    setPqidError('')
    setUploadData({
      case_id: caseNumber,
      description: '',
      file: null,
      gps_location: '',
      intake_timestamp: '',
      client_sha3_512: '',
      seal_for_transport: true,
    })
    setSealerState('pending')
    setSealFlash(false)
    setSealerError('')
    resetLocationState()
    hashingTaskRef.current += 1
    resetHashingState()
    setError('')
    setSuccessMessage('')
  }

  const closeUploadForm = () => {
    setUploadCaseId(null)
    setUploadMode('evidence')
    setUploadData(initialUploadData)
    closePqidPrompt()
    setSealerState('pending')
    setSealFlash(false)
    setSealerError('')
    resetLocationState()
    hashingTaskRef.current += 1
    resetHashingState()
  }

  const closePqidPrompt = () => {
    setShowPqidPrompt(false)
    setPqidInput('')
    setPqidError('')
    setPqidSubmitting(false)
    pqidActionRef.current = null
  }

  const openPqidPrompt = (meta = {}, onConfirm = null) => {
    if (isPqidBypass) {
      if (pqidSubmitting) {
        return
      }
      setPqidSubmitting(true)
      Promise.resolve(typeof onConfirm === 'function' ? onConfirm('') : null)
        .catch(() => {})
        .finally(() => setPqidSubmitting(false))
      return
    }
    setPqidPromptMeta({
      title: meta.title || 'PQID Verification',
      description: meta.description || 'Enter your PQID to continue.',
      confirmLabel: meta.confirmLabel || 'Verify PQID',
    })
    pqidActionRef.current = onConfirm
    setPqidInput('')
    setPqidError('')
    setPqidSubmitting(false)
    setShowPqidPrompt(true)
  }

  const handlePqidLockout = (payload) => {
    closePqidPrompt()
    localStorage.removeItem('access_token')
    window.location.href = '/login'
  }

  const performEvidenceUpload = async (pqidValue) => {
    setError('')
    setSuccessMessage('')
    setSealerError('')

    if (hashingState.status === 'hashing') {
      setError('Hashing in progress. Please wait for SHA3-512 to complete.')
      return
    }
    if (!uploadData.client_sha3_512) {
      setError('SHA3-512 hash is missing. Please re-select the file to generate the fingerprint.')
      return
    }
    if (!uploadData.seal_for_transport) {
      setError('Seal for Transport must be enabled before uploading evidence.')
      return
    }

    const formData = new FormData()
    formData.append('case_id', normalizeCaseRef(uploadData.case_id))
    formData.append('description', uploadData.description)
    formData.append('file', uploadData.file)
    formData.append('pqid', pqidValue)
    const intakeMetadata = buildIntakeMetadata()
    if (intakeMetadata) {
      formData.append('intake_metadata', JSON.stringify(intakeMetadata))
    }

    setSealerState('sealing')
    try {
      await evidenceAPI.upload(formData)
      setSealerState('sealed')
      triggerSealFlash()
      setSuccessMessage(
        `Evidence uploaded, approved, and sealed successfully to case ${normalizeCaseRef(uploadData.case_id)}.`
      )
      resetEvidenceUploadForm()
      await fetchEvidence()
    } catch (err) {
      setSealerState('error')
      setSealFlash(false)
      const message = err.response?.data?.error || 'Upload failed'
      setSealerError(message)
      setError(message)
      throw err
    }
  }

  const handlePqidSubmit = async (e) => {
    e.preventDefault()
    setPqidError('')
    const trimmed = pqidInput.trim()
    if (!trimmed) {
      setPqidError('Please enter your PQID.')
      return
    }
    if (!pqidActionRef.current) {
      closePqidPrompt()
      return
    }
    setPqidSubmitting(true)
    try {
      await pqidActionRef.current(trimmed)
      closePqidPrompt()
    } catch (err) {
      const payload = err.response?.data || {}
      if (payload.lockout) {
        handlePqidLockout(payload)
        return
      }
      const message = payload.error || err.message || 'PQID verification failed.'
      if (String(message).toLowerCase().includes('pqid')) {
        setPqidError(message)
      } else {
        setError(message)
        closePqidPrompt()
      }
    } finally {
      setPqidSubmitting(false)
    }
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')
    setSealerError('')

    if (!uploadData.case_id || !uploadData.file) {
      setError('Case number and file are required')
      return
    }
    try {
      if (uploadMode === 'case_file') {
        const selectedCase = cases.find(
          (entry) => normalizeCaseRef(entry.case_number) === normalizeCaseRef(uploadData.case_id)
        )
        if (!selectedCase?.id) {
          setError('Case file id is missing')
          return
        }
        const formData = new FormData()
        formData.append('file', uploadData.file)

        await evidenceAPI.uploadCaseBookPage(selectedCase.id, formData)
        setSuccessMessage(`Case file uploaded successfully to case ${normalizeCaseRef(uploadData.case_id)}.`)
        closeUploadForm()
        await fetchCases()
        return
      }

      openPqidPrompt(
        {
          title: 'Approve Evidence Upload',
          description: 'Enter your PQID to approve this evidence upload.',
          confirmLabel: 'Verify PQID & Upload',
        },
        (pqidValue) => performEvidenceUpload(pqidValue)
      )
    } catch (err) {
      setSealerState('error')
      setSealFlash(false)
      const message = err.response?.data?.error || 'Upload failed'
      setSealerError(message)
      setError(message)
    }
  }

  const closeCaseBookViewer = () => {
    setShowCaseBookViewer(false)
    setActiveCaseBook(null)
    setActiveBookPageIndex(0)
    setActiveBookPageMimeType('')
    setBookPageLoading(false)
    if (activeBookPageUrl) {
      URL.revokeObjectURL(activeBookPageUrl)
      setActiveBookPageUrl('')
    }
  }

  const openCaseBookViewer = async (caseItem) => {
    if (!caseItem?.id) {
      setError('Case file id is missing')
      return
    }
    setCaseBookLoading(true)
    setError('')
    try {
      const response = await evidenceAPI.getCaseBook(caseItem.id)
      setActiveCaseBook(response.data || null)
      setActiveBookPageIndex(0)
      setShowCaseBookViewer(true)
      setActiveBookPageMimeType('')
      if (activeBookPageUrl) {
        URL.revokeObjectURL(activeBookPageUrl)
        setActiveBookPageUrl('')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load case book')
    } finally {
      setCaseBookLoading(false)
    }
  }

  const loadCaseBookPageContent = async (page) => {
    if (!page?.id || page.type === 'cover') {
      if (activeBookPageUrl) {
        URL.revokeObjectURL(activeBookPageUrl)
        setActiveBookPageUrl('')
      }
      setActiveBookPageMimeType('')
      return
    }
    setBookPageLoading(true)
    try {
      const response = await evidenceAPI.getCaseBookPageContent(page.id)
      const blob = response.data
      const blobUrl = URL.createObjectURL(blob)
      setActiveBookPageMimeType(page.mime_type || blob.type || '')
      if (activeBookPageUrl) {
        URL.revokeObjectURL(activeBookPageUrl)
      }
      setActiveBookPageUrl(blobUrl)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load case book page')
    } finally {
      setBookPageLoading(false)
    }
  }

  const performAssignInvestigator = async (caseItem, pqidValue) => {
    setCaseActionLoading(true)
    setError('')
    setSuccessMessage('')
    try {
      await evidenceAPI.assignCaseInvestigator(caseItem.id, Number(activeCaseInvestigatorId), pqidValue)
      await fetchCases()
      const normalizedStatus = String(caseItem.status || '').trim().toLowerCase()
      const hasAssignedInvestigator = Boolean(caseItem.assigned_investigator_id)
      const isReassign = normalizedStatus === 'investigation' || hasAssignedInvestigator
      if (isReassign) {
        setShowReassignPicker(false)
      }
      setSuccessMessage(
        isReassign
          ? `Investigator reassigned successfully for case ${normalizeCaseRef(caseItem.case_number)}.`
          : `Investigator assigned successfully. Case ${normalizeCaseRef(caseItem.case_number)} moved to Under Investigation.`
      )
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign investigator')
      throw err
    } finally {
      setCaseActionLoading(false)
    }
  }

  const handleAssignInvestigator = (caseItem) => {
    if (!caseItem?.id) {
      setError('Case file id is missing')
      return
    }
    if (!activeCaseInvestigatorId) {
      setError('Select an investigator from the users list before assigning')
      return
    }

    const normalizedStatus = String(caseItem.status || '').trim().toLowerCase()
    const hasAssignedInvestigator = Boolean(caseItem.assigned_investigator_id)
    const isReassign = normalizedStatus === 'investigation' || hasAssignedInvestigator

    openPqidPrompt(
      {
        title: isReassign ? 'Reassign Investigator' : 'Assign Investigator',
        description: isReassign
          ? 'Enter your PQID to confirm reassignment for this case.'
          : 'Enter your PQID to assign an investigator to this case.',
        confirmLabel: isReassign ? 'Verify PQID & Reassign' : 'Verify PQID & Assign',
      },
      (pqidValue) => performAssignInvestigator(caseItem, pqidValue)
    )
  }

  const performCloseCase = async (caseItem, pqidValue) => {
    setCaseActionLoading(true)
    setError('')
    setSuccessMessage('')
    try {
      await evidenceAPI.closeCase(caseItem.id, pqidValue)
      await fetchCases()
      setShowReassignPicker(false)
      setSuccessMessage(`Case ${normalizeCaseRef(caseItem.case_number)} marked as Closed.`)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to close case')
      throw err
    } finally {
      setCaseActionLoading(false)
    }
  }

  const handleCloseCase = (caseItem) => {
    if (!caseItem?.id) {
      setError('Case file id is missing')
      return
    }
    if (!window.confirm(`Close case ${normalizeCaseRef(caseItem.case_number)}?`)) {
      return
    }

    openPqidPrompt(
      {
        title: 'Close Case',
        description: 'Enter your PQID to confirm closing this case.',
        confirmLabel: 'Verify PQID & Close',
      },
      (pqidValue) => performCloseCase(caseItem, pqidValue)
    )
  }

  const performReopenCase = async (caseItem, pqidValue) => {
    setCaseActionLoading(true)
    setError('')
    setSuccessMessage('')
    try {
      await evidenceAPI.reopenCase(caseItem.id, pqidValue)
      await fetchCases()
      setShowReassignPicker(false)
      setSuccessMessage(`Case ${normalizeCaseRef(caseItem.case_number)} reopened and moved to Open.`)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reopen case')
      throw err
    } finally {
      setCaseActionLoading(false)
    }
  }

  const handleReopenCase = (caseItem) => {
    if (!caseItem?.id) {
      setError('Case file id is missing')
      return
    }
    if (!window.confirm(`Reopen case ${normalizeCaseRef(caseItem.case_number)}?`)) {
      return
    }

    openPqidPrompt(
      {
        title: 'Reopen Case',
        description: 'Enter your PQID to confirm reopening this case.',
        confirmLabel: 'Verify PQID & Reopen',
      },
      (pqidValue) => performReopenCase(caseItem, pqidValue)
    )
  }

  const handleCourtAccessRequestSubmit = (e) => {
    e.preventDefault()
    const caseNumber = normalizeCaseRef(courtAccessForm.case_number)
    if (!caseNumber) {
      setError('Case number is required to request access')
      return
    }
    openPqidPrompt(
      {
        title: 'Request Court Access',
        description: 'Enter your PQID to submit this court access request.',
        confirmLabel: 'Verify PQID & Send Request',
      },
      (pqidValue) => performCourtAccessRequest(pqidValue)
    )
  }

  const performCourtAccessRequest = async (pqidValue, overrides = {}, options = {}) => {
    setError('')
    setSuccessMessage('')

    const caseNumber = normalizeCaseRef(overrides.case_number ?? courtAccessForm.case_number)
    const ledgerNumber = String((overrides.quantum_ledger_number ?? courtAccessForm.quantum_ledger_number) || '').trim().toUpperCase()
    const requestedUnit = overrides.requested_duration_unit ?? courtAccessForm.requested_duration_unit ?? 'minutes'
    const requestedValue = overrides.requested_duration_value ?? courtAccessForm.requested_duration_value
    const requestedDuration = overrides.requested_duration_minutes != null
      ? clampCourtAccessMinutes(overrides.requested_duration_minutes, DEFAULT_COURT_ACCESS_MINUTES)
      : durationValueToMinutes(requestedValue, requestedUnit, DEFAULT_COURT_ACCESS_MINUTES)
    const reason = String((overrides.reason ?? courtAccessForm.reason) || '').trim()

    if (!caseNumber) {
      setError('Case number is required to request access')
      throw new Error('Case number is required to request access')
    }
    if (!Number.isFinite(requestedDuration) || requestedDuration < 1) {
      setError('Requested duration must be at least 1 minute')
      throw new Error('Requested duration must be at least 1 minute')
    }

    try {
      await evidenceAPI.requestCourtAccess({
        case_number: caseNumber || undefined,
        quantum_ledger_number: ledgerNumber || undefined,
        requested_duration_minutes: requestedDuration,
        reason: reason || undefined,
        pqid: pqidValue,
      })
      const message = `Successfully requested time extension for ${formatDurationMinutes(requestedDuration)}.`
      if (options.showExtensionFeedback) {
        showExtensionFeedback(message)
      }
      setSuccessMessage('Court access request submitted to admin')
      setCourtAccessForm({
        case_number: '',
        quantum_ledger_number: '',
        requested_duration_value: String(DEFAULT_COURT_ACCESS_MINUTES),
        requested_duration_unit: 'minutes',
        reason: '',
      })
      await fetchCourtAccessRequests()
      return true
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit court access request')
      throw err
    }
  }

  const getCourtSessionInfo = (caseItem) => {
    if (!caseItem) {
      return {
        label: 'Expired',
        tone: 'expired',
        countdown: '00:00:00',
        expiresAt: null,
        requestedUntil: null,
      }
    }
    const expiresAt = parseIsoDate(caseItem.court_access_expires_at)
    if (expiresAt && expiresAt.getTime() > sessionNow.getTime()) {
      const remaining = expiresAt.getTime() - sessionNow.getTime()
      return {
        label: 'Active',
        tone: 'active',
        countdown: formatCountdown(remaining),
        expiresAt,
        requestedUntil: null,
      }
    }

    const caseNumber = normalizeCaseRef(caseItem.case_number)
    const ledger = String(caseItem.quantum_ledger_number || '').trim().toUpperCase()
    const relevantRequests = courtAccessRequests.filter((entry) => {
      const entryCase = normalizeCaseRef(entry.case_number || entry.requested_case_number || '')
      const entryLedger = String(entry.quantum_ledger_number || '').trim().toUpperCase()
      return (caseNumber && entryCase === caseNumber) || (ledger && entryLedger === ledger)
    })

    const pending = relevantRequests.find(
      (entry) => String(entry.status || '').toLowerCase() === 'pending'
    )
    if (pending) {
      return {
        label: 'Pending Admin Approval',
        tone: 'pending',
        countdown: '--:--:--',
        expiresAt: null,
        requestedUntil: null,
      }
    }

    const approved = relevantRequests.find(
      (entry) => String(entry.status || '').toLowerCase() === 'approved'
    )
    const approvedExpiry = parseIsoDate(approved?.granted_expires_at)
    return {
      label: 'Expired',
      tone: 'expired',
      countdown: '00:00:00',
      expiresAt: approvedExpiry,
      requestedUntil: approvedExpiry,
    }
  }

  const openCourtRequestView = (scrollToForm = false) => {
    if (!isCourtUser) return
    if (scrollToForm && courtView === 'request') {
      window.requestAnimationFrame(() => {
        courtAccessFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } else if (scrollToForm) {
      courtAccessFormScrollRef.current = true
    }
    setCourtView('request')
  }

  const handleRequestExtension = (caseItem) => {
    if (!caseItem) return
    const caseNumber = normalizeCaseRef(caseItem.case_number)
    setExtensionTarget({
      case_number: caseNumber,
      quantum_ledger_number: caseItem.quantum_ledger_number || '',
    })
    setExtensionValue((prev) => String(clampExtensionValue(prev, extensionUnit)))
    setShowExtensionDialog(true)
  }

  const handleConfirmExtension = () => {
    if (!extensionTarget) return
    const meta = extensionUnitMeta(extensionUnit)
    const safeValue = clampExtensionValue(extensionValue, extensionUnit)
    const requestedDuration = clampCourtAccessMinutes(
      safeValue * meta.multiplier,
      DEFAULT_COURT_ACCESS_MINUTES
    )
    const payload = {
      case_number: extensionTarget.case_number,
      quantum_ledger_number: extensionTarget.quantum_ledger_number || courtAccessForm.quantum_ledger_number,
      requested_duration_minutes: requestedDuration,
      reason: courtAccessForm.reason || `Extension requested for hearing session ${extensionTarget.case_number}`,
    }
    setCourtAccessForm((prev) => ({
      ...prev,
      case_number: payload.case_number,
      quantum_ledger_number: payload.quantum_ledger_number,
      requested_duration_value: String(safeValue),
      requested_duration_unit: extensionUnit,
      reason: payload.reason,
    }))
    openPqidPrompt(
      {
        title: 'Request Extension',
        description: 'Enter your PQID to submit this access extension request.',
        confirmLabel: 'Verify PQID & Request',
      },
      async (pqidValue) => {
        try {
          const ok = await performCourtAccessRequest(pqidValue, payload, { showExtensionFeedback: true })
          if (ok) {
            setShowExtensionDialog(false)
          } else {
            openCourtRequestView(true)
          }
        } catch (err) {
          openCourtRequestView(true)
          throw err
        }
      }
    )
  }

  const bumpCourtAccessDuration = (delta) => {
    setCourtAccessForm((prev) => {
      const unit = prev.requested_duration_unit || 'minutes'
      const current = clampExtensionValue(prev.requested_duration_value, unit)
      const next = clampExtensionValue(Number(current) + delta, unit)
      return { ...prev, requested_duration_value: String(next) }
    })
  }

  const bumpAdminGrantDuration = (delta) => {
    setAdminGrantForm((prev) => {
      const unit = prev.duration_unit || 'minutes'
      const current = clampExtensionValue(prev.duration_value, unit)
      const next = clampExtensionValue(Number(current) + delta, unit)
      return { ...prev, duration_value: String(next) }
    })
  }

  const bumpRequestDurationOverride = (requestId, delta, fallbackMinutes) => {
    setRequestDurationOverrides((prev) => {
      const unit = requestDurationUnitOverrides[requestId] || 'minutes'
      const currentRaw = prev[requestId]
      const baseValue = currentRaw ?? minutesToDurationValue(fallbackMinutes, unit)
      const current = clampExtensionValue(baseValue, unit)
      const next = clampExtensionValue(Number(current) + delta, unit)
      return { ...prev, [requestId]: String(next) }
    })
  }

  const performAdminGrantCourtAccess = async (caseItem, pqidValue) => {
    setCaseActionLoading(true)
    try {
      const durationMinutes = durationValueToMinutes(
        adminGrantForm.duration_value,
        adminGrantForm.duration_unit,
        DEFAULT_COURT_ACCESS_MINUTES
      )
      await evidenceAPI.grantCaseCourtAccess(caseItem.id, {
        court_user_id: Number(adminGrantForm.court_user_id),
        duration_minutes: durationMinutes,
        notes: String(adminGrantForm.notes || '').trim() || undefined,
        pqid: pqidValue,
      })
      setSuccessMessage(`Court access granted for case ${normalizeCaseRef(caseItem.case_number)}.`)
      setAdminGrantForm({
        court_user_id: '',
        duration_value: String(DEFAULT_COURT_ACCESS_MINUTES),
        duration_unit: 'minutes',
        notes: '',
      })
      await Promise.all([
        fetchCaseCourtAccessGrants(caseItem.id),
        fetchCourtAccessRequests(),
      ])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to grant court access')
      throw err
    } finally {
      setCaseActionLoading(false)
    }
  }

  const handleAdminGrantCourtAccess = (caseItem) => {
    if (user?.role !== 'admin') return
    setError('')
    setSuccessMessage('')

    if (!caseItem?.id) {
      setError('Case file id is missing')
      return
    }
    if (!adminGrantForm.court_user_id) {
      setError('Select a court user')
      return
    }

    const durationMinutes = durationValueToMinutes(
      adminGrantForm.duration_value,
      adminGrantForm.duration_unit,
      DEFAULT_COURT_ACCESS_MINUTES
    )
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      setError('Duration must be at least 1 minute')
      return
    }

    openPqidPrompt(
      {
        title: 'Grant Court Access',
        description: 'Enter your PQID to grant court access for this case.',
        confirmLabel: 'Verify PQID & Grant Access',
      },
      (pqidValue) => performAdminGrantCourtAccess(caseItem, pqidValue)
    )
  }

  const handleApproveCourtAccessRequest = async (requestItem) => {
    if (user?.role !== 'admin' || !requestItem?.id) return
    setError('')
    setSuccessMessage('')

    const requestUnit = requestDurationUnitOverrides[requestItem.id] || 'minutes'
    const fallbackMinutes = Number(requestItem.requested_duration_minutes || DEFAULT_COURT_ACCESS_MINUTES)
    const selectedValue = requestDurationOverrides[requestItem.id]
    const effectiveValue = selectedValue ?? minutesToDurationValue(fallbackMinutes, requestUnit)
    const durationValue = durationValueToMinutes(effectiveValue, requestUnit, fallbackMinutes)
    if (!Number.isFinite(durationValue) || durationValue < 1) {
      setError('Grant duration must be at least 1 minute')
      return
    }

    try {
      await evidenceAPI.approveCourtAccessRequest(requestItem.id, {
        grant_duration_minutes: durationValue,
      })
      setSuccessMessage('Court access request approved')
      await Promise.all([
        fetchCourtAccessRequests(),
        fetchCases(),
        activeCase?.id ? fetchCaseCourtAccessGrants(activeCase.id) : Promise.resolve(),
      ])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve court access request')
    }
  }

  const handleDenyCourtAccessRequest = async (requestItem) => {
    if (user?.role !== 'admin' || !requestItem?.id) return
    setError('')
    setSuccessMessage('')

    const notes = window.prompt('Reason for denying this request (optional):', '') || ''
    try {
      await evidenceAPI.denyCourtAccessRequest(requestItem.id, {
        notes: notes.trim() || undefined,
      })
      setSuccessMessage('Court access request denied')
      await fetchCourtAccessRequests()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to deny court access request')
    }
  }

  const viewCustodyChain = async (entry, labelOverride) => {
    const evidenceId = typeof entry === 'string' ? entry : entry?.id
    if (!evidenceId) return
    try {
      const response = await evidenceAPI.custodyChain(evidenceId)
      const label =
        labelOverride
        || (typeof entry === 'string' ? 'Evidence file' : entry?.label || 'Evidence file')
      setSelectedEvidence({
        id: evidenceId,
        label,
        accessLevel: entry?.access_level,
        custodyRecords: response.data.custody_chain || [],
      })
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      setCustodyPreview(null)
      setCustodyPreviewError('')
    } catch {
      setError('Failed to load custody chain')
    }
  }

  const submitToCourt = async (evidenceId) => {
    if (!confirm('Are you sure you want to submit this file to the court? This action is irreversible.')) {
      return
    }

    try {
      await evidenceAPI.submitToCourt(evidenceId)
      await fetchEvidence()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit to court')
    }
  }

  const previewSelectedEvidence = async () => {
    if (!selectedEvidence?.id) return
    setCustodyPreviewLoading(true)
    setCustodyPreviewError('')
    try {
      const response = await evidenceAPI.content(selectedEvidence.id)
      const blob = response.data
      const contentType = response.headers?.['content-type'] || blob?.type || 'application/octet-stream'
      const filename = selectedEvidence.label || 'Evidence file'

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url

      setCustodyPreview({
        url,
        mime: contentType,
        filename,
        kind: classifyPreviewKind(contentType),
      })
    } catch (err) {
      setCustodyPreview(null)
      let message = 'Preview unavailable'
      const status = err.response?.status
      if (status === 401 || status === 403) {
        message = 'Access denied for this evidence preview'
      } else if (status === 404) {
        message = 'Preview endpoint not found. Restart the backend server.'
      }
      const data = err.response?.data
      if (data) {
        if (typeof data === 'string') {
          message = data || message
        } else if (data?.error) {
          message = data.error
        } else if (data instanceof Blob && typeof data.text === 'function') {
          try {
            const text = await data.text()
            if (text) {
              try {
                const parsed = JSON.parse(text)
                message = parsed?.error || text || message
              } catch {
                message = text
              }
            }
          } catch {
            // keep fallback
          }
        }
      }
      setCustodyPreviewError(message)
    } finally {
      setCustodyPreviewLoading(false)
    }
  }

  const runIntegrityCheck = async (entry, { updateInspector = false } = {}) => {
    if (!entry?.id) return null
    const evidenceId = entry.id
    setVerifyingEvidenceId(evidenceId)
    setEvidenceIntegrity((prev) => ({
      ...prev,
      [evidenceId]: {
        ...prev[evidenceId],
        status: 'verifying',
      },
    }))
    try {
      const response = await evidenceAPI.get(evidenceId)
      const payload = response.data || {}
      const evidenceData = payload.evidence || {}
      const integrityValid = Boolean(payload.integrity_valid)
      const signatureValid = Boolean(payload.signature_valid)
      const status = integrityValid && signatureValid ? 'verified' : 'tampered'
      const nextState = {
        status,
        integrityValid,
        signatureValid,
        checkedAt: new Date().toISOString(),
        hash: evidenceData.file_hash || entry.file_hash,
        hashAlgorithm: payload.hash_algorithm || 'SHA-256',
        kexAlgorithm: payload.kex_algorithm || '',
        sigAlgorithm: payload.sig_algorithm || '',
      }
      persistIntegrityRecord(evidenceId, nextState)
      if (updateInspector) {
        setInspectedEvidence({
          ...entry,
          ...evidenceData,
          integrity: nextState,
        })
      }
      return nextState
    } catch (err) {
      const message = err.response?.data?.error || 'Verification failed'
      const status = err.response?.status === 409 ? 'tampered' : 'error'
      const nextState = {
        status,
        integrityValid: false,
        signatureValid: false,
        checkedAt: new Date().toISOString(),
        hash: entry.file_hash,
        hashAlgorithm: 'SHA-256',
        kexAlgorithm: '',
        sigAlgorithm: '',
        error: message,
      }
      persistIntegrityRecord(evidenceId, nextState)
      if (updateInspector) {
        setInspectedEvidence({
          ...entry,
          integrity: nextState,
        })
      }
      return nextState
    } finally {
      setVerifyingEvidenceId('')
      if (updateInspector) {
        setInspectorLoading(false)
      }
    }
  }

  const verifyEvidence = async (entry) => {
    setError('')
    await runIntegrityCheck(entry)
  }

  const inspectEvidence = async (entry) => {
    if (!entry?.id) return
    setInspectorLoading(true)
    setInspectedEvidence({
      ...entry,
      integrity: getIntegrityRecord(entry),
    })
    await runIntegrityCheck(entry, { updateInspector: true })
  }

  const getIntegrityDisplay = (entry) => {
    const record = getIntegrityRecord(entry)
    const isVerifying = verifyingEvidenceId === entry.id || record?.status === 'verifying'
    if (isVerifying) {
      return {
        label: 'Verifying',
        tone: 'verifying',
        icon: <Sparkles size={16} />,
      }
    }
    if (!record || record.status === 'unchecked') {
      return {
        label: 'Not Verified',
        tone: 'pending',
        icon: <ShieldCheck size={16} />,
      }
    }
    if (record.status === 'verified') {
      return {
        label: 'Verified',
        tone: 'verified',
        icon: <BadgeCheck size={16} />,
      }
    }
    if (record.status === 'tampered') {
      return {
        label: 'Tamper Detected',
        tone: 'tampered',
        icon: <ShieldOff size={16} />,
      }
    }
    return {
      label: 'Verification Error',
      tone: 'error',
      icon: <XCircle size={16} />,
    }
  }

  const getHeatmapStatus = (entry) => {
    const record = getIntegrityRecord(entry)
    const isVerifying = verifyingEvidenceId === entry.id || record?.status === 'verifying'
    if (record?.status === 'verified') {
      return { tone: 'safe', label: 'Hash matches', icon: <ShieldCheck size={16} /> }
    }
    if (record?.status === 'tampered') {
      const label = record?.signatureValid === false
        ? 'Signature mismatch'
        : record?.integrityValid === false
          ? 'Hash mismatch'
          : 'Integrity mismatch'
      return { tone: 'tampered', label, icon: <ShieldOff size={16} /> }
    }
    if (isVerifying) {
      return { tone: 'pending', label: 'Verifying', icon: <Shield size={16} /> }
    }
    return { tone: 'pending', label: 'Pending verification', icon: <Shield size={16} /> }
  }

  const evidenceByCase = useMemo(() => {
    return evidence.reduce((acc, item) => {
      const key = normalizeCaseRef(item.case_id)
      if (!acc[key]) acc[key] = []
      acc[key].push(item)
      return acc
    }, {})
  }, [evidence])

  const caseRows = useMemo(() => {
    if (cases.length === 0 && isCourtUser) {
      return Object.keys(evidenceByCase).map((caseNumber) => ({
        id: caseNumber,
        case_number: caseNumber,
        quantum_ledger_number: '',
        case_title: 'Case Evidence',
        status: 'court access',
        created_at: null,
        incident_date: '',
        incident_state: '',
        incident_district: '',
        incident_location: '',
        case_summary: '',
        assigned_investigator_id: null,
        assigned_investigator_username: '',
        case_book_page_count: 0,
        evidenceItems: evidenceByCase[caseNumber] || [],
      }))
    }

    return cases.map((item) => ({
      ...item,
      evidenceItems: evidenceByCase[normalizeCaseRef(item.case_number)] || [],
    }))
  }, [cases, evidenceByCase, isCourtUser])

  const filteredCaseRows = useMemo(() => {
    const query = caseSearchQuery.trim().toUpperCase()
    if (!query) return caseRows
    return caseRows.filter((item) => {
      const caseNumber = normalizeCaseRef(item.case_number)
      const ledgerNumber = String(item.quantum_ledger_number || '').trim().toUpperCase()
      return caseNumber.includes(query) || ledgerNumber.includes(query)
    })
  }, [caseRows, caseSearchQuery])

  const caseCountLabel = useMemo(() => {
    const total = caseRows.length
    const visible = filteredCaseRows.length
    if (caseSearchQuery.trim()) {
      return `${visible} result${visible === 1 ? '' : 's'}`
    }
    return `${total} case${total === 1 ? '' : 's'}`
  }, [caseRows.length, filteredCaseRows.length, caseSearchQuery])

  useEffect(() => {
    if (filteredCaseRows.length === 0) {
      setActiveCaseNumber('')
      closeUploadForm()
      return
    }

    const hasActive = filteredCaseRows.some(
      (item) => normalizeCaseRef(item.case_number) === activeCaseNumber
    )

    if (activeCaseNumber && !hasActive) {
      setActiveCaseNumber('')
      closeUploadForm()
    }
  }, [filteredCaseRows, activeCaseNumber])

  useEffect(() => {
    if (!activeCaseNumber) {
      setActiveCaseInvestigatorId('')
      setShowReassignPicker(false)
      setShowCourtGrantPanel(false)
      return
    }

    const selected = caseRows.find(
      (item) => normalizeCaseRef(item.case_number) === activeCaseNumber
    )
    if (!selected) {
      setActiveCaseInvestigatorId('')
      setShowReassignPicker(false)
      setShowCourtGrantPanel(false)
      return
    }

    setActiveCaseInvestigatorId(
      selected.assigned_investigator_id ? String(selected.assigned_investigator_id) : ''
    )
    setShowReassignPicker(false)
    setShowCourtGrantPanel(false)
  }, [activeCaseNumber, caseRows])

  const activeCase = useMemo(
    () => filteredCaseRows.find((item) => normalizeCaseRef(item.case_number) === activeCaseNumber) || null,
    [filteredCaseRows, activeCaseNumber]
  )

  useEffect(() => {
    if (!isCourtUser && !isInvestigator) return
    if (!activeCase?.evidenceItems?.length) return
    let cancelled = false
    const runAutoVerification = async () => {
      for (const entry of activeCase.evidenceItems) {
        if (cancelled) return
        if (!entry?.id) continue
        if (hasCachedIntegrity(entry)) continue
        if (autoVerifiedEvidenceRef.current.has(entry.id)) continue
        autoVerifiedEvidenceRef.current.add(entry.id)
        await runIntegrityCheck(entry)
      }
    }
    runAutoVerification()
    return () => {
      cancelled = true
    }
  }, [activeCase?.case_number, activeCase?.evidenceItems, hasCachedIntegrity, isCourtUser, isInvestigator])

  useEffect(() => {
    if (!isCourtUser) return
    if (activeCaseNumber) return
    if (filteredCaseRows.length === 0) return
    const firstCase = filteredCaseRows[0]
    if (firstCase?.case_number) {
      setActiveCaseNumber(normalizeCaseRef(firstCase.case_number))
    }
  }, [isCourtUser, activeCaseNumber, filteredCaseRows])

  useEffect(() => {
    if (user?.role !== 'admin' || !activeCase?.id) {
      setCaseCourtAccessGrants([])
      return
    }
    fetchCaseCourtAccessGrants(activeCase.id)
  }, [activeCase?.id, user?.role])

  const courtAccessSummary = useMemo(() => {
    if (!isCourtUser) return null
    if (caseRows.length === 0) {
      return { status: 'none' }
    }
    const referenceCase = activeCase || caseRows[0]
    const expiresAt = parseIsoDate(referenceCase?.court_access_expires_at)
    return {
      status: 'active',
      count: caseRows.length,
      caseNumber: normalizeCaseRef(referenceCase?.case_number || ''),
      expiresAt,
    }
  }, [isCourtUser, caseRows, activeCase])

  const caseBookPages = useMemo(() => {
    if (!activeCaseBook) return []
    const cover = {
      id: `cover-${activeCaseBook?.case?.id || activeCaseBook?.cover?.case_id || 'case'}`,
      type: 'cover',
      title: activeCaseBook?.cover?.case_title || activeCaseBook?.case?.case_title || 'Case Book',
      case_number: activeCaseBook?.cover?.case_number || activeCaseBook?.case?.case_number || '',
      quantum_ledger_number: activeCaseBook?.cover?.quantum_ledger_number || activeCaseBook?.case?.quantum_ledger_number || '',
      status: activeCaseBook?.cover?.status || activeCaseBook?.case?.status || '',
      incident_location: activeCaseBook?.cover?.incident_location || activeCaseBook?.case?.incident_location || '',
      assigned_investigator_username:
        activeCaseBook?.cover?.assigned_investigator_username
        || activeCaseBook?.case?.assigned_investigator_username
        || '',
      page_count: activeCaseBook?.page_count || 0,
    }
    return [cover, ...(activeCaseBook?.pages || [])]
  }, [activeCaseBook])

  const activeCaseBookPage = useMemo(
    () => caseBookPages[activeBookPageIndex] || null,
    [caseBookPages, activeBookPageIndex]
  )

  useEffect(() => {
    if (!showCaseBookViewer || caseBookPages.length === 0) {
      return
    }
    const maxIndex = caseBookPages.length - 1
    if (activeBookPageIndex > maxIndex) {
      setActiveBookPageIndex(maxIndex)
      return
    }
    const currentPage = caseBookPages[activeBookPageIndex]
    loadCaseBookPageContent(currentPage)
  }, [showCaseBookViewer, caseBookPages, activeBookPageIndex])

  const renderCaseDetails = (item) => {
    if (!item) {
      return (
        <article className="card created-case-card">
          <p className="text-gray-light">Select a case log entry to view details.</p>
        </article>
      )
    }

    const caseNumber = normalizeCaseRef(item.case_number)
    const caseEvidence = item.evidenceItems || []
    const isUploadOpen = uploadCaseId === caseNumber
    const isEvidenceUploadOpen = isUploadOpen && uploadMode === 'evidence'
    const isCaseFileUploadOpen = isUploadOpen && uploadMode === 'case_file'
    const caseFileInputId = `case-file-upload-${caseNumber}`
    const evidenceFileInputId = `evidence-file-upload-${caseNumber}`
    const caseBookPageCount = Number(item.case_book_page_count || 0)
    const normalizedStatus = String(item.status || '').trim().toLowerCase()
    const approvalStatus = String(item.approval_status || 'approved').trim().toLowerCase()
    const isCaseApproved = approvalStatus === 'approved'
    const canAdminAssignInvestigator = user?.role === 'admin' && isCaseApproved && ['open', 'investigation'].includes(normalizedStatus)
    const canAdminCloseCase = user?.role === 'admin' && isCaseApproved && normalizedStatus !== 'closed'
    const canAdminReopenCase = user?.role === 'admin' && isCaseApproved && normalizedStatus === 'closed'
    const isClosedCase = normalizedStatus === 'closed'
    const canUploadToCase = !isCourtUser && !isClosedCase && (user?.role === 'admin' || isCaseApproved)
    const hasAssignedInvestigator = Boolean(item.assigned_investigator_id)
    const isReassignMode = normalizedStatus === 'investigation' || hasAssignedInvestigator
    const shouldShowInvestigatorPicker = showReassignPicker
    const canAdminGrantCourtAccess = user?.role === 'admin'
    const showAdminActions = !isCourtUser && (canAdminAssignInvestigator || canAdminCloseCase || canAdminGrantCourtAccess)
    const sessionInfo = isCourtUser ? getCourtSessionInfo(item) : null
    const isEvidenceUploadReady = uploadMode === 'evidence'
      && Boolean(uploadData.file)
      && Boolean(uploadData.intake_timestamp)
      && hashingState.status === 'complete'
      && Boolean(uploadData.client_sha3_512)
      && Boolean(uploadData.seal_for_transport)
      && locationStatus !== 'locating'
      && sealerState !== 'sealed'
      && sealerState !== 'sealing'
    const hashProgressValue = hashingState.status === 'complete'
      ? 100
      : hashingState.progress
    const heatmapSummary = caseEvidence.reduce(
      (acc, entry) => {
        const tone = getHeatmapStatus(entry).tone
        if (tone === 'safe') acc.safe += 1
        else if (tone === 'tampered') acc.tampered += 1
        else acc.pending += 1
        return acc
      },
      { safe: 0, pending: 0, tampered: 0 }
    )
    const evidenceLabelMap = buildEvidenceLabelMap(caseEvidence)
    const resolveEvidenceLabel = (entry, index) => {
      if (!entry) return 'Evidence file'
      if (entry.id && evidenceLabelMap.has(entry.id)) {
        return evidenceLabelMap.get(entry.id)
      }
      if (typeof index === 'number') {
        return `EV${index + 1}`
      }
      return 'Evidence file'
    }

    return (
      <article className="card created-case-card">
        <div className="created-case-top">
          <div className="created-case-top-main">
            <p className="created-case-number">{caseNumber}</p>
            {item.quantum_ledger_number && (
              <p className="quantum-ledger-id">Quantum Ledger: {item.quantum_ledger_number}</p>
            )}
            <h2 className="created-case-title">{item.case_title || 'Untitled Case'}</h2>
            {isCourtUser && item.court_access_expires_at && (
              <p className="created-case-meta">
                Court access active until: {formatDateTime(item.court_access_expires_at)}
              </p>
            )}
            {!isCourtUser && (
              <>
                <p className="created-case-meta">
                  Status: {formatCaseStatus(item.status)} | Approval: {formatApprovalStatus(approvalStatus)} | Created: {formatDateTime(item.created_at)}
                </p>
                {(item.incident_state || item.incident_district) && (
                  <p className="created-case-meta">
                    Location: {item.incident_district || 'N/A'}, {item.incident_state || 'N/A'}
                  </p>
                )}
                {item.incident_date && (
                  <p className="created-case-meta">Incident date: {item.incident_date}</p>
                )}
                {item.incident_location && (
                  <p className="created-case-meta">Reported station: {item.incident_location}</p>
                )}
                {(item.assigned_investigator_username || item.assigned_investigator_id) && (
                  <p className="created-case-meta">
                    Assigned investigator: {item.assigned_investigator_username || `User ID ${item.assigned_investigator_id}`}
                  </p>
                )}
                {item.case_summary && (
                  <p className="created-case-summary">{item.case_summary}</p>
                )}
                {!isCaseApproved && (
                  <p className="create-case-help create-case-help-warning">
                    Case is awaiting admin approval. Evidence and case-book uploads are disabled until approval.
                  </p>
                )}
              </>
            )}
          </div>

        </div>

        {isCourtUser && sessionInfo && (
          <section className="court-session-panel">
            <div className="court-session-head">
              <div>
                <p className="court-session-kicker">Hearing Session Controller</p>
                <h3 className="court-session-title">Time-Bound Court Access</h3>
              </div>
              <div className={`session-status-chip session-status-${sessionInfo.tone}`}>
                {sessionInfo.label}
              </div>
            </div>
            <div className="court-session-body">
              <div className="court-session-timer">
                <div className="court-session-icon">
                  <Timer size={18} />
                </div>
                <div>
                  <p className="court-session-label">Active Countdown</p>
                  <p className="court-session-countdown">{sessionInfo.countdown}</p>
                  <p className="court-session-meta">
                    {sessionInfo.expiresAt
                      ? `Expires at ${formatDateTime(sessionInfo.expiresAt)}`
                      : 'Awaiting access window from admin.'}
                  </p>
                </div>
              </div>
              <div className="court-session-actions">
                <button
                  type="button"
                  className="btn-outline court-extension-btn"
                  onClick={() => handleRequestExtension(item)}
                >
                  Request Extension
                </button>
              </div>
            </div>
            {showExtensionDialog && extensionTarget?.case_number === normalizeCaseRef(item.case_number) && (
              <div className="extension-dialog" role="dialog" aria-label="Request time extension">
                <div className="extension-dialog-head">
                  <div>
                    <p className="extension-dialog-kicker">Extension Request</p>
                    <h4 className="extension-dialog-title">Select Time Window</h4>
                  </div>
                  <button
                    type="button"
                    className="btn-outline extension-dialog-close"
                    onClick={() => setShowExtensionDialog(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="extension-dialog-grid">
                  <div className="extension-dialog-field">
                    <label className="extension-dialog-label">Based On</label>
                    <CustomSelect
                      value={extensionUnit}
                      onChange={(value) => {
                        setExtensionUnit(value)
                        setExtensionValue(String(extensionDefaultValue(value)))
                      }}
                      options={EXTENSION_UNITS}
                      placeholder="Select unit"
                    />
                  </div>
                  <div className="extension-dialog-field">
                    <label className="extension-dialog-label">Value</label>
                    <div className="number-stepper extension-dialog-stepper">
                      <input
                        type="number"
                        min="1"
                        max={Math.max(1, Math.floor(MAX_COURT_ACCESS_MINUTES / extensionUnitMeta(extensionUnit).multiplier))}
                        step="1"
                        className="input-field number-stepper-input"
                        value={extensionValue}
                        onChange={(e) => setExtensionValue(e.target.value)}
                        onBlur={(e) =>
                          setExtensionValue(
                            String(clampExtensionValue(e.target.value, extensionUnit))
                          )
                        }
                        required
                      />
                      <div className="number-stepper-controls">
                        <button
                          type="button"
                          className="number-stepper-btn"
                          onClick={() =>
                            setExtensionValue((prev) =>
                              String(clampExtensionValue(Number(prev || 1) + 1, extensionUnit))
                            )
                          }
                          aria-label="Increase value"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="number-stepper-btn"
                          onClick={() =>
                            setExtensionValue((prev) =>
                              String(clampExtensionValue(Number(prev || 1) - 1, extensionUnit))
                            )
                          }
                          aria-label="Decrease value"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="extension-dialog-preview">
                    Requested duration: {formatDurationMinutes(
                      clampCourtAccessMinutes(
                        clampExtensionValue(extensionValue, extensionUnit) * extensionUnitMeta(extensionUnit).multiplier,
                        DEFAULT_COURT_ACCESS_MINUTES
                      )
                    )}
                  </div>
                </div>
                <div className="extension-dialog-actions">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setShowExtensionDialog(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleConfirmExtension}
                  >
                    Send Extension Request
                  </button>
                </div>
              </div>
            )}
            {extensionFeedback && (
              <div className="extension-toast" role="status" aria-live="polite">
                <span className="extension-toast-icon" aria-hidden="true">
                  <BadgeCheck size={16} />
                </span>
                <span className="extension-toast-text">{extensionFeedback}</span>
              </div>
            )}
          </section>
        )}

        {canAdminAssignInvestigator && shouldShowInvestigatorPicker && (
          <section className="case-inline-action-panel">
            <div className="case-form-section-head">
              <h2>{isReassignMode ? 'Reassign Investigator' : 'Assign Investigator'}</h2>
              <p>Select an investigator from users list and save.</p>
            </div>

            <div className="create-case-field">
              <label className="create-case-label">{isReassignMode ? 'Reassign Investigator' : 'Assign Investigator'}</label>
              {investigatorLoading && (
                <p className="create-case-help">Loading investigators from users list...</p>
              )}
              {!investigatorLoading && investigators.length === 0 && (
                <p className="create-case-help create-case-help-warning">
                  No investigator found in users list. Add the investigator to the system by creating the user.
                </p>
              )}
              {!investigatorLoading && investigators.length > 0 && (
                <div className="investigator-picker-shell">
                  <div className="investigator-picker-head">
                    <p className="investigator-picker-title">Select Investigator</p>
                    <p className="investigator-picker-subtitle">Swipe horizontally to browse investigators</p>
                  </div>
                  <div className="investigator-carousel" role="listbox" aria-label="Investigators">
                    {investigators.map((entry) => {
                      const isSelected = String(activeCaseInvestigatorId) === String(entry.id)
                      return (
                        <button
                          key={`${item.id || caseNumber}-${entry.id}`}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`investigator-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setActiveCaseInvestigatorId(String(entry.id))}
                        >
                          <div className="investigator-avatar-placeholder" aria-hidden="true" />
                          <div className="investigator-card-copy">
                            <p className="investigator-name">{entry.username}</p>
                            <p className="investigator-station">
                              {entry.station_name || 'Station not specified'}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {!investigatorLoading && investigatorError && (
                <p className="create-case-help create-case-help-warning">{investigatorError}</p>
              )}
              <p className="create-case-help">
                {isReassignMode ? (
                  <>Reassigning updates the investigator assigned to this case.</>
                ) : (
                  <>On assign, case status will automatically move to <strong>Under Investigation</strong>.</>
                )}
              </p>
            </div>

            <div className="create-case-form-actions">
              <button
                type="button"
                className="btn-outline"
                disabled={caseActionLoading}
                onClick={() => setShowReassignPicker(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={caseActionLoading || !activeCaseInvestigatorId}
                onClick={() => handleAssignInvestigator(item)}
              >
                {caseActionLoading
                  ? 'Updating...'
                  : (isReassignMode ? 'Save Reassignment' : 'Save Assignment')}
              </button>
            </div>
          </section>
        )}

        {user?.role === 'admin' && showCourtGrantPanel && (
          <section className="case-inline-action-panel court-grant-panel">
            <div className="case-form-section-head">
              <h2>Grant Court Access</h2>
              <p>Set exactly how long a selected court user can view this case and evidence.</p>
            </div>

            <div className="create-case-form-grid court-grant-grid">
              <div className="create-case-field court-grant-field">
                <label className="create-case-label">Court User</label>
                <CustomSelect
                  value={adminGrantForm.court_user_id}
                  onChange={(value) => setAdminGrantForm((prev) => ({ ...prev, court_user_id: value }))}
                  options={courtUserOptions}
                  placeholder={courtUsersLoading ? 'Loading court users...' : 'Select court user'}
                  disabled={courtUsersLoading}
                  emptyLabel="No court users available."
                />
                {courtUsersLoading && <p className="create-case-help">Loading court users...</p>}
              </div>

              <div className="create-case-field court-grant-field">
                <label className="create-case-label">Time Limit</label>
                <div className="duration-field-row">
                  <div className="number-stepper">
                    <input
                      type="number"
                      min={1}
                      max={maxDurationValue(adminGrantForm.duration_unit)}
                      step="1"
                      className="input-field number-stepper-input"
                      value={adminGrantForm.duration_value}
                      onChange={(e) => setAdminGrantForm((prev) => ({ ...prev, duration_value: e.target.value }))}
                      onBlur={(e) =>
                        setAdminGrantForm((prev) => ({
                          ...prev,
                          duration_value: String(clampExtensionValue(e.target.value, prev.duration_unit)),
                        }))
                      }
                    />
                    <div className="number-stepper-controls">
                      <button
                        type="button"
                        className="number-stepper-btn"
                        onClick={() => bumpAdminGrantDuration(1)}
                        aria-label="Increase time limit"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="number-stepper-btn"
                        onClick={() => bumpAdminGrantDuration(-1)}
                        aria-label="Decrease time limit"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </div>
                  <CustomSelect
                    value={adminGrantForm.duration_unit}
                    onChange={(value) => {
                      setAdminGrantForm((prev) => ({
                        ...prev,
                        duration_unit: value,
                        duration_value: String(extensionDefaultValue(value)),
                      }))
                    }}
                    options={EXTENSION_UNITS}
                    placeholder="Unit"
                    className="duration-unit-select"
                  />
                </div>
                <p className="create-case-help">Example: 1 hour or 1 day.</p>
              </div>
            </div>

            <div className="create-case-field court-grant-field court-grant-notes">
              <label className="create-case-label">Notes (optional)</label>
              <textarea
                className="input-field min-h-20"
                placeholder="Optional access notes..."
                value={adminGrantForm.notes}
                onChange={(e) => setAdminGrantForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            <div className="create-case-form-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={caseActionLoading}
                onClick={() => handleAdminGrantCourtAccess(item)}
              >
                {caseActionLoading ? 'Granting...' : 'Grant Court Access'}
              </button>
            </div>

            <div className="case-evidence-block">
              <h3 className="case-evidence-title">Active Court Access ({caseCourtAccessGrants.length})</h3>
              {caseCourtAccessGrantsLoading ? (
                <div className="empty-card">Loading active court access grants...</div>
              ) : caseCourtAccessGrants.length === 0 ? (
                <div className="empty-card">No active court access grants for this case.</div>
              ) : (
                <div className="case-evidence-list">
                  {caseCourtAccessGrants.map((grant) => (
                    <div key={grant.id} className="case-evidence-item">
                      <div className="case-evidence-main">
                        <Lock className="text-orange flex-shrink-0 mt-1" size={18} />
                        <div className="case-evidence-copy">
                          <p className="case-evidence-name">{grant.court_user_username || `Court User ${grant.court_user_id}`}</p>
                          <p className="case-evidence-meta">
                            Expires: {formatDateTime(grant.expires_at)} | Remaining: {formatDurationMinutes(Math.round((grant.remaining_seconds || 0) / 60))}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        <div className="created-case-upload-actions">
          {canUploadToCase && (
            <button
              type="button"
              className="btn-primary created-case-upload-toggle"
              onClick={() => (isEvidenceUploadOpen ? closeUploadForm() : openUploadForCase(caseNumber, 'evidence'))}
            >
              <Plus size={16} />
              {isEvidenceUploadOpen ? 'Hide Evidence Upload' : 'Add Evidence'}
            </button>
          )}
          {canUploadToCase && (
            <button
              type="button"
              className="btn-outline created-case-upload-toggle"
              onClick={() => (isCaseFileUploadOpen ? closeUploadForm() : openUploadForCase(caseNumber, 'case_file'))}
            >
              <FileText size={16} />
              {isCaseFileUploadOpen ? 'Hide Case File Upload' : 'Add Case File'}
            </button>
          )}
          <button
            type="button"
            className="btn-outline created-case-upload-toggle"
            onClick={() => openCaseBookViewer(item)}
            disabled={caseBookLoading}
          >
            <BookOpen size={16} />
            {caseBookLoading ? 'Opening...' : (isCourtUser ? 'View Case Book' : 'Preview Case Book')}
          </button>
          <span className="case-book-count-chip">
            {caseBookPageCount} page{caseBookPageCount === 1 ? '' : 's'}
          </span>
          {canAdminReopenCase && (
            <>
              <span className="case-closed-ident-chip">
                <Lock size={13} />
                Case Closed
              </span>
              <button
                type="button"
                className="case-reopen-inline-btn"
                disabled={caseActionLoading}
                onClick={() => handleReopenCase(item)}
              >
                <RotateCcw size={15} />
                {caseActionLoading ? 'Updating...' : 'Reopen Case'}
              </button>
            </>
          )}
          {!isCourtUser && isClosedCase && (
            <span className="create-case-help create-case-help-warning">
              Upload is disabled because this case is closed.
            </span>
          )}
        </div>

        {canUploadToCase && isUploadOpen && (
          <div className="case-upload-panel">
            <h3 className="case-upload-title">
              {uploadMode === 'case_file' ? `Upload Case File To ${caseNumber}` : `New Evidence Acquisition • ${caseNumber}`}
            </h3>
            <form onSubmit={handleUpload} className="case-upload-form">
              {uploadMode === 'case_file' ? (
                <div className="create-case-field">
                  <label className="create-case-label">File</label>
                  <div className="file-picker">
                    <input
                      id={caseFileInputId}
                      type="file"
                      onChange={(e) => handleUploadFileChange(e.target.files?.[0] || null)}
                      className="file-input"
                      required
                    />
                    <label htmlFor={caseFileInputId} className="file-picker-btn">
                      <UploadCloud size={16} />
                      <span>Choose File</span>
                    </label>
                    {uploadData.file && (
                      <button
                        type="button"
                        className="file-picker-cancel"
                        onClick={clearSelectedFile}
                      >
                        Cancel
                      </button>
                    )}
                    <div className="file-picker-meta">
                      <p className="file-picker-name">
                        {uploadData.file ? uploadData.file.name : 'No file selected'}
                      </p>
                      <p className="file-picker-size">
                        {uploadData.file ? formatFileSize(uploadData.file.size) : 'Select a file to continue'}
                      </p>
                    </div>
                  </div>
                  <p className="create-case-help">Most document/media formats are allowed. Executable/script files are blocked for security.</p>
                </div>
              ) : (
                <div className="intake-wizard">
                  <div className="intake-header">
                    <div>
                      <p className="intake-kicker">Evidence Intake Wizard</p>
                      <h4 className="intake-title">New Evidence Acquisition</h4>
                      <p className="intake-subtitle">Capture the fingerprint, seal for transport, and document forensic context.</p>
                    </div>
                    <div className={`intake-status-chip intake-status-${hashingState.status}`}>
                      <Fingerprint size={16} />
                      <span>
                        {hashingState.status === 'complete'
                          ? 'Fingerprint captured'
                          : hashingState.status === 'hashing'
                            ? 'Hashing in progress'
                            : hashingState.status === 'error'
                              ? 'Fingerprint error'
                              : 'Fingerprint pending'}
                      </span>
                    </div>
                  </div>

                  <section className="intake-panel">
                    <div className="intake-panel-head">
                      <h4>Evidence Intake</h4>
                      <p>Describe the evidence and attach the original file.</p>
                    </div>
                    <div className="intake-panel-body">
                      <div className="intake-field">
                        <label className="create-case-label">File Description</label>
                        <textarea
                          value={uploadData.description}
                          onChange={(e) => setUploadData((prev) => ({ ...prev, description: e.target.value }))}
                          className="input-field min-h-24"
                          placeholder="Describe the file and its relevance to this case..."
                        />
                      </div>
                      <div className="intake-field">
                        <label className="create-case-label">File</label>
                        <div className="file-picker">
                          <input
                            id={evidenceFileInputId}
                            type="file"
                            onChange={(e) => handleUploadFileChange(e.target.files?.[0] || null)}
                            className="file-input"
                            required
                          />
                          <label htmlFor={evidenceFileInputId} className="file-picker-btn">
                            <UploadCloud size={16} />
                            <span>Choose File</span>
                          </label>
                          {uploadData.file && (
                            <button
                              type="button"
                              className="file-picker-cancel"
                              onClick={clearSelectedFile}
                            >
                              Cancel
                            </button>
                          )}
                          <div className="file-picker-meta">
                            <p className="file-picker-name">
                              {uploadData.file ? uploadData.file.name : 'No file selected'}
                            </p>
                            <p className="file-picker-size">
                              {uploadData.file ? formatFileSize(uploadData.file.size) : 'Select a file to continue'}
                            </p>
                          </div>
                        </div>
                        <p className="create-case-help">Most document/media formats are allowed. Executable/script files are blocked for security.</p>
                      </div>
                    </div>
                  </section>

                  <div className="intake-grid">
                    <section className="intake-panel">
                      <div className="intake-panel-head">
                        <h4>Digital Fingerprint</h4>
                        <p>SHA3-512 hash generated locally before upload.</p>
                      </div>
                      <div
                        className="hash-progress"
                        role="progressbar"
                        aria-valuenow={hashProgressValue}
                        aria-valuemin="0"
                        aria-valuemax="100"
                      >
                        <div className="hash-progress-track">
                          <div className="hash-progress-bar" style={{ width: `${hashProgressValue}%` }} />
                        </div>
                        <div className="hash-progress-meta">
                          <span>
                            {hashingState.status === 'hashing'
                              ? 'Hashing...'
                              : hashingState.status === 'complete'
                                ? 'Fingerprint captured'
                                : hashingState.status === 'error'
                                  ? 'Hashing failed'
                                  : 'Awaiting file selection'}
                          </span>
                          <span>{hashProgressValue}%</span>
                        </div>
                      </div>
                      {hashingState.error && <p className="hash-error">{hashingState.error}</p>}
                      <div className={`fingerprint-status fingerprint-${hashingState.status}`}>
                        <div className="fingerprint-orb" aria-hidden="true">
                          <Fingerprint size={16} />
                        </div>
                        <div>
                          <p className="fingerprint-title">
                            {hashingState.status === 'complete'
                              ? 'Fingerprint Sealed'
                              : hashingState.status === 'hashing'
                                ? 'Fingerprint Scanning'
                                : hashingState.status === 'error'
                                  ? 'Fingerprint Error'
                                  : 'Fingerprint Pending'}
                          </p>
                          <p className="fingerprint-subtitle">SHA3-512 captured locally for forensic integrity.</p>
                        </div>
                      </div>
                    </section>

                    <section className="intake-panel">
                      <div className="intake-panel-head">
                        <h4>Quantum Sealer</h4>
                        <p>Sealing occurs during upload to encrypt evidence on the server.</p>
                      </div>
                      <div className={`sealer-status sealer-${sealerState}${sealFlash ? ' sealer-flash' : ''}`}>
                        <div className="sealer-status-main">
                          <span
                            className={`sealer-status-icon${sealerState === 'sealing' ? ' spin' : ''}${
                              sealerState === 'sealed' ? ' sealed' : ''
                            }`}
                            aria-hidden="true"
                          >
                          {sealerState === 'sealed' || sealerState === 'armed' ? (
                            <svg viewBox="0 0 24 24" className="sealer-checkmark" aria-hidden="true">
                              <circle cx="12" cy="12" r="9" className="sealer-check-circle" />
                              <path d="M7.5 12.5l3 3 6-6" className="sealer-check-path" />
                            </svg>
                          ) : sealerState === 'sealing' ? (
                              <Loader2 size={18} />
                            ) : sealerState === 'error' ? (
                              <ShieldOff size={18} />
                            ) : (
                              <Lock size={18} />
                            )}
                          </span>
                          <div>
                            <p className="sealer-status-title">
                              {sealerState === 'sealed'
                                ? 'Sealed During Upload'
                                : sealerState === 'armed'
                                  ? 'Seal Ready'
                                : sealerState === 'sealing'
                                  ? 'Sealing In Progress'
                                  : sealerState === 'error'
                                  ? 'Sealing Failed'
                                    : 'Awaiting Evidence'}
                            </p>
                            <p className="sealer-status-subtitle">
                              {sealerState === 'sealed'
                                ? 'Evidence sealed successfully.'
                                : sealerState === 'armed'
                                  ? hashingState.status === 'hashing' || locationStatus === 'locating'
                                    ? 'Pre-seal running: capturing fingerprint/location.'
                                    : 'Pre-seal complete. Ready to upload.'
                                : sealerState === 'sealing'
                                  ? 'Encrypting evidence with PQC.'
                                  : sealerState === 'error'
                                    ? sealerError || 'Seal failed. Re-select file or retry upload.'
                                    : 'Select a file to arm the sealer.'}
                            </p>
                          </div>
                        </div>
                        {(sealerState === 'sealed' || sealerState === 'armed') && (
                          <span className={`sealer-stamp${sealerState === 'armed' ? ' ready' : ''}`} aria-hidden="true">
                            {sealerState === 'armed' ? 'READY' : 'SEALED'}
                          </span>
                        )}
                      </div>
                    </section>
                  </div>

                  <section className="intake-panel">
                    <div className="intake-panel-head">
                      <h4>Add Forensic Metadata</h4>
                      <p>Context-rich metadata travels with the evidence through court.</p>
                    </div>
                    <div className="intake-metadata-grid">
                      <div className="intake-field">
                        <label className="create-case-label">GPS Location (Auto)</label>
                        <div className="readonly-field">
                          {locationStatus === 'locating'
                            ? 'Locating device...'
                            : uploadData.gps_location
                              ? uploadData.gps_location
                              : 'Awaiting file selection'}
                        </div>
                        <p
                          className={`create-case-help${
                            ['denied', 'unavailable'].includes(locationStatus) ? ' create-case-help-warning' : ''
                          }`}
                        >
                          {locationMessage}
                        </p>
                      </div>
                      <div className="intake-field">
                        <label className="create-case-label">Hardcoded Timestamp</label>
                        <div className="readonly-field">
                          {uploadData.intake_timestamp
                            ? formatDateTime(uploadData.intake_timestamp)
                            : 'Awaiting file selection'}
                        </div>
                        <p className="create-case-help">Captured from the investigator system clock.</p>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              <div className="create-case-form-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={uploadMode === 'evidence' ? !isEvidenceUploadReady : false}
                >
                  {uploadMode === 'case_file'
                    ? 'Upload Case File'
                    : sealerState === 'sealing'
                      ? 'Uploading...'
                      : 'Upload Evidence'}
                </button>
                <button
                  type="button"
                  onClick={closeUploadForm}
                  className="btn-outline"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className={`case-evidence-block ${isCourtUser ? 'court-evidence-block' : ''}`}>
          <div className="case-evidence-header">
            <h3 className="case-evidence-title">
              {isCourtUser ? `Evidence Integrity Dashboard (${caseEvidence.length})` : `Evidence Files (${caseEvidence.length})`}
            </h3>
            {isCourtUser && (
              <p className="case-evidence-subtitle">Security status, PQC signature checks, and custody chain at a glance.</p>
            )}
          </div>
          {isCourtUser ? (
            <div className="court-evidence-grid">
              <div className="court-evidence-list">
                {caseEvidence.length === 0 ? (
                  <div className="empty-card">No evidence uploaded for this case yet.</div>
                ) : (
                  <div className="case-evidence-list">
                    {caseEvidence.map((entry, index) => {
                      const integrity = getIntegrityRecord(entry)
                      const evidenceLabel = resolveEvidenceLabel(entry, index)
                      const verdict = getIntegrityDisplay(entry)
                      const signatureTone = integrity?.signatureValid
                        ? 'verified'
                        : integrity?.status === 'tampered'
                          ? 'invalid'
                          : 'pending'
                      const signatureLabel = integrity?.signatureValid
                        ? 'Dilithium signature verified'
                        : integrity?.status === 'tampered'
                          ? 'PQC signature invalid'
                          : 'PQC signature not checked'
                      return (
                        <div key={entry.id} className="case-evidence-item court-evidence-item">
                          <div className="case-evidence-main">
                            <Lock className="text-orange flex-shrink-0 mt-1" size={18} />
                            <div className="case-evidence-copy">
                              <p className="case-evidence-name">{evidenceLabel}</p>
                              <p className="case-evidence-meta">
                                Type: {entry.evidence_type || 'N/A'} | Hash: {entry.file_hash?.substring(0, 12)}... | Uploaded: {formatDate(entry.uploaded_at || entry.created_at || entry.upload_date)}
                              </p>
                              <div className="court-integrity-meta">
                                <div>
                                  <p className="integrity-status-label">Security Status</p>
                                  <div className={`integrity-seal integrity-${verdict.tone}`}>
                                    <span className="integrity-icon">{verdict.icon}</span>
                                    <span>{verdict.label}</span>
                                  </div>
                                  {integrity?.checkedAt && (
                                    <p className="integrity-time">Last checked: {formatDateTime(integrity.checkedAt)}</p>
                                  )}
                                </div>
                                <div className={`pqc-badge pqc-${signatureTone}`}>
                                  <Fingerprint size={14} />
                                  <span>{signatureLabel}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="case-evidence-actions">
                            <button
                              onClick={() => verifyEvidence(entry)}
                              className="btn-primary btn-verify"
                              disabled={verifyingEvidenceId === entry.id}
                            >
                              {verifyingEvidenceId === entry.id ? 'Verifying...' : 'Verify Integrity'}
                            </button>
                            <button
                              onClick={() => inspectEvidence(entry)}
                              className="btn-outline btn-inspect"
                              title="Deep-dive metadata"
                              disabled={inspectorLoading && inspectedEvidence?.id === entry.id}
                            >
                              <FileSearch size={16} />
                              Inspect
                            </button>
                            <button
                              onClick={() => viewCustodyChain(entry, evidenceLabel)}
                              className="btn-outline btn-inspect"
                              title="View Custody Chain"
                            >
                              <ChevronRight size={16} />
                              Custody Chain
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <aside className="court-metadata-panel">
                <div className="court-metadata-head">
                  <div className="court-metadata-icon">
                    <FileSearch size={18} />
                  </div>
                  <div>
                    <p className="court-metadata-kicker">Deep-Dive Metadata Inspector</p>
                    <h3 className="court-metadata-title">File DNA</h3>
                  </div>
                </div>
                {inspectorLoading && (
                  <div className="empty-card">Loading technical metadata...</div>
                )}
                {!inspectorLoading && !inspectedEvidence && (
                  <div className="empty-card">Select an evidence file to inspect its technical DNA.</div>
                )}
                {!inspectorLoading && inspectedEvidence && (() => {
                  const integrity = inspectedEvidence.integrity || getIntegrityRecord(inspectedEvidence)
                  const hashValue = integrity?.hash || inspectedEvidence.file_hash || 'N/A'
                  const hashAlgorithm = integrity?.hashAlgorithm || 'SHA-256'
                  const kexAlgorithm = humanizeKexAlgorithm(integrity?.kexAlgorithm)
                  const sigAlgorithm = humanizeSigAlgorithm(integrity?.sigAlgorithm)
                  const format = resolveFileFormat(inspectedEvidence)
                  const evidenceLabel = resolveEvidenceLabel(inspectedEvidence)
                  return (
                    <div className="court-metadata-body">
                      <div className="metadata-row">
                        <span className="metadata-label">Evidence Label</span>
                        <span className="metadata-value">{evidenceLabel}</span>
                      </div>
                      <div className="metadata-row">
                        <span className="metadata-label">Format</span>
                        <span className="metadata-value">{format}</span>
                      </div>
                      <div className="metadata-row">
                        <span className="metadata-label">File Size</span>
                        <span className="metadata-value">{formatFileSize(inspectedEvidence.file_size)}</span>
                      </div>
                      <div className="metadata-row">
                        <span className="metadata-label">Hash Algorithm</span>
                        <span className="metadata-value">{hashAlgorithm}</span>
                      </div>
                      <div className="metadata-row">
                        <span className="metadata-label">Hash Value</span>
                        <span className="metadata-mono">{hashValue}</span>
                      </div>
                      <div className="metadata-row">
                        <span className="metadata-label">Encryption Standard</span>
                        <span className="metadata-value">{kexAlgorithm}</span>
                      </div>
                      <div className="metadata-row">
                        <span className="metadata-label">PQC Signature</span>
                        <span className="metadata-value">{sigAlgorithm}</span>
                      </div>
                      <div className="metadata-row">
                        <span className="metadata-label">System Entropy</span>
                        <span className="metadata-value">OS CSPRNG (server)</span>
                      </div>
                      {integrity?.error && (
                        <div className="metadata-alert">{integrity.error}</div>
                      )}
                    </div>
                  )
                })()}
              </aside>
            </div>
          ) : (
            <>
              {caseEvidence.length === 0 ? (
                <div className="empty-card">No evidence uploaded for this case yet.</div>
              ) : (
                <>
                  <div className="integrity-heatmap">
                    <div className="integrity-heatmap-head">
                      <div>
                        <p className="integrity-heatmap-kicker">Real-Time Integrity Heatmap</p>
                        <h4 className="integrity-heatmap-title">Evidence Safety Grid</h4>
                      </div>
                      <div className="integrity-heatmap-summary">
                        <span className="heatmap-chip heatmap-chip-safe">Safe {heatmapSummary.safe}</span>
                        <span className="heatmap-chip heatmap-chip-pending">Pending {heatmapSummary.pending}</span>
                        <span className="heatmap-chip heatmap-chip-tampered">Tampered {heatmapSummary.tampered}</span>
                      </div>
                    </div>
                    <div className="integrity-heatmap-grid">
                      {caseEvidence.map((entry, index) => {
                        const heat = getHeatmapStatus(entry)
                        const evidenceLabel = resolveEvidenceLabel(entry, index)
                        return (
                          <div
                            key={`heatmap-${entry.id}`}
                            className={`heatmap-card heatmap-${heat.tone} is-clickable`}
                            role="button"
                            tabIndex={0}
                            onClick={() => viewCustodyChain(entry, evidenceLabel)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                viewCustodyChain(entry, evidenceLabel)
                              }
                            }}
                            title="View custody chain"
                          >
                            <div className={`heatmap-shield heatmap-${heat.tone}`}>
                              {heat.icon}
                            </div>
                            <div className="heatmap-copy">
                              <p className="heatmap-name">{evidenceLabel}</p>
                              <p className="heatmap-meta">{heat.label}</p>
                              <div className="heatmap-actions">
                                <button
                                  type="button"
                                  className="heatmap-action-btn"
                                  disabled={verifyingEvidenceId === entry.id}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    verifyEvidence(entry)
                                  }}
                                >
                                  {verifyingEvidenceId === entry.id ? 'Verifying...' : 'Verify Integrity'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {showAdminActions && (
          <div className="created-case-admin-actions">
            {canAdminAssignInvestigator && (
              <button
                type="button"
                className="btn-outline created-case-upload-toggle"
                disabled={caseActionLoading}
                onClick={() => {
                  setShowReassignPicker((prev) => !prev)
                  setShowCourtGrantPanel(false)
                }}
              >
                <UserCog size={16} />
                {showReassignPicker
                  ? 'Hide Investigator Picker'
                  : (isReassignMode ? 'Reassign Investigator' : 'Assign Investigator')}
              </button>
            )}
            {canAdminGrantCourtAccess && (
              <button
                type="button"
                className="btn-outline created-case-upload-toggle"
                disabled={caseActionLoading}
                onClick={() => {
                  setShowCourtGrantPanel((prev) => !prev)
                  setShowReassignPicker(false)
                }}
              >
                <Gavel size={16} />
                {showCourtGrantPanel ? 'Hide Court Access' : 'Grant Court Access'}
              </button>
            )}
            {canAdminCloseCase && (
              <button
                type="button"
                className="btn-outline created-case-upload-toggle case-admin-action-danger close-case-btn"
                disabled={caseActionLoading}
                onClick={() => {
                  setShowReassignPicker(false)
                  setShowCourtGrantPanel(false)
                  handleCloseCase(item)
                }}
              >
                <XCircle size={16} />
                {caseActionLoading ? 'Updating...' : 'Close Case'}
              </button>
            )}
          </div>
        )}
      </article>
    )
  }

  return (
    <div className="cases-shell">
      {caseSuccessPopup && (
        <div className="case-success-popup" role="status" aria-live="polite">
          <div className="case-success-popup-card">
            <div className="case-success-popup-icon" aria-hidden="true">
              <BadgeCheck size={30} />
            </div>
            <div className="case-success-popup-copy">
              <p className="case-success-popup-kicker">Case Registered</p>
              <p className="case-success-popup-message">{caseSuccessPopup}</p>
            </div>
            <button
              type="button"
              className="case-success-popup-close"
              onClick={() => {
                setCaseSuccessPopup('')
                if (caseSuccessTimerRef.current) {
                  window.clearTimeout(caseSuccessTimerRef.current)
                  caseSuccessTimerRef.current = null
                }
              }}
              aria-label="Close case creation success message"
              title="Close"
            >
              <XCircle size={18} />
            </button>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="success-notification-popup" role="status" aria-live="polite">
          <div className="success-notification-card">
            <div className="success-notification-icon" aria-hidden="true">
              <BadgeCheck size={24} />
            </div>
            <p className="success-notification-message">{successMessage}</p>
            <button
              type="button"
              className="success-notification-close"
              onClick={() => {
                setSuccessMessage('')
                if (successMessageTimerRef.current) {
                  window.clearTimeout(successMessageTimerRef.current)
                  successMessageTimerRef.current = null
                }
              }}
              aria-label="Close success message"
              title="Close"
            >
              <XCircle size={17} />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg mb-6">
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {isCreateMode && (
        <>
          <div className="create-cases-header">
            <div className="create-cases-head-top">
              <div>
                <h1 className="create-cases-title">CREATE CASES</h1>
                <p className="create-cases-subtitle">Register a new case with essential intake details.</p>
              </div>
              <div className="form-top-actions fixed-top-actions">
                <div className="form-live-datetime" title="Current local date and time">
                  <div className="health-date-chip readonly-live-chip">
                    <span className="health-date-dot" />
                    <span className="health-date-value">{formatLiveDate(liveClock)}</span>
                    <span className="health-date-icon-wrap" aria-hidden="true">
                      <CalendarDays size={14} />
                    </span>
                  </div>
                  <div className="health-date-chip readonly-live-chip">
                    <span className="health-date-dot" />
                    <span className="health-date-value">{formatLiveTime(liveClock)}</span>
                    <span className="health-date-icon-wrap" aria-hidden="true">
                      <Clock3 size={14} />
                    </span>
                  </div>
                </div>
                {isInvestigator ? (
                  <Link to="/dashboard" className="btn-outline form-return-btn">
                    Return to Home
                  </Link>
                ) : (
                  <Link to="/cases/created" className="btn-outline form-return-btn">
                    List of Cases
                  </Link>
                )}
                {isCourtUser && (
                  <Link to="/dashboard" className="btn-outline form-return-btn">
                    Back
                  </Link>
                )}
                {showAdminReturn && (
                  <Link to="/admin?module=intake" className="btn-primary auth-bottom-right-link-btn form-return-btn">
                    Return
                  </Link>
                )}
            </div>
          </div>
          </div>

          <div className="card create-cases-card">
            <form onSubmit={handlePreviewCaseLedger} className="create-case-form">
              <section className="case-form-section">
                <div className="case-form-section-head">
                  <h2>Case Identification</h2>
                  <p>Fill the official case details exactly as recorded.</p>
                </div>
                <div className="create-case-form-grid">
                  <div className="create-case-field">
                    <label className="create-case-label">Case Number</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g., CASE-2026-001"
                      value={caseData.case_number}
                      onChange={(e) => updateCaseData({ case_number: e.target.value })}
                      onBlur={(e) => updateCaseData((prev) => ({ ...prev, case_number: e.target.value.trim().toUpperCase() }))}
                      maxLength={64}
                      required
                    />
                    <p className="create-case-help">
                      Note: Enter the exact case number from the case file so this case can be identified everywhere.
                    </p>
                  </div>

                  <div className="create-case-field">
                    <label className="create-case-label">Case Title</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g., State vs [Name], cyber fraud complaint"
                      value={caseData.case_title}
                      onChange={(e) => updateCaseData({ case_title: e.target.value })}
                      maxLength={250}
                      required
                    />
                    <p className="create-case-help">Use a concise official title that clearly identifies the matter.</p>
                  </div>
                </div>
              </section>

              <section className="case-form-section">
                <div className="case-form-section-head">
                  <h2>Location and Status</h2>
                  <p>Provide reporting station and select the current procedural stage.</p>
                </div>
                <div className="create-case-form-grid">
                  <div className="create-case-field">
                    <label className="create-case-label">State</label>
                    <CustomSelect
                      value={caseData.incident_state_code}
                      onChange={(value) => handleStateChange(value)}
                      options={stateOptions}
                      placeholder="Select state"
                    />
                    <p className="create-case-help">State code contributes to Quantum Ledger Number generation.</p>
                  </div>

                  <div className="create-case-field">
                    <label className="create-case-label">District</label>
                    <CustomSelect
                      value={caseData.incident_district_code}
                      onChange={(value) => handleDistrictChange(value)}
                      options={districtSelectOptions}
                      placeholder="Select district"
                      disabled={!caseData.incident_state_code}
                    />
                    <p className="create-case-help">District code contributes to Quantum Ledger Number generation.</p>
                  </div>
                </div>
                <div className="create-case-field">
                  <label className="create-case-label">Incident Reported Station</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g., Cyber Crime PS, Bengaluru"
                    value={caseData.incident_location}
                    onChange={(e) => updateCaseData({ incident_location: e.target.value })}
                    maxLength={220}
                    required
                  />
                  <p className="create-case-help">Enter the exact police station where the incident was reported.</p>
                </div>
                {!isInvestigator ? (
                  <div className="create-case-field">
                    <label className="create-case-label">Status</label>
                    <CustomSelect
                      value={caseData.status}
                      onChange={(value) => {
                        const nextStatus = value
                        updateCaseData((prev) => ({
                          ...prev,
                          status: nextStatus,
                          assigned_investigator_id: nextStatus === 'investigation' ? prev.assigned_investigator_id : '',
                        }))
                      }}
                      options={statusOptions}
                      placeholder="Select status"
                    />
                    <p className="create-case-help">This must be selected by the officer creating the case.</p>
                  </div>
                ) : (
                  <div className="create-case-field">
                    <label className="create-case-label">Status</label>
                    <input
                      type="text"
                      className="input-field"
                      value="Pending Admin Approval"
                      readOnly
                    />
                    <p className="create-case-help">
                      Your case will be reviewed by admin. Once approved, you will be assigned automatically.
                    </p>
                  </div>
                )}

                {!isInvestigator && caseData.status === 'investigation' && (
                  <div className="create-case-field">
                    <label className="create-case-label">Assigned Investigator</label>
                    {investigatorLoading && (
                      <p className="create-case-help">Loading investigators from users list...</p>
                    )}
                    {!investigatorLoading && investigators.length === 0 && (
                      <p className="create-case-help create-case-help-warning">
                        No investigator found in users list. Add the investigator to the system by creating the user.
                      </p>
                    )}
                    {!investigatorLoading && investigators.length > 0 && (
                      <div className="investigator-picker-shell">
                        <div className="investigator-picker-head">
                          <p className="investigator-picker-title">Select Investigator</p>
                          <p className="investigator-picker-subtitle">Swipe horizontally to browse investigators</p>
                        </div>
                        <div className="investigator-carousel" role="listbox" aria-label="Investigators">
                          {investigators.map((entry) => {
                            const isSelected = String(caseData.assigned_investigator_id) === String(entry.id)
                            return (
                              <button
                                key={entry.id}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                className={`investigator-card ${isSelected ? 'selected' : ''}`}
                                onClick={() => updateCaseData({ assigned_investigator_id: String(entry.id) })}
                              >
                                <div className="investigator-avatar-placeholder" aria-hidden="true" />
                                <div className="investigator-card-copy">
                                  <p className="investigator-name">{entry.username}</p>
                                  <p className="investigator-station">
                                    {entry.station_name || 'Station not specified'}
                                  </p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {!investigatorLoading && investigatorError && (
                      <p className="create-case-help create-case-help-warning">{investigatorError}</p>
                    )}
                  </div>
                )}
              </section>

              <div className="create-case-form-actions">
                <button type="submit" className="btn-primary">Submit</button>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={handleClearCaseForm}
                >
                  Clear Form
                </button>
              </div>

              {previewLedgerNumber && (
                <section className="ledger-preview-card">
                  <p className="ledger-preview-title">QUANTUM LEDGER NUMBER</p>
                  <p className="ledger-preview-value">{previewLedgerNumber}</p>
                  <p className="ledger-preview-help">
                    Review the details, then click Create Case File to complete case creation.
                  </p>
                  <button
                    type="button"
                    className="btn-primary ledger-preview-action"
                    onClick={handleCreateCaseFile}
                  >
                    Create Case File
                  </button>
                </section>
              )}
            </form>
          </div>

          <p className="create-cases-note">
            Use <strong>Intake Console → List of Cases</strong> to upload evidence and case-book pages to each case.
          </p>
        </>
      )}

      {isCreatedMode && (
        <>
          <div className="create-cases-header">
            <div className="create-cases-head-top">
              <div>
                <h1 className="create-cases-title">
                  {isCourtUser
                    ? courtView === 'request'
                      ? 'REQUEST ACCESS'
                      : 'ACCESSIBLE CASES'
                    : isInvestigator
                      ? 'ASSIGNED CASES'
                      : 'LIST OF CASES'}
                </h1>
                <p className="create-cases-subtitle">
                  {isCourtUser
                    ? courtView === 'request'
                      ? 'Submit a new access request and track its status.'
                      : 'Review accessible case files and evidence.'
                    : isInvestigator
                      ? 'Review your approved assignments, upload evidence, and update the case book.'
                      : 'Open each case and manage evidence plus case-book pages.'}
                </p>
              </div>
              <div className="form-top-actions fixed-top-actions">
                <div className="form-live-datetime" title="Current local date and time">
                  <div className="health-date-chip readonly-live-chip">
                    <span className="health-date-dot" />
                    <span className="health-date-value">{formatLiveDate(liveClock)}</span>
                    <span className="health-date-icon-wrap" aria-hidden="true">
                      <CalendarDays size={14} />
                    </span>
                  </div>
                  <div className="health-date-chip readonly-live-chip">
                    <span className="health-date-dot" />
                    <span className="health-date-value">{formatLiveTime(liveClock)}</span>
                    <span className="health-date-icon-wrap" aria-hidden="true">
                      <Clock3 size={14} />
                    </span>
                  </div>
                </div>
                {isCourtUser && (
                  <Link to="/dashboard" className="btn-outline form-return-btn">
                    Return
                  </Link>
                )}
                {!isCourtUser && !showAdminReturn && (
                  <Link to="/dashboard" className="btn-outline form-return-btn">
                    Return to Home
                  </Link>
                )}
                {showAdminReturn && (
                  <Link to="/admin?module=intake" className="btn-primary auth-bottom-right-link-btn form-return-btn">
                    Return
                  </Link>
                )}
              </div>
            </div>
          </div>

          {isCourtRequestView && (
            <>
              <div className="card create-cases-card mb-6" ref={courtAccessFormRef}>
                <div className="case-form-section-head">
                  <h2>Request Case Access</h2>
                  <p>Send an access request to admin using the case number. Add the quantum ledger number if available.</p>
                </div>
                <form onSubmit={handleCourtAccessRequestSubmit} className="create-case-form">
                  <div className="create-case-form-grid">
                    <div className="create-case-field">
                      <label className="create-case-label">Case Number</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="e.g., CASE-2026-001"
                        value={courtAccessForm.case_number}
                        onChange={(e) => setCourtAccessForm((prev) => ({ ...prev, case_number: e.target.value.toUpperCase() }))}
                        required
                      />
                    </div>
                    <div className="create-case-field">
                      <label className="create-case-label">Quantum Ledger Number (optional)</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="e.g., QL26ABCD1821"
                        value={courtAccessForm.quantum_ledger_number}
                        onChange={(e) => setCourtAccessForm((prev) => ({ ...prev, quantum_ledger_number: e.target.value.toUpperCase() }))}
                      />
                    </div>
                  </div>

                  <div className="create-case-form-grid">
                    <div className="create-case-field">
                      <label className="create-case-label">Requested Time Limit</label>
                      <div className="duration-field-row">
                        <div className="number-stepper">
                          <input
                            type="number"
                            min={1}
                            max={maxDurationValue(courtAccessForm.requested_duration_unit)}
                            step="1"
                            className="input-field number-stepper-input"
                            value={courtAccessForm.requested_duration_value}
                            onChange={(e) => setCourtAccessForm((prev) => ({ ...prev, requested_duration_value: e.target.value }))}
                            onBlur={(e) =>
                              setCourtAccessForm((prev) => ({
                                ...prev,
                                requested_duration_value: String(
                                  clampExtensionValue(e.target.value, prev.requested_duration_unit)
                                ),
                              }))
                            }
                            required
                          />
                          <div className="number-stepper-controls">
                            <button
                              type="button"
                              className="number-stepper-btn"
                              onClick={() => bumpCourtAccessDuration(1)}
                              aria-label="Increase time limit"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              type="button"
                              className="number-stepper-btn"
                              onClick={() => bumpCourtAccessDuration(-1)}
                              aria-label="Decrease time limit"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                        </div>
                        <CustomSelect
                          value={courtAccessForm.requested_duration_unit}
                          onChange={(value) => {
                            setCourtAccessForm((prev) => ({
                              ...prev,
                              requested_duration_unit: value,
                              requested_duration_value: String(extensionDefaultValue(value)),
                            }))
                          }}
                          options={EXTENSION_UNITS}
                          placeholder="Unit"
                          className="duration-unit-select"
                        />
                      </div>
                    </div>
                    <div className="create-case-field">
                      <label className="create-case-label">Reason (optional)</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Reason for access request"
                        value={courtAccessForm.reason}
                        onChange={(e) => setCourtAccessForm((prev) => ({ ...prev, reason: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="create-case-form-actions">
                    <button type="submit" className="btn-primary">Send Access Request</button>
                  </div>
                </form>
              </div>

              <div className="card create-cases-card mb-6 court-request-history">
                <h3 className="case-evidence-title">My Access Requests ({courtAccessRequests.length})</h3>
                {courtAccessRequestsLoading ? (
                  <div className="empty-card">Loading access requests...</div>
                ) : courtAccessRequests.length === 0 ? (
                  <div className="empty-card">No court access requests submitted yet.</div>
                ) : (
                  <div className="case-evidence-list">
                    {courtAccessRequests.map((entry) => (
                      <div key={entry.id} className="case-evidence-item">
                        <div className="case-evidence-main">
                          <Lock className="text-orange flex-shrink-0 mt-1" size={18} />
                          <div className="case-evidence-copy">
                            <p className="case-evidence-name">
                              {entry.case_number || entry.requested_case_number || 'Case'} {entry.quantum_ledger_number ? `(${entry.quantum_ledger_number})` : ''}
                            </p>
                            <p className="case-evidence-meta">
                              Status: {formatRequestStatus(entry.status)} | Requested: {formatDurationMinutes(entry.requested_duration_minutes)}
                            </p>
                            {entry.granted_expires_at && (
                              <p className="case-evidence-meta">Access Until: {formatDateTime(entry.granted_expires_at)}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {isCourtUser && isCourtCasesView && caseRows.length > 0 && (
            <div className="card mb-6 court-access-summary">
              {courtAccessSummary?.status === 'active' ? (
                <>
                  <p className="court-access-summary-title">You have accessible case files</p>
                  <p className="court-access-summary-body">
                    Access is active for {courtAccessSummary.count} case{courtAccessSummary.count === 1 ? '' : 's'}.
                    {courtAccessSummary.expiresAt
                      ? ` Access for ${courtAccessSummary.caseNumber || 'this case'} is valid until ${formatDateTime(courtAccessSummary.expiresAt)}.`
                      : ' Access window is active.'}
                  </p>
                </>
              ) : (
                <>
                  <p className="court-access-summary-title">No accessible case files</p>
                  <p className="court-access-summary-body">
                    No active access grants are available for your account.
                  </p>
                </>
              )}
            </div>
          )}

          {isCourtCasesView && (
            caseLoading ? (
              <div className="card text-gray-light">Loading case files...</div>
            ) : caseRows.length === 0 ? (
              <div className="card text-center py-12">
                <FileText className="mx-auto text-gray-light mb-4" size={48} />
                <p className="text-gray-light">
                  {isCourtUser
                    ? 'No accessible case files are currently assigned to your account.'
                    : isInvestigator
                      ? 'No assigned cases yet. New cases appear here after admin approval.'
                      : 'No case files created yet.'}
                </p>
              </div>
            ) : (
              <>
                <div className="case-log-head">
                  <div>
                    <h2 className="case-log-title">
                      {isCourtUser ? 'Accessible Cases' : isInvestigator ? 'Assigned Cases' : 'Cases'}
                    </h2>
                  </div>
                </div>
                <div className="case-log-layout">
                <aside className="card case-log-panel">
                  <div className="case-log-panel-head">
                    <div>
                      <p className="case-log-panel-kicker">Case Directory</p>
                    </div>
                    <span className="case-log-panel-count">{caseCountLabel}</span>
                  </div>
                  <div className="case-log-search">
                    <input
                      type="text"
                      className="input-field"
                      value={caseSearchQuery}
                      onChange={(e) => setCaseSearchQuery(e.target.value)}
                      placeholder="Search by Quantum Ledger Number or Case Number"
                    />
                  </div>
                  <div className="case-log-list">
                    {filteredCaseRows.length === 0 ? (
                      <div className="empty-card case-log-empty">No case records match your search.</div>
                    ) : (
                      filteredCaseRows.map((item) => {
                        const caseNumber = normalizeCaseRef(item.case_number)
                        const isActive = caseNumber === activeCaseNumber
                        const caseEvidenceCount = (item.evidenceItems || []).length
                        const caseBookPageCount = Number(item.case_book_page_count || 0)
                        const approvalStatus = String(item.approval_status || 'approved').trim().toLowerCase()
                        return (
                          <button
                            key={item.id || caseNumber}
                            type="button"
                            className={`case-log-row ${isActive ? 'is-active' : ''}`}
                            onClick={() => {
                              setActiveCaseNumber(caseNumber)
                              closeUploadForm()
                            }}
                          >
                            <div className="case-log-row-top">
                              <div className="case-log-row-main">
                                <p className="case-log-row-case">{caseNumber}</p>
                                {item.quantum_ledger_number && (
                                  <p className="case-log-row-ledger">{item.quantum_ledger_number}</p>
                                )}
                                <p className="case-log-row-title">{item.case_title || 'Untitled Case'}</p>
                              </div>
                              <div className="case-log-row-tags">
                                <span className="case-log-status">{formatCaseStatus(item.status)}</span>
                                {approvalStatus !== 'approved' && (
                                  <span className="case-log-approval">{formatApprovalStatus(approvalStatus)}</span>
                                )}
                              </div>
                            </div>
                            <div className="case-log-row-meta">
                              <span className="case-log-count">{caseEvidenceCount} evidence</span>
                              <span className="case-log-count">{caseBookPageCount} case-book pages</span>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </aside>
                <div className="case-log-detail">
                  {renderCaseDetails(activeCase)}
                </div>
                </div>
              </>
            )
          )}
        </>
      )}

      {showPqidPrompt && (
        <div className="case-book-modal-backdrop">
          <div className="case-book-modal">
            <div className="case-book-modal-head">
              <div>
                <p className="case-book-modal-kicker">PQID Verification</p>
                <h2 className="case-book-modal-title">{pqidPromptMeta.title}</h2>
              </div>
              <button
                type="button"
                onClick={closePqidPrompt}
                className="btn-outline"
                disabled={pqidSubmitting}
              >
                Close
              </button>
            </div>
            <div className="case-book-modal-body">
              <form onSubmit={handlePqidSubmit} className="case-upload-form">
                <div className="create-case-field">
                  <label className="create-case-label">PQID</label>
                  <input
                    type="text"
                    value={pqidInput}
                    onChange={(e) => setPqidInput(e.target.value)}
                    className="input-field"
                    placeholder="Enter your PQID"
                    required
                    disabled={pqidSubmitting}
                  />
                  {pqidError && (
                    <p className="create-case-help create-case-help-warning">{pqidError}</p>
                  )}
                  <p className="create-case-help">
                    {pqidPromptMeta.description}
                  </p>
                </div>
                <div className="created-case-upload-actions">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={pqidSubmitting}
                  >
                    {pqidPromptMeta.confirmLabel}
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={closePqidPrompt}
                    disabled={pqidSubmitting}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showCaseBookViewer && (
        <div className="case-book-modal-backdrop">
          <div className="case-book-modal">
            <div className="case-book-modal-head">
              <div>
                <p className="case-book-modal-kicker">{isCourtUser ? 'Court View' : 'Preview Mode'}</p>
                <h2 className="case-book-modal-title">
                  {activeCaseBook?.cover?.case_title || activeCaseBook?.case?.case_title || 'Case Book'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeCaseBookViewer}
                className="btn-outline"
              >
                Close
              </button>
            </div>

            <div className="case-book-modal-body">
              <div className="case-book-nav">
                <button
                  type="button"
                  className="btn-outline case-book-nav-btn"
                  onClick={() => setActiveBookPageIndex((prev) => Math.max(0, prev - 1))}
                  disabled={activeBookPageIndex <= 0}
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <p className="case-book-page-indicator">
                  Page {Math.min(activeBookPageIndex + 1, Math.max(caseBookPages.length, 1))} of {Math.max(caseBookPages.length, 1)}
                </p>
                <button
                  type="button"
                  className="btn-outline case-book-nav-btn"
                  onClick={() => setActiveBookPageIndex((prev) => Math.min(caseBookPages.length - 1, prev + 1))}
                  disabled={activeBookPageIndex >= caseBookPages.length - 1}
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="case-book-stage">
                {activeCaseBookPage?.type === 'cover' ? (
                  <article className="case-book-cover">
                    <p className="case-book-cover-tag">Official Case Book</p>
                    <h3 className="case-book-cover-title">{activeCaseBookPage.title}</h3>
                    <p className="case-book-cover-number">{activeCaseBookPage.case_number || 'N/A'}</p>
                    {activeCaseBookPage.quantum_ledger_number && (
                      <p className="case-book-cover-ledger">{activeCaseBookPage.quantum_ledger_number}</p>
                    )}
                    <div className="case-book-cover-meta">
                      <p>Status: {formatCaseStatus(activeCaseBookPage.status)}</p>
                      {activeCaseBookPage.incident_location && (
                        <p>Location: {activeCaseBookPage.incident_location}</p>
                      )}
                      {activeCaseBookPage.assigned_investigator_username && (
                        <p>Investigator: {activeCaseBookPage.assigned_investigator_username}</p>
                      )}
                      <p>Total uploaded pages: {activeCaseBookPage.page_count || 0}</p>
                    </div>
                  </article>
                ) : (
                  <article className="case-book-page">
                    {bookPageLoading && (
                      <div className="empty-card">Loading case-book page...</div>
                    )}
                    {!bookPageLoading && activeCaseBookPage && activeBookPageMimeType.startsWith('image/') && (
                      <img
                        src={activeBookPageUrl}
                        alt={activeCaseBookPage.filename || `Case book page ${activeCaseBookPage.page_number}`}
                        className="case-book-page-image"
                        draggable="false"
                        onContextMenu={(event) => event.preventDefault()}
                      />
                    )}
                    {!bookPageLoading && activeCaseBookPage && activeBookPageMimeType === 'application/pdf' && (
                      <div className="case-book-page-pdf-wrap">
                        <object
                          data={`${activeBookPageUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                          type="application/pdf"
                          className="case-book-page-pdf"
                        >
                          <p className="create-case-help">PDF preview is unavailable in this browser.</p>
                        </object>
                        {activeBookPageUrl && (
                          <a href={activeBookPageUrl} target="_blank" rel="noreferrer" className="case-book-open-link">
                            Open PDF in new tab
                          </a>
                        )}
                      </div>
                    )}
                    {!bookPageLoading && activeCaseBookPage && !activeBookPageMimeType && (
                      <div className="empty-card">Unable to render this page.</div>
                    )}
                    {!bookPageLoading
                      && activeCaseBookPage
                      && activeBookPageMimeType
                      && !activeBookPageMimeType.startsWith('image/')
                      && activeBookPageMimeType !== 'application/pdf'
                      && (
                        <div className="empty-card">
                          Preview is unavailable for this file format.
                          {activeBookPageUrl && (
                            <>
                              {' '}
                              <a href={activeBookPageUrl} target="_blank" rel="noreferrer">
                                Open file
                              </a>
                            </>
                          )}
                        </div>
                      )}
                    {activeCaseBookPage && (
                      <div className="case-book-page-meta">
                        <p className="case-book-page-name">{activeCaseBookPage.filename || 'Case Book Page'}</p>
                        <p className="case-book-page-sub">
                          Page {activeCaseBookPage.page_number} • {formatFileSize(activeCaseBookPage.file_size)} • Uploaded {formatDateTime(activeCaseBookPage.created_at)}
                        </p>
                        {activeCaseBookPage.summary && (
                          <p className="case-book-page-summary">{activeCaseBookPage.summary}</p>
                        )}
                      </div>
                    )}
                  </article>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedEvidence && (
        <div className="case-book-modal-backdrop custody-modal-backdrop">
          <div className="court-custody-modal">
            <div className="court-custody-head">
              <div>
                <p className="court-custody-kicker">Interactive Chain of Custody</p>
                <h2 className="court-custody-title">Chain of Custody</h2>
                {selectedEvidence.label && (
                  <p className="court-custody-subtitle">{selectedEvidence.label}</p>
                )}
                {canPreviewSelectedEvidence && (
                  <div className="custody-preview-option">
                    <button
                      type="button"
                      className="btn-outline custody-preview-btn"
                      onClick={previewSelectedEvidence}
                      disabled={custodyPreviewLoading}
                    >
                      {custodyPreviewLoading ? 'Loading Preview...' : 'Preview Evidence'}
                    </button>
                    {custodyPreviewError && (
                      <span className="custody-preview-error">{custodyPreviewError}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="court-custody-actions">
                {user?.role === 'investigator' && selectedEvidence.accessLevel !== 'court' && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => submitToCourt(selectedEvidence.id)}
                  >
                    Submit to Court
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedEvidence(null)
                    if (previewUrlRef.current) {
                      URL.revokeObjectURL(previewUrlRef.current)
                      previewUrlRef.current = null
                    }
                    setCustodyPreview(null)
                    setCustodyPreviewError('')
                  }}
                  className="btn-outline"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="court-custody-body">
              {custodyPreview && (
                <div className="custody-preview-card">
                  <div className="custody-preview-head">
                    <div>
                      <p className="custody-preview-kicker">Evidence Preview</p>
                      <p className="custody-preview-filename">{custodyPreview.filename || 'Evidence file'}</p>
                    </div>
                    <div className="custody-preview-actions">
                      <a
                        className="btn-outline custody-preview-btn"
                        href={custodyPreview.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open
                      </a>
                    </div>
                  </div>
                  <div className="custody-preview-frame">
                    {custodyPreview.kind === 'image' && (
                      <img
                        src={custodyPreview.url}
                        alt={custodyPreview.filename || 'Evidence preview'}
                        className="custody-preview-media"
                      />
                    )}
                    {custodyPreview.kind === 'video' && (
                      <video className="custody-preview-media" controls>
                        <source src={custodyPreview.url} type={custodyPreview.mime} />
                        Your browser does not support video playback.
                      </video>
                    )}
                    {custodyPreview.kind === 'audio' && (
                      <audio className="custody-preview-media" controls>
                        <source src={custodyPreview.url} type={custodyPreview.mime} />
                        Your browser does not support audio playback.
                      </audio>
                    )}
                    {custodyPreview.kind === 'pdf' && (
                      <iframe
                        src={custodyPreview.url}
                        title="Evidence PDF preview"
                        className="custody-preview-embed"
                      />
                    )}
                    {custodyPreview.kind === 'text' && (
                      <iframe
                        src={custodyPreview.url}
                        title="Evidence text preview"
                        className="custody-preview-embed"
                      />
                    )}
                    {custodyPreview.kind === 'generic' && (
                      <div className="custody-preview-generic">
                        Use Open to view this file type.
                      </div>
                    )}
                  </div>
                </div>
              )}
              {selectedEvidence.custodyRecords.length === 0 ? (
                <div className="empty-card">No custody records found.</div>
              ) : (
                <div className="custody-panel">
                  <div className="custody-timeline">
                    {selectedEvidence.custodyRecords.map((record, idx) => {
                      const handlerLabel = record.handler_name || `User ${record.user_id || 'Unknown'}`
                      const proofTone = record.signature_present ? 'verified' : 'missing'
                      const safeNotes = formatCustodyNotes(record.notes)
                      return (
                        <div key={`${record.id || idx}`} className="custody-node">
                          <div className="custody-marker">
                            <span className="custody-index">{idx + 1}</span>
                            {idx < selectedEvidence.custodyRecords.length - 1 && (
                              <span className="custody-line" />
                            )}
                          </div>
                          <div className="custody-card">
                            <div className="custody-card-head">
                              <p className="custody-action">{formatCustodyAction(record.action)}</p>
                              <span className={`custody-proof custody-proof-${proofTone}`}>
                                <Sparkles size={12} />
                                PQC Audit
                              </span>
                            </div>
                            <div className="custody-detail-grid">
                              <div className="custody-detail-row">
                                <span className="custody-detail-label">Handled By</span>
                                <span className="custody-detail-value">{handlerLabel}</span>
                              </div>
                              <div className="custody-detail-row">
                                <span className="custody-detail-label">Event Time</span>
                                <span className="custody-detail-value">{formatDateTime(record.timestamp)}</span>
                              </div>
                              {safeNotes.map((note) => (
                                <div key={note.label} className="custody-detail-row">
                                  <span className="custody-detail-label">{note.label}</span>
                                  <span className="custody-detail-value">{note.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
