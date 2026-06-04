// API Configuration
const API_BASE = 'http://localhost:5000/api';
let currentUser = null;
let currentToken = null;

// Initialize app
document.addEventListener('DOMContentLoaded', init);

function init() {
    checkAuthStatus();
    document.getElementById('logoutBtn').addEventListener('click', logout);
}

// ============= AUTH FUNCTIONS =============

function loginStep1() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (!username || !password) {
        showAlert('Please enter username and password', 'warning');
        return;
    }

    // First, get the challenge
    fetch(`${API_BASE}/auth/login-challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            showAlert(data.error, 'danger');
            return;
        }
        
        // Now do the verification with password and challenge
        // In a real app, we'd compute the challenge response here
        loginStep2(username, password);
    })
    .catch(e => showAlert('Error: ' + e.message, 'danger'));
}

function loginStep2(username, password) {
    // Create a mock challenge response (in production, use actual PQC signing)
    const challengeResponse = btoa(username + ':' + password);

    fetch(`${API_BASE}/auth/login-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            password,
            challenge_response: challengeResponse
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            showAlert(data.error, 'danger');
            return;
        }
        
        currentUser = data.user;
        currentToken = data.access_token;
        localStorage.setItem('token', currentToken);
        localStorage.setItem('user', JSON.stringify(currentUser));
        
        showAlert('Login successful!', 'success');
        showMainContent();
        loadDashboard();
    })
    .catch(e => showAlert('Error: ' + e.message, 'danger'));
}

function register() {
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    if (!username || !email || !password) {
        showAlert('Please fill in all fields', 'warning');
        return;
    }

    fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            email,
            password,
            role: 'investigator'
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            showAlert(data.error, 'danger');
            return;
        }
        
        showAlert('Registration successful! You can now login.', 'success');
        document.getElementById('registerForm').reset();
    })
    .catch(e => showAlert('Error: ' + e.message, 'danger'));
}

function logout() {
    fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${currentToken}`,
            'Content-Type': 'application/json'
        }
    })
    .then(() => {
        currentUser = null;
        currentToken = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        location.reload();
    });
}

function checkAuthStatus() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
        currentToken = token;
        currentUser = JSON.parse(user);
        showMainContent();
        loadDashboard();
    }
}

// ============= UI FUNCTIONS =============

function showMainContent() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('userInfo').textContent = `${currentUser.username} (${currentUser.role})`;
    
    // Show role-specific menus
    if (currentUser.role === 'investigator') {
        document.getElementById('investigatorMenu').style.display = 'block';
        document.getElementById('investigatorMenu2').style.display = 'block';
    } else if (currentUser.role === 'admin') {
        document.getElementById('adminMenu').style.display = 'block';
    } else if (currentUser.role === 'court_user') {
        document.getElementById('courtMenu').style.display = 'block';
    }
    
    showDashboard();
}

function hideAll() {
    document.getElementById('dashboardContainer').style.display = 'none';
    document.getElementById('uploadEvidenceContainer').style.display = 'none';
    document.getElementById('evidenceListContainer').style.display = 'none';
    document.getElementById('adminContainer').style.display = 'none';
    document.getElementById('auditLogsContainer').style.display = 'none';
}

function showDashboard() {
    hideAll();
    document.getElementById('dashboardContainer').style.display = 'block';
    loadDashboard();
}

function showUploadEvidence() {
    hideAll();
    document.getElementById('uploadEvidenceContainer').style.display = 'block';
}

function showMyEvidence() {
    hideAll();
    document.getElementById('evidenceListContainer').style.display = 'block';
    loadEvidenceList();
}

function showAdminPanel() {
    hideAll();
    document.getElementById('adminContainer').style.display = 'block';
    showUserManagement();
}

function showCourtEvidence() {
    hideAll();
    document.getElementById('evidenceListContainer').style.display = 'block';
    loadEvidenceList();
}

function showAuditLogs() {
    hideAll();
    document.getElementById('auditLogsContainer').style.display = 'block';
    loadAuditLogs();
}

// ============= DATA LOADING FUNCTIONS =============

function loadDashboard() {
    fetch(`${API_BASE}/evidence/list`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    })
    .then(r => r.json())
    .then(data => {
        document.getElementById('totalEvidence').textContent = data.count || 0;
    })
    .catch(e => console.error(e));
    
    fetch(`${API_BASE}/admin/audit-logs?limit=100`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    })
    .then(r => r.json())
    .then(data => {
        document.getElementById('auditEvents').textContent = data.count || 0;
    })
    .catch(e => console.error(e));
}

function loadEvidenceList() {
    fetch(`${API_BASE}/evidence/list`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    })
    .then(r => r.json())
    .then(data => {
        const tbody = document.getElementById('evidenceBody');
        tbody.innerHTML = '';
        
        data.evidence.forEach(e => {
            const row = `
                <tr>
                    <td>${e.filename}</td>
                    <td>${e.case_id}</td>
                    <td><code>${e.file_hash.substring(0, 16)}...</code></td>
                    <td>${new Date(e.uploaded_at).toLocaleDateString()}</td>
                    <td>
                        <button class="btn btn-sm btn-info" onclick="viewEvidence('${e.id}')">View</button>
                        <button class="btn btn-sm btn-secondary" onclick="viewCustodyChain('${e.id}')">Chain</button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    })
    .catch(e => showAlert('Error loading evidence: ' + e.message, 'danger'));
}

