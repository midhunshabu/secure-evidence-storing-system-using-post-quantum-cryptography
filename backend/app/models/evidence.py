"""Evidence Model"""
from app import db
from datetime import datetime
import uuid
from app.utils.encrypted_types import EncryptedText

class Evidence(db.Model):
    __tablename__ = 'evidence'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id = db.Column(EncryptedText(), nullable=False, index=True)
    filename = db.Column(EncryptedText(), nullable=False)
    file_hash = db.Column(db.String(64), nullable=False, index=True)  # SHA-256
    file_size = db.Column(db.Integer, nullable=False)
    
    # Encryption metadata
    encrypted_data_path = db.Column(db.String(255), nullable=False)
    encryption_key = db.Column(db.Text, nullable=False)  # KEM ciphertext (not raw AES key)
    encryption_iv = db.Column(db.Text, nullable=False)
    encryption_tag = db.Column(db.Text, nullable=False)
    
    # Digital signature for verification
    signature = db.Column(db.Text, nullable=False)
    signature_public_key = db.Column(db.Text)
    signature_algorithm = db.Column(db.String(64))
    
    # Metadata
    description = db.Column(EncryptedText())
    evidence_type = db.Column(EncryptedText())  # image, video, document, etc.
    
    # Chain of custody
    uploaded_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    case_file_id = db.Column(
        db.String(36),
        db.ForeignKey('case_files.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    custody_chain = db.relationship('CustodyRecord', backref='evidence', lazy='dynamic', cascade='all, delete-orphan')
    
    # Access control
    access_level = db.Column(db.String(50), default='restricted')  # restricted, investigator, court
    authorized_users = db.Column(db.Text)  # JSON list of user IDs

    # Admin approval workflow
    approval_status = db.Column(db.String(20), default='approved', index=True)  # pending, approved, rejected
    approved_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)
    approval_signature = db.Column(db.Text, nullable=True)
    
    is_deleted = db.Column(db.Boolean, default=False)
    deleted_at = db.Column(db.DateTime)
    
    def to_dict(self, include_sensitive=False):
        data = {
            'id': self.id,
            'case_id': self.case_id,
            'case_file_id': self.case_file_id,
            'filename': self.filename,
            'file_hash': self.file_hash,
            'file_size': self.file_size,
            'description': self.description,
            'evidence_type': self.evidence_type,
            'access_level': self.access_level,
            'approval_status': self.approval_status or 'approved',
            'approved_by': self.approved_by,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'uploaded_at': self.uploaded_at.isoformat(),
            'is_deleted': self.is_deleted
        }
        
        if include_sensitive:
            data.update({
                'encryption_key': self.encryption_key,
                'encryption_iv': self.encryption_iv,
                'encryption_tag': self.encryption_tag,
                'signature': self.signature,
                'approval_signature': self.approval_signature
            })
        
        return data


class CustodyRecord(db.Model):
    __tablename__ = 'custody_records'
    
    id = db.Column(db.Integer, primary_key=True)
    evidence_id = db.Column(db.String(36), db.ForeignKey('evidence.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    action = db.Column(db.String(50), nullable=False)  # upload, view, download, transfer
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    notes = db.Column(db.Text)
    ip_address = db.Column(db.String(45))
    
    # Cryptographic verification
    signature = db.Column(db.Text)
    
    def to_dict(self):
        return {
            'id': self.id,
            'action': self.action,
            'timestamp': self.timestamp.isoformat(),
            'user_id': self.user_id,
            'notes': self.notes,
            'ip_address': self.ip_address,
            'signature_present': bool(self.signature),
        }
