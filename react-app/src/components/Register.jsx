import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { adminAPI, authAPI } from '../api'
import { isPqidBypassUser } from '../constants/pqid'
import CustomSelect from './CustomSelect'
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Eye, EyeOff, User, Mail, Lock, Shield, MapPin, Phone } from 'lucide-react'

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

function normalizeSimilarityToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function canonicalizeSimilarityToken(value) {
  const substitutions = {
    0: 'o',
    1: 'i',
    3: 'e',
    4: 'a',
    5: 's',
    7: 't',
    8: 'b',
    '@': 'a',
    '$': 's',
    '!': 'i',
  }
  return String(value || '')
    .toLowerCase()
    .replace(/[0134578@$!]/g, (char) => substitutions[char] || char)
    .replace(/[^a-z0-9]/g, '')
}

function similarityRatio(a, b) {
  if (!a || !b) return 0
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = Array(b.length + 1).fill(0)

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      )
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j]
    }
  }

  const distance = previous[b.length]
  return 1 - distance / Math.max(a.length, b.length)
}

function hasSharedUsernameChunk(usernameToken, passwordToken) {
  if (usernameToken.length < 4 || passwordToken.length < 4) return false
  const chunkSize = Math.min(4, usernameToken.length, passwordToken.length)
  for (let index = 0; index <= usernameToken.length - chunkSize; index += 1) {
    if (passwordToken.includes(usernameToken.slice(index, index + chunkSize))) {
      return true
    }
  }
  return false
}

function isPasswordSimilarToUsername(username, password) {
  const tokenPairs = [
    [normalizeSimilarityToken(username), normalizeSimilarityToken(password)],
    [canonicalizeSimilarityToken(username), canonicalizeSimilarityToken(password)],
  ]

  for (const [normalizedUsername, normalizedPassword] of tokenPairs) {
    if (!normalizedUsername || !normalizedPassword) continue
    if (normalizedUsername === normalizedPassword) return true
    if (normalizedUsername.includes(normalizedPassword) || normalizedPassword.includes(normalizedUsername)) {
      return true
    }
    if (hasSharedUsernameChunk(normalizedUsername, normalizedPassword)) {
      return true
    }
    if (similarityRatio(normalizedUsername, normalizedPassword) >= 0.72) {
      return true
    }
  }
  return false
}

