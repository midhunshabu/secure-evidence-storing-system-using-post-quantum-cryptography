"""User Model"""
from app import db
from datetime import datetime
import bcrypt
from app.security.key_vault import get_user_key, load_user_keys, save_user_keys
from app.utils.encrypted_types import EncryptedText

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(120), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), nullable=False)  # admin, investigator, court_user
    
    # Enhanced Identity Verification
    address = db.Column(db.Text)
    phone_number = db.Column(db.String(20))
    pqid = db.Column(db.String(50), unique=True, index=True)
    pqid_failed_attempts = db.Column(db.Integer, default=0)
    pqid_locked_until = db.Column(db.DateTime)
    is_physically_verified = db.Column(db.Boolean, default=False)
    
    # Role-specific fields
    aadhar_number = db.Column(EncryptedText())
    aadhar_hash = db.Column(db.String(64), unique=True, index=True)
    designation = db.Column(db.String(100))        # Court users
    court_details = db.Column(db.Text)             # Court users
    station_name = db.Column(db.String(100))       # Investigators
    # address field is already present and used for all roles

    
    # Legacy PQC key fields (kept for backward compatibility)
    pqc_public_key = db.Column(db.Text)
    pqc_secret_key = db.Column(db.Text)

    # Dedicated PQC keypairs
    pqc_kem_public_key = db.Column(db.Text)
    pqc_kem_secret_key = db.Column(db.Text)
    pqc_sig_public_key = db.Column(db.Text)
    pqc_sig_secret_key = db.Column(db.Text)
    client_auth_sig_public_key = db.Column(db.Text)
    pqc_kem_algorithm = db.Column(db.String(64))
    pqc_sig_algorithm = db.Column(db.String(64))
    
    # MFA challenge
    current_challenge = db.Column(db.Text)
    current_challenge_expires_at = db.Column(db.DateTime)

    # WebAuthn (passkey) enforcement for newly created users
    webauthn_required = db.Column(db.Boolean, default=False)
    webauthn_user_handle = db.Column(db.String(128), unique=True, index=True)
    webauthn_enrolled_at = db.Column(db.DateTime)
    
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    
    # Relationships
    audit_logs = db.relationship('AuditLog', backref='user', lazy='dynamic')
    case_files = db.relationship('CaseFile', backref='creator', lazy='dynamic', foreign_keys='CaseFile.created_by')
    evidence = db.relationship('Evidence', backref='uploaded_by_user', lazy='dynamic', foreign_keys='Evidence.uploaded_by')
    webauthn_credentials = db.relationship('WebAuthnCredential', backref='user', lazy='dynamic')
    
    def set_password(self, password):
        """Hash and set password"""
        salt = bcrypt.gensalt(rounds=12)
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    def check_password(self, password):
        """Verify password against hash"""
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'kem_public_key': self.get_kem_public_key(),
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat(),
            'last_login': self.last_login.isoformat() if self.last_login else None,
        }

    def get_kem_public_key(self):
        return self.pqc_kem_public_key or self.pqc_public_key

    def get_kem_secret_key(self):
        if self.id:
            secret = get_user_key(self.id, "pqc_kem_secret_key")
            if secret:
                return secret
            legacy = get_user_key(self.id, "pqc_secret_key")
            if legacy:
                return legacy
        return self.pqc_kem_secret_key or self.pqc_secret_key

    def get_sig_public_key(self):
        return self.pqc_sig_public_key or self.pqc_public_key

    def get_sig_secret_key(self):
        if self.id:
            secret = get_user_key(self.id, "pqc_sig_secret_key")
            if secret:
                return secret
            legacy = get_user_key(self.id, "pqc_secret_key")
            if legacy:
                return legacy
        return self.pqc_sig_secret_key or self.pqc_secret_key

    def get_auth_sig_public_key(self):
        return self.client_auth_sig_public_key or self.get_sig_public_key()

    def set_private_keys(self, kem_secret_key=None, sig_secret_key=None, legacy_secret_key=None):
        """Store private keys in encrypted key vault and clear DB secret fields."""
        if not self.id:
            raise ValueError("User ID required before storing private keys in key vault")

        bundle = load_user_keys(self.id)
        if kem_secret_key:
            bundle["pqc_kem_secret_key"] = kem_secret_key
        if sig_secret_key:
            bundle["pqc_sig_secret_key"] = sig_secret_key
        if legacy_secret_key:
            bundle["pqc_secret_key"] = legacy_secret_key

        save_user_keys(self.id, bundle)

        # Ensure database rows do not carry private key material.
        self.pqc_kem_secret_key = None
        self.pqc_sig_secret_key = None
        self.pqc_secret_key = None
