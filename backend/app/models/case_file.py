"""Case file model for structured case metadata."""
from datetime import date, datetime
import uuid

from app import db
from app.utils.encrypted_types import EncryptedText


class CaseFile(db.Model):
    __tablename__ = "case_files"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_number = db.Column(db.String(64), nullable=False, unique=True, index=True)
    quantum_ledger_number = db.Column(db.String(20), nullable=False, unique=True, index=True)
    case_title = db.Column(EncryptedText(), nullable=False)
    complainant_name = db.Column(EncryptedText())
    suspect_name = db.Column(EncryptedText())
    incident_date = db.Column(db.Date)
    incident_state = db.Column(EncryptedText())
    incident_district = db.Column(EncryptedText())
    incident_location = db.Column(EncryptedText())
    case_summary = db.Column(EncryptedText())
    status = db.Column(db.String(20), nullable=False, default="open", index=True)
    assigned_investigator_id = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    approval_status = db.Column(db.String(20), nullable=False, default="approved", index=True)
    approved_by = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    approved_at = db.Column(db.DateTime)
    approval_notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        index=True,
    )

    evidence_items = db.relationship(
        "Evidence",
        backref="case_file",
        lazy="dynamic",
        cascade="all",
        passive_deletes=True,
    )
    case_book_pages = db.relationship(
        "CaseBookPage",
        backref="case_file",
        lazy="dynamic",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    assigned_investigator_user = db.relationship(
        "User",
        foreign_keys=[assigned_investigator_id],
        lazy="joined",
    )
    court_access_grants = db.relationship(
        "CaseAccessGrant",
        back_populates="case_file",
        lazy="dynamic",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    court_access_requests = db.relationship(
        "CaseAccessRequest",
        back_populates="case_file",
        lazy="dynamic",
        passive_deletes=True,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "case_number": self.case_number,
            "quantum_ledger_number": self.quantum_ledger_number,
            "case_title": self.case_title,
            "complainant_name": self.complainant_name,
            "suspect_name": self.suspect_name,
            "incident_date": self.incident_date.isoformat() if isinstance(self.incident_date, date) else None,
            "incident_state": self.incident_state,
            "incident_district": self.incident_district,
            "incident_location": self.incident_location,
            "case_summary": self.case_summary,
            "status": self.status,
            "assigned_investigator_id": self.assigned_investigator_id,
            "assigned_investigator_username": (
                self.assigned_investigator_user.username if self.assigned_investigator_user else None
            ),
            "approval_status": self.approval_status or "approved",
            "approved_by": self.approved_by,
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
            "approval_notes": self.approval_notes,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
