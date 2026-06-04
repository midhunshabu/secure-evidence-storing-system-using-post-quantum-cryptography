"""Audit Log Model with hash-chain integrity."""

import hashlib
import json
from datetime import datetime

from sqlalchemy import event, text

from app import db
from app.utils.encrypted_types import EncryptedText

class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    action = db.Column(db.String(255), nullable=False, index=True)
    resource_type = db.Column(db.String(50))  # evidence, user, system, etc.
    resource_id = db.Column(db.String(255))
    
    # Action details
    details = db.Column(EncryptedText())
    status = db.Column(db.String(20))  # success, failure
    error_message = db.Column(EncryptedText())
    
    # Request metadata
    ip_address = db.Column(EncryptedText())
    user_agent = db.Column(EncryptedText())
    
    # Cryptographic integrity
    log_signature = db.Column(db.Text)
    prev_hash = db.Column(db.String(64), index=True)
    current_hash = db.Column(db.String(64), index=True)
    
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    @staticmethod
    def _canonical_payload(log_obj):
        payload = {
            "user_id": log_obj.user_id,
            "action": log_obj.action,
            "resource_type": log_obj.resource_type,
            "resource_id": log_obj.resource_id,
            "details": log_obj.details,
            "status": log_obj.status,
            "error_message": log_obj.error_message,
            "ip_address": log_obj.ip_address,
            "user_agent": log_obj.user_agent,
            "timestamp": log_obj.timestamp.isoformat() if log_obj.timestamp else None,
        }
        return json.dumps(payload, sort_keys=True, separators=(",", ":"))

    @staticmethod
    def compute_chain_hash(prev_hash, payload):
        material = f"{prev_hash}|{payload}"
        return hashlib.sha3_256(material.encode("utf-8")).hexdigest()

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'action': self.action,
            'resource_type': self.resource_type,
            'resource_id': self.resource_id,
            'details': self.details,
            'status': self.status,
            'ip_address': self.ip_address,
            'timestamp': self.timestamp.isoformat(),
            'prev_hash': self.prev_hash,
            'current_hash': self.current_hash,
        }


@event.listens_for(AuditLog, "before_insert")
def _attach_log_chain_hashes(mapper, connection, target):
    """Populate hash-chain fields for every new audit record."""
    if target.timestamp is None:
        target.timestamp = datetime.utcnow()

    previous_hash = connection.execute(
        text("SELECT current_hash FROM audit_logs ORDER BY id DESC LIMIT 1")
    ).scalar()
    previous_hash = previous_hash or "GENESIS"
    payload = AuditLog._canonical_payload(target)

    target.prev_hash = previous_hash
    target.current_hash = AuditLog.compute_chain_hash(previous_hash, payload)
