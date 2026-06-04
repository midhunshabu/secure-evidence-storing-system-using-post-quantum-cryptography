import axios from 'axios'

const API_BASE_URL = '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise = null

const AUTH_FLOW_ENDPOINTS = new Set([
  '/auth/login-challenge',
  '/auth/login-verify',
  '/auth/login-pqid',
  '/auth/webauthn/verify',
])

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {}
    const status = error.response?.status
    const isRefreshCall = String(original.url || '') === '/auth/refresh'
    const isAuthFlowCall = AUTH_FLOW_ENDPOINTS.has(String(original.url || ''))
    const hasAccessToken = Boolean(localStorage.getItem('access_token'))

    if (status === 401 && hasAccessToken && !original._retry && !isRefreshCall && !isAuthFlowCall) {
      original._retry = true
      try {
        if (!refreshPromise) {
          refreshPromise = api.post('/auth/refresh', {}).finally(() => {
            refreshPromise = null
          })
        }
        const refreshRes = await refreshPromise
        const newAccessToken = refreshRes?.data?.access_token
        if (!newAccessToken) {
          throw new Error('No access token in refresh response')
        }
        localStorage.setItem('access_token', newAccessToken)
        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${newAccessToken}`
        return api(original)
      } catch (refreshError) {
        localStorage.removeItem('access_token')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    if (status === 401 && !isAuthFlowCall) {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  register: (
    username,
    email,
    password,
    role,
    address,
    phone_number,
    is_physically_verified,
    aadhar_number = '',
    designation = '',
    court_details = '',
    station_name = '',
    enroll_webauthn = false,
    pqid = ''
  ) =>
    api.post('/auth/register', {
      username,
      email,
      password,
      role,
      address,
      phone_number,
      is_physically_verified,
      aadhar_number: String(aadhar_number || '').replace(/\D/g, '').slice(0, 12),
      designation,
      court_details,
      station_name,
      enroll_webauthn,
      pqid: pqid || undefined,
    }),

  loginChallenge: (username) =>
    api.post('/auth/login-challenge', { username }),

  loginVerify: (username, password) =>
    api.post('/auth/login-verify', {
      username,
      password,
    }),

  loginPqid: (login_token, pqid) =>
    api.post('/auth/login-pqid', {
      login_token,
      pqid,
    }),

  webauthnVerify: (login_token, credential) =>
    api.post('/auth/webauthn/verify', {
      login_token,
      credential,
    }),

  refresh: () =>
    api.post('/auth/refresh', {}),

  verifyToken: (token) =>
    api.get('/auth/verify-token', { headers: token ? { Authorization: `Bearer ${token}` } : {} }),

  presence: () =>
    api.get('/auth/presence'),

  logout: () =>
    api.post('/auth/logout', {}),
}

export const evidenceAPI = {
  listInvestigators: () =>
    api.get('/evidence/investigators'),

  listCourtUsers: () =>
    api.get('/evidence/court-users'),

  listCourtAccessRequests: (params = {}) =>
    api.get('/evidence/court-access-requests', { params }),

  requestCourtAccess: (payload) =>
    api.post('/evidence/court-access-requests', payload),

  approveCourtAccessRequest: (requestId, payload = {}) =>
    api.post(`/evidence/court-access-requests/${requestId}/approve`, payload),

  denyCourtAccessRequest: (requestId, payload = {}) =>
    api.post(`/evidence/court-access-requests/${requestId}/deny`, payload),

  previewCaseLedger: (payload) =>
    api.post('/evidence/cases/preview-ledger', payload),

  createCase: (payload) =>
    api.post('/evidence/cases', payload),

  listCases: () =>
    api.get('/evidence/cases'),

  listCaseCourtAccessGrants: (caseId, includeHistory = false) =>
    api.get(`/evidence/cases/${caseId}/court-access-grants`, { params: { include_history: includeHistory } }),

  grantCaseCourtAccess: (caseId, payload) =>
    api.post(`/evidence/cases/${caseId}/court-access-grants`, payload),

  assignCaseInvestigator: (caseId, assignedInvestigatorId, pqid = '') =>
    api.patch(`/evidence/cases/${caseId}/assign-investigator`, {
      assigned_investigator_id: assignedInvestigatorId,
      pqid: pqid || undefined,
    }),

  closeCase: (caseId, pqid = '') =>
    api.patch(`/evidence/cases/${caseId}/close`, { pqid: pqid || undefined }),

  reopenCase: (caseId, pqid = '') =>
    api.patch(`/evidence/cases/${caseId}/reopen`, { pqid: pqid || undefined }),

  uploadCaseBookPage: (caseId, formData) =>
    api.post(`/evidence/cases/${caseId}/case-book/pages`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  getCaseBook: (caseId) =>
    api.get(`/evidence/cases/${caseId}/case-book`),

  getCaseBookPageContent: (pageId) =>
    api.get(`/evidence/case-book/pages/${pageId}/content`, {
      responseType: 'blob',
    }),

  upload: (formData) =>
    api.post('/evidence/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  list: () =>
    api.get('/evidence/list'),

  get: (evidenceId) =>
    api.get(`/evidence/${evidenceId}`),

  content: (evidenceId) =>
    api.get(`/evidence/${evidenceId}/content`, { responseType: 'blob' }),

  custodyChain: (evidenceId) =>
    api.get(`/evidence/${evidenceId}/custody-chain`),

  submitToCourt: (evidenceId) =>
    api.post(`/evidence/${evidenceId}/submit-to-court`, {}),
}

export const adminAPI = {
  overview: () =>
    api.get('/admin/overview'),

  pendingEvidence: () =>
    api.get('/admin/evidence/pending'),

  evidenceByStatus: (status = 'pending') =>
    api.get('/admin/evidence/by-status', { params: { status } }),

  approveEvidence: (evidenceId) =>
    api.post(`/admin/evidence/${evidenceId}/approve`, {}),

  denyEvidence: (evidenceId, reason = '') =>
    api.post(`/admin/evidence/${evidenceId}/deny`, { reason }),

  listUsers: () =>
    api.get('/admin/users'),

  getUserPqid: (userId, password) =>
    api.post(`/admin/users/${userId}/pqid`, { password }),

  checkAadhar: (aadharNumber) =>
    api.post('/admin/aadhar-check', { aadhar_number: aadharNumber }),

  updateUser: (userId, data) =>
    api.put(`/admin/users/${userId}`, data),

  deleteUser: (userId) =>
    api.delete(`/admin/users/${userId}`),

  purgeUser: (userId) =>
    api.delete(`/admin/users/${userId}/purge`),

  getAuditLogs: (params) =>
    api.get('/admin/audit-logs', { params }),

  exportLogs: (params) =>
    api.get('/admin/audit-logs/export', { params, responseType: 'blob' }),

  createBackup: () =>
    api.post('/admin/backups', {}),

  listBackups: () =>
    api.get('/admin/backups'),

  downloadBackup: (filename) =>
    api.get(`/admin/backups/download/${filename}`, { responseType: 'blob' }),

  restoreBackup: (filename) =>
    api.post('/admin/backups/restore', filename ? { filename } : {}),

  systemStatus: () =>
    api.get('/admin/system-status'),

  healthHistory: (date, tzOffsetMinutes) =>
    api.get('/admin/health-history', { params: { date, tz_offset_minutes: tzOffsetMinutes } }),

  healthHistoryMinutes: (date, hour, tzOffsetMinutes) =>
    api.get('/admin/health-history/minutes', { params: { date, hour, tz_offset_minutes: tzOffsetMinutes } }),

  caseApprovals: (params = {}) =>
    api.get('/admin/cases/approvals', { params }),

  approveCase: (caseId, notes = '') =>
    api.post(`/admin/cases/${caseId}/approve`, { notes }),

  rejectCase: (caseId, notes = '') =>
    api.post(`/admin/cases/${caseId}/reject`, { notes }),
}

export default api
