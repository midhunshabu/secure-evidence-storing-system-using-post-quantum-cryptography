"""System heartbeat model for uptime tracking."""

from datetime import datetime

from app import db


class SystemHeartbeat(db.Model):
    __tablename__ = "system_heartbeats"

    id = db.Column(db.Integer, primary_key=True)
    beat_minute = db.Column(db.DateTime, nullable=False, unique=True, index=True)
    load_pct = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, index=True)
