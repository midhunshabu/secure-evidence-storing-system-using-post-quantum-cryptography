"""
Utility functions for PQC Evidence Management System
"""

import hashlib
import os
import json
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify

# ============= FILE UTILITIES =============

def calculate_file_hash(filepath, algorithm='sha256'):
    """Calculate hash of a file"""
    hasher = hashlib.new(algorithm)
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            hasher.update(chunk)
    return hasher.hexdigest()


def get_file_size(filepath):
    """Get file size in bytes"""
    return os.path.getsize(filepath)


def get_file_type(filename):
    """Extract file type from filename"""
    if '.' in filename:
        return filename.rsplit('.', 1)[1].lower()
    return 'unknown'


# ============= VALIDATION UTILITIES =============

def validate_email(email):
    """Validate email format"""
    import re
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def validate_password_strength(password):
    """Validate password meets minimum requirements"""
    requirements = {
        'length': len(password) >= 12,
        'uppercase': any(c.isupper() for c in password),
        'lowercase': any(c.islower() for c in password),
        'digit': any(c.isdigit() for c in password),
        'special': any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?' for c in password)
    }
    return all(requirements.values()), requirements


def validate_case_id(case_id):
    """Validate case ID format"""
    # Example format: CASE-2026-001
    import re
    pattern = r'^[A-Z]+-\d{4}-\d{3,}$'
    return re.match(pattern, case_id) is not None


# ============= DECORATORS =============

def require_role(*roles):
    """Decorator to require specific roles"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            from flask_jwt_extended import get_jwt
            claims = get_jwt()
            if claims['role'] not in roles:
                return jsonify({'error': 'Insufficient permissions'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def log_action(action_name):
    """Decorator to log API actions"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            from app.models.audit_log import AuditLog
            from app import db
            from flask_jwt_extended import get_jwt_identity
            
            result = f(*args, **kwargs)
            
            try:
                user_id = get_jwt_identity()
                log = AuditLog(
                    user_id=user_id,
                    action=action_name,
                    ip_address=request.remote_addr,
                    user_agent=request.headers.get('User-Agent', '')
                )
                db.session.add(log)
                db.session.commit()
            except:
                pass  # Don't fail if logging fails
            
            return result
        return decorated_function
    return decorator


# ============= DATA FORMATTING =============

