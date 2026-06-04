"""WebAuthn credential model."""
from datetime import datetime

from app import db


class WebAuthnCredential(db.Model):
    __tablename__ = "webauthn_credentials"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    credential_id = db.Column(db.Text, unique=True, nullable=False, index=True)
    public_key = db.Column(db.Text, nullable=False)
    sign_count = db.Column(db.Integer, default=0)
    transports = db.Column(db.Text)
    device_type = db.Column(db.String(40))
    backed_up = db.Column(db.Boolean, default=False)
    fmt = db.Column(db.String(40))
    aaguid = db.Column(db.String(36))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_used_at = db.Column(db.DateTime)
    is_active = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "credential_id": self.credential_id,
            "sign_count": self.sign_count,
            "device_type": self.device_type,
            "backed_up": self.backed_up,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "is_active": self.is_active,
        }