function loadAuditLogs() {
    fetch(`${API_BASE}/admin/audit-logs?limit=500`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    })
    .then(r => r.json())
    .then(data => {
        const tbody = document.getElementById('auditBody');
        tbody.innerHTML = '';
        
        data.logs.forEach(log => {
            const row = `
                <tr>
                    <td>${new Date(log.timestamp).toLocaleString()}</td>
                    <td>${log.user_id || 'System'}</td>
                    <td><span class="badge bg-info">${log.action}</span></td>
                    <td>${log.resource_type}</td>
                    <td><span class="badge ${log.status === 'success' ? 'bg-success' : 'bg-danger'}">${log.status}</span></td>
                    <td>${log.ip_address}</td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    })
    .catch(e => showAlert('Error loading logs: ' + e.message, 'danger'));
}

function showUserManagement() {
    document.getElementById('userManagementContainer').style.display = 'block';
    document.getElementById('systemStatusContainer').style.display = 'none';
    
    fetch(`${API_BASE}/admin/users`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    })
    .then(r => r.json())
    .then(data => {
        const tbody = document.getElementById('usersBody');
        tbody.innerHTML = '';
        
        data.users.forEach(u => {
            const row = `
                <tr>
                    <td>${u.username}</td>
                    <td>${u.email}</td>
                    <td><span class="badge bg-primary">${u.role}</span></td>
                    <td><span class="status-badge ${u.is_active ? 'status-active' : 'status-inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                        <button class="btn btn-sm btn-warning" onclick="editUser(${u.id})">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="deactivateUser(${u.id})">Deactivate</button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    })
    .catch(e => showAlert('Error loading users: ' + e.message, 'danger'));
}

function showSystemStatus() {
    document.getElementById('userManagementContainer').style.display = 'none';
    document.getElementById('systemStatusContainer').style.display = 'block';
    
    fetch(`${API_BASE}/admin/system-status`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    })
    .then(r => r.json())
    .then(data => {
        const container = document.getElementById('systemStatus');
        container.innerHTML = `
            <div class="card-body">
                <h5 class="card-title">${data.system}</h5>
                <p><strong>Status:</strong> <span class="badge bg-success">Operational</span></p>
                <p><strong>Total Users:</strong> ${data.statistics.total_users}</p>
                <p><strong>Active Users:</strong> ${data.statistics.active_users}</p>
                <p><strong>Audit Logs:</strong> ${data.statistics.total_audit_logs}</p>
                <div class="encryption-info">
                    <strong>🔒 Post-Quantum Cryptography Enabled</strong><br>
                    This system uses lattice-based key encapsulation (Kyber) and quantum-resistant signatures (Dilithium) to protect evidence.
                </div>
            </div>
        `;
    })
    .catch(e => showAlert('Error loading status: ' + e.message, 'danger'));
}

// ============= EVIDENCE FUNCTIONS =============

function uploadEvidence() {
    const caseId = document.getElementById('caseId').value;
    const file = document.getElementById('evidenceFile').files[0];
    const description = document.getElementById('description').value;

    if (!caseId || !file) {
        showAlert('Please fill in required fields', 'warning');
        return;
    }

    const formData = new FormData();
    formData.append('case_id', caseId);
    formData.append('file', file);
    formData.append('description', description);

    document.getElementById('uploadStatus').innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Uploading...</span></div>';

    fetch(`${API_BASE}/evidence/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentToken}` },
        body: formData
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            showAlert(data.error, 'danger');
            document.getElementById('uploadStatus').innerHTML = '';
            return;
        }
        
        showAlert('Evidence uploaded and encrypted successfully!', 'success');
        document.getElementById('uploadForm').reset();
        document.getElementById('uploadStatus').innerHTML = `
            <div class="alert alert-success">
                <strong>Upload Complete</strong><br>
                Evidence ID: ${data.evidence.id}<br>
                Hash: ${data.evidence.file_hash}
            </div>
        `;
    })
    .catch(e => {
        showAlert('Error: ' + e.message, 'danger');
        document.getElementById('uploadStatus').innerHTML = '';
    });
}

function viewEvidence(evidenceId) {
    fetch(`${API_BASE}/evidence/${evidenceId}`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            showAlert(data.error, 'danger');
            return;
        }
        
        const evidence = data.evidence;
        showAlert(`Evidence: ${evidence.filename}\\nSize: ${evidence.file_size} bytes\\nHash: ${evidence.file_hash.substring(0, 32)}...`, 'info');
    })
    .catch(e => showAlert('Error: ' + e.message, 'danger'));
}

function viewCustodyChain(evidenceId) {
    fetch(`${API_BASE}/evidence/${evidenceId}/custody-chain`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    })
    .then(r => r.json())
    .then(data => {
        let chain = 'Custody Chain:\\n\\n';
        data.custody_chain.forEach((record, idx) => {
            chain += `${idx + 1}. ${record.action.toUpperCase()} - ${new Date(record.timestamp).toLocaleString()}\\n`;
        });
        showAlert(chain, 'info');
    })
    .catch(e => showAlert('Error: ' + e.message, 'danger'));
}

function deactivateUser(userId) {
    if (!confirm('Are you sure? This action cannot be undone.')) return;
    
    fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${currentToken}` }
    })
    .then(r => r.json())
    .then(data => {
        showAlert('User deactivated successfully', 'success');
        showUserManagement();
    })
    .catch(e => showAlert('Error: ' + e.message, 'danger'));
}

// ============= UTILITY FUNCTIONS =============

function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.setAttribute('role', 'alert');
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    const container = document.getElementById('alertContainer');
    container.appendChild(alertDiv);
    
    setTimeout(() => alertDiv.remove(), 5000);
}
