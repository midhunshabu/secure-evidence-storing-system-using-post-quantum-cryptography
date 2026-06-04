"""Refresh token session model for rotation/revocation."""

from datetime import datetime

from app import db


class RefreshToken(db.Model):
    __tablename__ = "refresh_tokens"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    jti_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    last_used_at = db.Column(db.DateTime)
    revoked_at = db.Column(db.DateTime)
    replaced_by_hash = db.Column(db.String(64), index=True)
    created_ip = db.Column(db.String(45))
    user_agent = db.Column(db.String(255))

    @property
    def is_revoked(self):
        return self.revoked_at is not None
