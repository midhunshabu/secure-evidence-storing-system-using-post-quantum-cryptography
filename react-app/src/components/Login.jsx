import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../api'
import { AlertCircle, Eye, EyeOff, KeyRound, Lock, User } from 'lucide-react'

const base64UrlToBuffer = (value) => {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = window.atob(base64 + padding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

const bufferToBase64Url = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const normalizePublicKeyOptions = (options = {}) => {
  const publicKey = { ...options }
  if (publicKey.challenge) {
    publicKey.challenge = base64UrlToBuffer(publicKey.challenge)
  }
  if (publicKey.user?.id) {
    publicKey.user = { ...publicKey.user, id: base64UrlToBuffer(publicKey.user.id) }
  }
  if (Array.isArray(publicKey.excludeCredentials)) {
    publicKey.excludeCredentials = publicKey.excludeCredentials.map((cred) => ({
      ...cred,
      id: base64UrlToBuffer(cred.id),
    }))
  }
  if (Array.isArray(publicKey.allowCredentials)) {
    publicKey.allowCredentials = publicKey.allowCredentials.map((cred) => ({
      ...cred,
      id: base64UrlToBuffer(cred.id),
    }))
  }
  return publicKey
}

const bufferViewToBase64Url = (view) =>
  bufferToBase64Url(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))

const serializeCredential = (credential) => {
  const response = credential?.response
  const serialized = {
    id: credential?.id,
    rawId: credential?.rawId ? bufferToBase64Url(credential.rawId) : undefined,
    type: credential?.type,
    response: {
      clientDataJSON: response?.clientDataJSON
        ? bufferViewToBase64Url(new Uint8Array(response.clientDataJSON))
        : undefined,
    },
  }

  if (response?.attestationObject) {
    serialized.response.attestationObject = bufferViewToBase64Url(new Uint8Array(response.attestationObject))
  }
  if (response?.authenticatorData) {
    serialized.response.authenticatorData = bufferViewToBase64Url(new Uint8Array(response.authenticatorData))
  }
  if (response?.signature) {
    serialized.response.signature = bufferViewToBase64Url(new Uint8Array(response.signature))
  }
  if (response?.userHandle) {
    serialized.response.userHandle = bufferViewToBase64Url(new Uint8Array(response.userHandle))
  }
  if (response?.getTransports) {
    serialized.response.transports = response.getTransports()
  }
  if (credential?.getClientExtensionResults) {
    serialized.clientExtensionResults = credential.getClientExtensionResults()
  }
  if (credential?.authenticatorAttachment) {
    serialized.authenticatorAttachment = credential.authenticatorAttachment
  }

  return serialized
}

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [webauthnPayload, setWebauthnPayload] = useState(null)
  const [webauthnLoading, setWebauthnLoading] = useState(false)
  const navigate = useNavigate()

  const completeLogin = (payload) => {
    if (!payload?.access_token || !payload?.user) {
      throw new Error('Login response was incomplete. Please check that the backend is running correctly.')
    }
    const { access_token, user } = payload
    onLogin(access_token, user)
    navigate(user?.role === 'admin' ? '/admin' : '/dashboard')
  }

  const resetWebauthn = () => {
    setWebauthnPayload(null)
    setWebauthnLoading(false)
    setError('')
  }

  const handleWebauthnSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!webauthnPayload?.login_token || !webauthnPayload?.options) {
      setError('Passkey session is missing. Please retry login.')
      return
    }
    if (!window.PublicKeyCredential || !navigator.credentials) {
      setError('Passkeys are not supported on this device or browser.')
      return
    }
    if (!window.isSecureContext) {
      setError('Passkeys require HTTPS (or localhost) to work.')
      return
    }

    setWebauthnLoading(true)
    try {
      const publicKey = normalizePublicKeyOptions(webauthnPayload.options)
      let credential = null

      if (webauthnPayload.stage === 'register') {
        credential = await navigator.credentials.create({ publicKey })
      } else {
        credential = await navigator.credentials.get({ publicKey })
      }

      if (!credential) {
        throw new Error('No passkey response received.')
      }

      const credentialJson = serializeCredential(credential)

      const response = await authAPI.webauthnVerify(webauthnPayload.login_token, credentialJson)
      if (response.data?.access_token) {
        completeLogin(response.data)
      } else {
        setError(response.data?.message || 'Passkey verification succeeded, but login was not completed.')
      }
    } catch (err) {
      const message = err.name === 'NotAllowedError'
        ? 'Passkey request was cancelled or timed out.'
        : err.response?.data?.error || err.message || 'Passkey verification failed.'
      setError(message)
    } finally {
      setWebauthnLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await authAPI.loginVerify(username, password)
      if (response.data?.mfa_required && response.data?.mfa_type === 'webauthn') {
        setWebauthnPayload(response.data)
        return
      }
      completeLogin(response.data)
    } catch (err) {
      const message = err.response
        ? err.response?.data?.error || 'Login failed. Please try again.'
        : 'Backend server is not reachable. Start the Flask backend on port 5000, then try again.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <p className="auth-kicker">Digital Forensics Platform</p>
        <h1>PQC Evidence Vault</h1>
        <p>Secure evidence chain, signer-grade identity, and audit integrity in one system.</p>
      </div>
      <div className="auth-card">
        <div className="auth-head">
          <div className="auth-logo">◆</div>
          <div>
            <h2 className="auth-login-title">Welcome Back</h2>
            <p>Sign in with username and password</p>
          </div>
        </div>

        {webauthnPayload ? (
          <form onSubmit={handleWebauthnSubmit} className="auth-form">
            {error && (
              <div className="auth-alert">
                <AlertCircle className="auth-alert-icon" size={18} />
                <p className="auth-alert-text">{error}</p>
              </div>
            )}
            <div className="input-group">
              <label className="field-label">
                <KeyRound size={18} />
                Passkey Verification
              </label>
              <p className="auth-mfa-copy">
                {webauthnPayload.stage === 'register'
                  ? 'Create a passkey on this device to continue signing in.'
                  : 'Confirm with your device passkey to finish signing in.'}
              </p>
            </div>
            <div className="auth-action auth-mfa-actions">
              <button
                type="submit"
                className="btn-primary auth-submit"
                disabled={webauthnLoading}
              >
                {webauthnLoading
                  ? 'Waiting for Passkey...'
                  : webauthnPayload.stage === 'register'
                    ? 'Create Passkey'
                    : 'Use Passkey'}
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={resetWebauthn}
                disabled={webauthnLoading}
              >
                Back
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
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
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="Enter username"
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field input-field-with-toggle"
                  placeholder="Enter your password"
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

            <div className="auth-action">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary auth-submit"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
