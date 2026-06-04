"""Case-level court access request and grant models."""

from datetime import datetime

from app import db


class CaseAccessRequest(db.Model):
    __tablename__ = "case_access_requests"

    id = db.Column(db.Integer, primary_key=True)
    requested_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    case_file_id = db.Column(
        db.String(36),
        db.ForeignKey("case_files.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    requested_case_number = db.Column(db.String(64), index=True)
    requested_quantum_ledger_number = db.Column(db.String(20), index=True)
    requested_duration_minutes = db.Column(db.Integer, nullable=False, default=60)
    reason = db.Column(db.Text)
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)  # pending, approved, denied
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    decided_at = db.Column(db.DateTime, nullable=True, index=True)
    decided_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    decision_notes = db.Column(db.Text)
    granted_expires_at = db.Column(db.DateTime, nullable=True, index=True)

    requester = db.relationship("User", foreign_keys=[requested_by], lazy="joined")
    decider = db.relationship("User", foreign_keys=[decided_by], lazy="joined")
    case_file = db.relationship(
        "CaseFile",
        foreign_keys=[case_file_id],
        lazy="joined",
        back_populates="court_access_requests",
    )
    grants = db.relationship("CaseAccessGrant", backref="source_request", lazy="dynamic")

    def to_dict(self):
        return {
            "id": self.id,
            "requested_by": self.requested_by,
            "requested_by_username": self.requester.username if self.requester else None,
            "case_file_id": self.case_file_id,
            "case_number": (
                self.case_file.case_number
                if self.case_file
                else self.requested_case_number
            ),
            "quantum_ledger_number": (
                self.case_file.quantum_ledger_number
                if self.case_file
                else self.requested_quantum_ledger_number
            ),
            "requested_case_number": self.requested_case_number,
            "requested_quantum_ledger_number": self.requested_quantum_ledger_number,
            "requested_duration_minutes": self.requested_duration_minutes,
            "reason": self.reason,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "decided_at": self.decided_at.isoformat() if self.decided_at else None,
            "decided_by": self.decided_by,
            "decided_by_username": self.decider.username if self.decider else None,
            "decision_notes": self.decision_notes,
            "granted_expires_at": (
                self.granted_expires_at.isoformat() if self.granted_expires_at else None
            ),
        }


class CaseAccessGrant(db.Model):
    __tablename__ = "case_access_grants"

    id = db.Column(db.Integer, primary_key=True)
    case_file_id = db.Column(
        db.String(36),
        db.ForeignKey("case_files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    court_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    granted_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    granted_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    revoked_at = db.Column(db.DateTime, nullable=True, index=True)
    revoked_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    revoke_reason = db.Column(db.Text)
    source_request_id = db.Column(
        db.Integer,
        db.ForeignKey("case_access_requests.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    notes = db.Column(db.Text)

    case_file = db.relationship(
        "CaseFile",
        foreign_keys=[case_file_id],
        lazy="joined",
        back_populates="court_access_grants",
    )
    court_user = db.relationship("User", foreign_keys=[court_user_id], lazy="joined")
    granter = db.relationship("User", foreign_keys=[granted_by], lazy="joined")
    revoker = db.relationship("User", foreign_keys=[revoked_by], lazy="joined")

    @property
    def is_active(self):
        return (
            self.revoked_at is None
            and self.expires_at is not None
            and self.expires_at > datetime.utcnow()
        )

    def to_dict(self):
        now = datetime.utcnow()
        remaining_seconds = 0
        if self.expires_at:
            remaining_seconds = int((self.expires_at - now).total_seconds())

        return {
            "id": self.id,
            "case_file_id": self.case_file_id,
            "case_number": self.case_file.case_number if self.case_file else None,
            "quantum_ledger_number": (
                self.case_file.quantum_ledger_number if self.case_file else None
            ),
            "court_user_id": self.court_user_id,
            "court_user_username": self.court_user.username if self.court_user else None,
            "granted_by": self.granted_by,
            "granted_by_username": self.granter.username if self.granter else None,
            "granted_at": self.granted_at.isoformat() if self.granted_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
            "revoked_by": self.revoked_by,
            "revoked_by_username": self.revoker.username if self.revoker else None,
            "revoke_reason": self.revoke_reason,
            "source_request_id": self.source_request_id,
            "notes": self.notes,
            "is_active": self.is_active,
            "remaining_seconds": max(0, remaining_seconds),
        }