export default function Register({ onRegister, adminMode = false, currentUser = null }) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: '',
    address: '',
    phoneNumber: '',
    aadharNumber: '',
    designation: '',
    courtDetails: '',
    stationName: '',
    isPhysicallyVerified: false,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPqidPrompt, setShowPqidPrompt] = useState(false)
  const [pqidInput, setPqidInput] = useState('')
  const [pqidError, setPqidError] = useState('')
  const [pqidSubmitting, setPqidSubmitting] = useState(false)
  const [pendingRegistration, setPendingRegistration] = useState(null)
  const [aadharStatus, setAadharStatus] = useState({ state: 'idle', message: '' })
  const aadharCheckSeq = useRef(0)

  const [showSuccess, setShowSuccess] = useState(false)
  const [generatedPQID, setGeneratedPQID] = useState('')
  const [showPqidPreview, setShowPqidPreview] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [liveClock, setLiveClock] = useState(() => new Date())
  const navigate = useNavigate()
  const isPqidBypass = isPqidBypassUser(currentUser)
  const isUserCardFlipped = showPqidPreview || showSuccess
  const isPqidStage = showPqidPreview && !showSuccess
  const canSelectRole =
    formData.username.trim().length > 0 &&
    formData.email.trim().length > 0 &&
    formData.password.trim().length > 0 &&
    formData.confirmPassword.trim().length > 0

  useEffect(() => {
    const clockId = window.setInterval(() => setLiveClock(new Date()), 30000)
    return () => window.clearInterval(clockId)
  }, [])

  useEffect(() => {
    if (!canSelectRole && formData.role) {
      setFormData((prev) => ({ ...prev, role: '' }))
    }
  }, [canSelectRole, formData.role])

  useEffect(() => {
    if (!adminMode || !formData.role) {
      setAadharStatus({ state: 'idle', message: '' })
      return
    }
    const normalized = String(formData.aadharNumber || '').replace(/\D/g, '')
    if (!normalized) {
      setAadharStatus({ state: 'idle', message: '' })
      return
    }
    if (normalized.length !== 12) {
      setAadharStatus({ state: 'invalid', message: 'Enter a valid 12-digit Aadhar number.' })
      return
    }

    const seq = ++aadharCheckSeq.current
    setAadharStatus({ state: 'checking', message: 'Checking Aadhar registry...' })
    const timer = window.setTimeout(async () => {
      try {
        const res = await adminAPI.checkAadhar(normalized)
        if (seq !== aadharCheckSeq.current) return
        const exists = Boolean(res.data?.exists)
        setAadharStatus({
          state: exists ? 'exists' : 'available',
          message: exists ? 'Aadhar number already registered.' : 'Aadhar number available.',
        })
      } catch (err) {
        if (seq !== aadharCheckSeq.current) return
        setAadharStatus({
          state: 'error',
          message: err.response?.data?.error || 'Unable to verify Aadhar number.',
        })
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [adminMode, formData.aadharNumber, formData.role])

  const playSuccessChime = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return

      const ctx = new AudioCtx()
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => { })
      }

      const now = ctx.currentTime
      const master = ctx.createGain()
      master.gain.setValueAtTime(0.0001, now)
      master.gain.exponentialRampToValueAtTime(0.16, now + 0.01)
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.58)
      master.connect(ctx.destination)

      const notes = [740, 988, 1318]
      notes.forEach((frequency, idx) => {
        const start = now + idx * 0.09
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.setValueAtTime(frequency, start)
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(0.32, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22)

        osc.connect(gain)
        gain.connect(master)
        osc.start(start)
        osc.stop(start + 0.24)
      })

      window.setTimeout(() => {
        ctx.close().catch(() => { })
      }, 720)
    } catch {
      // Ignore audio failures; success UI still appears.
    }
  }

  const finalizeAdminSuccess = () => {
    setShowSuccess(true)
    setError('')
    playSuccessChime()
    window.setTimeout(() => setShowSuccess(false), 1800)
    setFormData({
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'investigator',
      address: '',
      phoneNumber: '',
      aadharNumber: '',
      designation: '',
      courtDetails: '',
      stationName: '',
      isPhysicallyVerified: false,
    })
    setGeneratedPQID('')
    setShowPqidPreview(false)
    setShowPassword(false)
    setShowConfirmPassword(false)
    setAadharStatus({ state: 'idle', message: '' })
  }

  const resetRegistrationForm = () => {
    setFormData({
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'investigator',
      address: '',
      phoneNumber: '',
      aadharNumber: '',
      designation: '',
      courtDetails: '',
      stationName: '',
      isPhysicallyVerified: false,
    })
    setGeneratedPQID('')
    setShowSuccess(false)
    setShowPqidPreview(false)
    setShowPassword(false)
    setShowConfirmPassword(false)
    setPendingRegistration(null)
    setShowPqidPrompt(false)
    setPqidInput('')
    setPqidError('')
    setAadharStatus({ state: 'idle', message: '' })
  }


  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
    setGeneratedPQID('')
    setShowPqidPreview(false)
  }

  const validateRegistration = () => {
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return null
    }

    if (isPasswordSimilarToUsername(formData.username, formData.password)) {
      setError('Password must be clearly different from the username')
      return null
    }

    const normalizedAadhar = String(formData.aadharNumber || '').replace(/\D/g, '')
    if (formData.role && normalizedAadhar.length !== 12) {
      setError('Aadhar number must contain exactly 12 digits')
      return null
    }
    const normalizedPhone = String(formData.phoneNumber || '').replace(/\D/g, '')
    if (formData.role && normalizedPhone.length !== 10) {
      setError('Phone number must contain exactly 10 digits')
      return null
    }

    if (adminMode && aadharStatus.state === 'exists') {
      setError('Aadhar number already registered')
      return null
    }
    if (adminMode && aadharStatus.state === 'checking') {
      setError('Please wait for the Aadhar registry check to finish')
      return null
    }

    return { normalizedAadhar, normalizedPhone }
  }

  const handlePqidOk = () => {
    finalizeAdminSuccess()
  }

  const applyAdminRegistrationError = (payload, bypassPrompt = false) => {
    if (payload.lockout) {
      localStorage.removeItem('access_token')
      resetRegistrationForm()
      navigate('/login')
      return
    }
    if (payload.error === 'Weak password' && payload.requirements) {
      const req = payload.requirements
      const missing = []
      if (!req.length) missing.push('at least 12 characters')
      if (!req.uppercase) missing.push('one uppercase letter')
      if (!req.lowercase) missing.push('one lowercase letter')
      if (!req.digit) missing.push('one number')
      if (!req.special) missing.push('one special character')
      setError(`Use a stronger password: ${missing.join(', ')}.`)
      if (!bypassPrompt) {
        setShowPqidPrompt(false)
      }
      return
    }

    const message = payload.error || 'Registration failed. Please try again.'
    if (!bypassPrompt && String(message).toLowerCase().includes('pqid')) {
      setPqidError(message)
      return
    }
    setError(message)
    if (!bypassPrompt) {
      setShowPqidPrompt(false)
    }
  }

  const submitAdminRegistration = async (registration, pqidValue, bypassPrompt = false) => {
    if (!registration) {
      return
    }
    if (bypassPrompt) {
      setLoading(true)
    } else {
      setPqidSubmitting(true)
      setPqidError('')
    }
    try {
      const response = await authAPI.register(
        registration.username,
        registration.email,
        registration.password,
        registration.role,
        registration.address,
        registration.phoneNumber,
        registration.isPhysicallyVerified,
        registration.aadharNumber,
        registration.designation,
        registration.courtDetails,
        registration.stationName,
        false,
        pqidValue
      )
      setGeneratedPQID(response.data?.pqid || '')
      setShowPqidPreview(true)
      setShowPqidPrompt(false)
      setPendingRegistration(null)
      setError('')
    } catch (err) {
      const payload = err.response?.data || {}
      applyAdminRegistrationError(payload, bypassPrompt)
    } finally {
      if (bypassPrompt) {
        setLoading(false)
      } else {
        setPqidSubmitting(false)
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const validation = validateRegistration()
    if (!validation) return
    const { normalizedAadhar, normalizedPhone } = validation

    if (adminMode) {
      const registration = {
        username: formData.username,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        address: formData.address,
        phoneNumber: normalizedPhone,
        isPhysicallyVerified: formData.isPhysicallyVerified,
        aadharNumber: normalizedAadhar,
        designation: formData.designation,
        courtDetails: formData.courtDetails,
        stationName: formData.stationName,
      }
      if (isPqidBypass) {
        setPqidInput('')
        setPqidError('')
        setShowPqidPrompt(false)
        await submitAdminRegistration(registration, '', true)
        return
      }
      setPendingRegistration(registration)
      setPqidInput('')
      setPqidError('')
      setShowPqidPrompt(true)
      return
    }

    setLoading(true)

    try {
      const response = await authAPI.register(
        formData.username,
        formData.email,
        formData.password,
        formData.role,
        formData.address,
        normalizedPhone,
        formData.isPhysicallyVerified,
        normalizedAadhar,
        formData.designation,
        formData.courtDetails,
        formData.stationName
      )

      if (response.data.access_token) {
        onRegister(response.data.access_token, response.data.user)
        navigate('/dashboard')
      } else {
        navigate('/login')
      }
    } catch (err) {
      const payload = err.response?.data || {}
      if (payload.error === 'Weak password' && payload.requirements) {
        const req = payload.requirements
        const missing = []
        if (!req.length) missing.push('at least 12 characters')
        if (!req.uppercase) missing.push('one uppercase letter')
        if (!req.lowercase) missing.push('one lowercase letter')
        if (!req.digit) missing.push('one number')
        if (!req.special) missing.push('one special character')
        setError(
          `Use a stronger password: ${missing.join(', ')}.`
        )
      } else {
        setError(payload.error || 'Registration failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePqidSubmit = async (e) => {
    e.preventDefault()
    if (!pendingRegistration) {
      setShowPqidPrompt(false)
      return
    }
    const trimmed = pqidInput.trim()
    if (!trimmed) {
      setPqidError('Please enter your PQID.')
      return
    }
    await submitAdminRegistration(pendingRegistration, trimmed, false)
  }

  const handlePqidCancel = () => {
    setShowPqidPrompt(false)
    setPqidInput('')
    setPqidError('')
    setPqidSubmitting(false)
  }

  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <p className="auth-kicker">Identity Setup</p>
        <h1>Create Your Operator Profile</h1>
        <p>Generate your post-quantum auth identity and start securing evidence workflows.</p>
      </div>
      <div className={`auth-card ${isUserCardFlipped ? 'is-flipped' : ''} ${isPqidStage ? 'is-pqid-stage' : ''}`}>
        <div className="auth-card-flip">
          <div className="auth-card-face auth-card-front" aria-hidden={isUserCardFlipped}>
            <div className="auth-head">
              <div className="auth-logo">◆</div>
              <div>
                <h2>Create User Account</h2>
                <p>{adminMode ? 'Admin-only user provisioning' : 'Provision access and cryptographic identity'}</p>
              </div>
            </div>

            <form className="auth-form auth-register-form" onSubmit={handleSubmit}>
              {error && (
                <div className="auth-alert">
                  <AlertCircle className="auth-alert-icon" size={18} />
                  <p className="auth-alert-text">{error}</p>
                </div>
              )}

              <div className="input-group">
                <label className="field-label">
                  <User size={18} />
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Choose a username"
                  disabled={loading}
                  required
                />
              </div>

              <div className="input-group">
                <label className="field-label">
                  <Mail size={18} />
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Enter your email"
                  disabled={loading}
                  required
                />
              </div>

              <div className="input-group">
                <label className="field-label">
                  <Lock size={18} />
                  Password
                </label>
                <div className="password-input-shell">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="input-field input-field-with-toggle"
                    placeholder="Enter password"
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword((state) => !state)}
                    disabled={loading}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label className="field-label">
                  <Lock size={18} />
                  Confirm Password
                </label>
                <div className="password-input-shell">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="input-field input-field-with-toggle"
                    placeholder="Confirm password"
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowConfirmPassword((state) => !state)}
                    disabled={loading}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    title={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label className="field-label">
                  <Shield size={18} />
                  Role
                </label>
                <CustomSelect
                  value={formData.role}
                  onChange={(value) => {
                    setFormData((prev) => ({ ...prev, role: value }))
                    setGeneratedPQID('')
                    setShowPqidPreview(false)
                  }}
                  options={[
                    ...(adminMode ? [{ value: 'admin', label: 'Admin' }] : []),
                    { value: 'court_user', label: 'Court User' },
                    { value: 'investigator', label: 'Investigator' },
                  ]}
                  placeholder="Select User"
                  disabled={loading || !canSelectRole}
                />
              </div>

              {formData.role && (
                <>
                  <div className="input-group">
                    <label className="field-label">
                      <Shield size={18} />
                      Aadhar Number
                    </label>
                    <input
                      type="text"
                      name="aadharNumber"
                      value={formData.aadharNumber}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          aadharNumber: e.target.value.replace(/\D/g, '').slice(0, 12),
                        })
                        setGeneratedPQID('')
                        setShowPqidPreview(false)
                      }}
                      className="input-field"
                      placeholder="Enter 12-digit Aadhar number"
                      inputMode="numeric"
                      pattern="[0-9]{12}"
                      maxLength={12}
                      autoComplete="off"
                      title="Enter a valid 12-digit Aadhar number"
                      disabled={loading}
                      required
                    />
                    {adminMode && aadharStatus.state !== 'idle' && (
                      <p className={`field-helper aadhar-${aadharStatus.state}`}>
                        {aadharStatus.message}
                      </p>
                    )}
                  </div>

                  <div className="auth-checkbox-row">
                    <input
                      type="checkbox"
                      name="isPhysicallyVerified"
                      id="isPhysicallyVerified"
                      checked={formData.isPhysicallyVerified}
                      onChange={(e) => {
                        setFormData({ ...formData, isPhysicallyVerified: e.target.checked })
                        setGeneratedPQID('')
                        setShowPqidPreview(false)
                      }}
                      className="auth-checkbox"
                      required
                    />
                    <label htmlFor="isPhysicallyVerified" className="auth-checkbox-label">
                      I confirm that the physical identity and credentials of his/her have been verified in person.
                    </label>
                  </div>

                  {formData.role === 'court_user' && (
                    <>
                      <div className="input-group">
                        <label className="field-label">
                          <User size={18} />
                          Designation
                        </label>
                        <input
                          type="text"
                          name="designation"
                          value={formData.designation}
                          onChange={handleChange}
                          className="input-field"
                          placeholder="e.g. Court Clerk"
                          disabled={loading}
                          required
                        />
                      </div>
                      <div className="input-group">
                        <label className="field-label">
                          <MapPin size={18} />
                          Court Name & Details
                        </label>
                        <textarea
                          name="courtDetails"
                          value={formData.courtDetails}
                          onChange={handleChange}
                          className="input-field auth-textarea"
                          placeholder="Enter court details"
                          disabled={loading}
                          required
                        />
                      </div>
                    </>
                  )}

                  {formData.role === 'investigator' && (
                    <div className="input-group">
                      <label className="field-label">
                        <Shield size={18} />
                        Station Name
                      </label>
                      <input
                        type="text"
                        name="stationName"
                        value={formData.stationName}
                        onChange={handleChange}
                        className="input-field"
                        placeholder="Enter police station name"
                        disabled={loading}
                        required
                      />
                    </div>
                  )}

                  <div className="input-group">
                    <label className="field-label">
                      <MapPin size={18} />
                      Address
                    </label>
                    <textarea
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      className="input-field auth-textarea"
                      placeholder="Enter physical address"
                      disabled={loading}
                      required
                    />
                  </div>

                  <div className="input-group">
                    <label className="field-label">
                      <Phone size={18} />
                      Phone Number
                    </label>
                    <input
                      type="text"
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 10),
                        })
                        setGeneratedPQID('')
                        setShowPqidPreview(false)
                      }}
                      className="input-field"
                      placeholder="Enter 10-digit phone number"
                      inputMode="numeric"
                      pattern="[0-9]{10}"
                      maxLength={10}
                      autoComplete="off"
                      title="Enter a valid 10-digit phone number"
                      disabled={loading}
                      required
                    />
                  </div>

                  <div className="create-user-generate-wrap">
                    <button
                      type="submit"
                      className="btn-primary create-user-submit"
                      disabled={
                        loading
                        || (adminMode && ['exists', 'checking'].includes(aadharStatus.state))
                      }
                    >
                      {loading ? 'Creating User Account...' : 'Create User Account'}
                    </button>
                  </div>
                </>
              )}
            </form>

            {!adminMode && (
              <div className="auth-switch">
                <p>
                  Already have an account?{' '}
                  <Link to="/login" className="auth-switch-link">
                    Sign in
                  </Link>
                </p>
              </div>
            )}
          </div>

          <div className="auth-card-face auth-card-back" aria-hidden={!isUserCardFlipped}>
            {showSuccess ? (
              <div className="create-success-panel" role="status" aria-live="polite">
                <div className="create-success-mark">
                  <CheckCircle2 size={36} />
                </div>
                <h3>User Created</h3>
                <p>Operator profile has been provisioned successfully.</p>
              </div>
            ) : showPqidPreview ? (
              <div className="create-user-back-panel">
                <div className="create-user-back-head">
                  <p className="create-user-back-kicker">PQID ISSUED</p>
                  <h3>Share This PQID With The User</h3>
                  <p>Store this securely. It will be needed for restricted or high-security actions.</p>
                </div>
                {error && (
                  <div className="auth-alert">
                    <AlertCircle className="auth-alert-icon" size={18} />
                    <p className="auth-alert-text">{error}</p>
                  </div>
                )}
                <div className="create-user-confirm">
                  <div className="pqid-preview">
                    <p className="pqid-label">PQID</p>
                    <p className="pqid-value">{generatedPQID || '—'}</p>
                    <p className="pqid-hint">Store this securely. It is required for restricted actions.</p>
                  </div>
                  <div className="create-user-flow-actions">
                    <button
                      type="button"
                      onClick={handlePqidOk}
                      className="btn-primary create-user-submit"
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showPqidPrompt && (
        <div className="case-book-modal-backdrop">
          <div className="case-book-modal">
            <div className="case-book-modal-head">
              <div>
                <p className="case-book-modal-kicker">PQID Verification</p>
                <h2 className="case-book-modal-title">Approve User Creation</h2>
              </div>
              <button
                type="button"
                onClick={handlePqidCancel}
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
                    Enter your PQID to approve this user creation request.
                  </p>
                </div>
                <div className="created-case-upload-actions">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={pqidSubmitting}
                  >
                    Verify PQID & Create User
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={handlePqidCancel}
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

      {adminMode && (
        <div className="auth-bottom-right-link create-user-top-actions">
          <div className="form-top-actions">
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
            <Link to="/admin?module=intake" className="btn-primary auth-bottom-right-link-btn form-return-btn">
              Return
            </Link>
          </div>
        </div>
      )}

    </div>
  )
}