def format_file_size(bytes_size):
    """Format bytes to human readable format"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.2f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.2f} PB"


def format_timestamp(dt):
    """Format datetime to ISO format"""
    if isinstance(dt, str):
        return dt
    return dt.isoformat() if dt else None


def format_evidence_data(evidence):
    """Format evidence data for API response"""
    return {
        'id': evidence.id,
        'case_id': evidence.case_id,
        'filename': evidence.filename,
        'file_hash': evidence.file_hash,
        'file_size': format_file_size(evidence.file_size),
        'file_size_bytes': evidence.file_size,
        'description': evidence.description,
        'evidence_type': evidence.evidence_type,
        'access_level': evidence.access_level,
        'uploaded_at': format_timestamp(evidence.uploaded_at),
        'is_deleted': evidence.is_deleted
    }


# ============= CRYPTOGRAPHIC UTILITIES =============

def generate_random_token(length=32):
    """Generate random token"""
    import secrets
    return secrets.token_urlsafe(length)


def generate_case_number():
    """Generate unique case number"""
    import uuid
    return f"CASE-{datetime.now().year}-{uuid.uuid4().hex[:6].upper()}"


# ============= DATABASE UTILITIES =============

def paginate_query(query, page=1, per_page=20):
    """Paginate database query"""
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    
    return {
        'items': items,
        'total': total,
        'page': page,
        'per_page': per_page,
        'pages': (total + per_page - 1) // per_page
    }


def export_to_json(data, filename=None):
    """Export data to JSON"""
    if filename is None:
        filename = f"export_{datetime.now().isoformat()}.json"
    
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2, default=str)
    
    return filename


def verify_database_integrity(db):
    """Verify database integrity"""
    from app.models.evidence import Evidence
    from app.modules.pqc_engine import pqc_engine
    
    issues = []
    
    # Check evidence integrity
    evidence_list = Evidence.query.all()
    for evidence in evidence_list:
        # Verify file exists
        if not os.path.exists(evidence.encrypted_data_path):
            issues.append(f"Missing file: {evidence.id}")
        
        # Verify signature
        try:
            with open(evidence.encrypted_data_path, 'r') as f:
                encrypted_data = json.load(f)

            ciphertext_hash = hashlib.sha256(
                encrypted_data['ciphertext'].encode('utf-8')
            ).hexdigest()
            signature_payload = json.dumps({
                'file_hash': evidence.file_hash,
                'ciphertext_hash': ciphertext_hash,
                'case_id': evidence.case_id,
                'filename': evidence.filename,
                'file_size': evidence.file_size
            }, sort_keys=True, separators=(',', ':'))

            uploaded_user = evidence.uploaded_by_user
            sig_key = evidence.signature_public_key or (uploaded_user.get_sig_public_key() if uploaded_user else None)
            sig_algorithm = (
                evidence.signature_algorithm
                or (uploaded_user.pqc_sig_algorithm if uploaded_user else None)
                or pqc_engine.sig_algorithm
            )
            if not sig_key:
                issues.append(f"Missing signature key: {evidence.id}")
                continue

            is_valid = pqc_engine.verify(
                signature_payload,
                evidence.signature,
                sig_key,
                sig_algorithm=sig_algorithm,
            )
            if not is_valid:
                issues.append(f"Invalid signature: {evidence.id}")
        except Exception as e:
            issues.append(f"Signature verification failed for {evidence.id}: {str(e)}")
    
    return {
        'status': 'healthy' if not issues else 'issues_found',
        'issues': issues,
        'total_evidence': len(evidence_list),
        'check_timestamp': datetime.utcnow().isoformat()
    }


# ============= BACKUP & RECOVERY UTILITIES =============

def backup_database(db, backup_dir=None):
    """Backup database"""
    if backup_dir is None:
        backup_dir = 'backups'
    
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_file = os.path.join(backup_dir, f'pqc_evidence_{timestamp}.db')
    
    import shutil
    shutil.copy('pqc_evidence.db', backup_file)
    
    return backup_file


def cleanup_old_backups(backup_dir='backups', keep_days=30):
    """Clean up old backup files"""
    import time
    cutoff_time = time.time() - (keep_days * 86400)
    
    removed = []
    for filename in os.listdir(backup_dir):
        filepath = os.path.join(backup_dir, filename)
        if os.path.isfile(filepath):
            if os.stat(filepath).st_mtime < cutoff_time:
                os.remove(filepath)
                removed.append(filename)
    
    return removed


# ============= REPORTING UTILITIES =============

def generate_statistics_report(db):
    """Generate system statistics"""
    from app.models.user import User
    from app.models.evidence import Evidence
    from app.models.audit_log import AuditLog
    
    return {
        'timestamp': datetime.utcnow().isoformat(),
        'users': {
            'total': User.query.count(),
            'active': User.query.filter_by(is_active=True).count(),
            'by_role': {
                'admin': User.query.filter_by(role='admin').count(),
                'investigator': User.query.filter_by(role='investigator').count(),
                'court_user': User.query.filter_by(role='court_user').count()
            }
        },
        'evidence': {
            'total': Evidence.query.count(),
            'active': Evidence.query.filter_by(is_deleted=False).count(),
            'deleted': Evidence.query.filter_by(is_deleted=True).count(),
            'by_type': {}
        },
        'audit': {
            'total_logs': AuditLog.query.count(),
            'recent_24h': AuditLog.query.filter(
                AuditLog.timestamp >= (datetime.utcnow() - timedelta(days=1))
            ).count()
        }
    }


def generate_audit_report(start_date=None, end_date=None, user_id=None):
    """Generate detailed audit report"""
    from app.models.audit_log import AuditLog
    from datetime import timedelta
    
    query = AuditLog.query
    
    if start_date:
        query = query.filter(AuditLog.timestamp >= start_date)
    if end_date:
        query = query.filter(AuditLog.timestamp <= end_date)
    if user_id:
        query = query.filter_by(user_id=user_id)
    
    logs = query.order_by(AuditLog.timestamp.desc()).all()
    
    return {
        'report_date': datetime.utcnow().isoformat(),
        'filters': {
            'start_date': start_date,
            'end_date': end_date,
            'user_id': user_id
        },
        'total_records': len(logs),
        'logs': [log.to_dict() for log in logs]
    }


# ============= SYSTEM HEALTH CHECK =============

def system_health_check():
    """Perform system health check"""
    checks = {}
    
    # Database connectivity
    try:
        from app import db
        db.session.execute('SELECT 1')
        checks['database'] = 'healthy'
    except Exception as e:
        checks['database'] = f'error: {str(e)}'
    
    # Storage directory
    try:
        storage_dir = 'storage/evidence'
        os.makedirs(storage_dir, exist_ok=True)
        test_file = os.path.join(storage_dir, '.health_check')
        with open(test_file, 'w') as f:
            f.write('test')
        os.remove(test_file)
        checks['storage'] = 'healthy'
    except Exception as e:
        checks['storage'] = f'error: {str(e)}'
    
    # PQC engine
    try:
        from app.modules.pqc_engine import pqc_engine
        keypair = pqc_engine.generate_keypair('kex')
        checks['pqc_engine'] = 'healthy'
    except Exception as e:
        checks['pqc_engine'] = f'error: {str(e)}'
    
    # Overall status
    overall_status = 'healthy' if all(v == 'healthy' for v in checks.values()) else 'warning'
    
    return {
        'timestamp': datetime.utcnow().isoformat(),
        'status': overall_status,
        'checks': checks,
        'warnings': [k for k, v in checks.items() if v != 'healthy']
    }


if __name__ == '__main__':
    # Test utilities
    print("✓ Email validation:", validate_email('test@example.com'))
    print("✓ Password strength:", validate_password_strength('SecurePass123!'))
    print("✓ File size formatting:", format_file_size(1048576))
    print("✓ Case ID validation:", validate_case_id('CASE-2026-001'))
