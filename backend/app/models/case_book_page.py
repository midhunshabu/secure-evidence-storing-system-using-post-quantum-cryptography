"""Case book page model for append-only case history viewing."""
from datetime import datetime
import uuid

from app import db
from app.utils.encrypted_types import EncryptedText


class CaseBookPage(db.Model):
    __tablename__ = "case_book_pages"
    __table_args__ = (
        db.UniqueConstraint("case_file_id", "page_number", name="uq_case_book_pages_case_page"),
    )

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_file_id = db.Column(
        db.String(36),
        db.ForeignKey("case_files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_number = db.Column(db.Integer, nullable=False, index=True)
    filename = db.Column(EncryptedText(), nullable=False)
    summary = db.Column(EncryptedText())
    mime_type = db.Column(db.String(80), nullable=False)
    file_hash = db.Column(db.String(64), nullable=False, index=True)
    file_size = db.Column(db.Integer, nullable=False)
    stored_path = db.Column(db.String(255), nullable=False)
    uploaded_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    uploader = db.relationship("User", foreign_keys=[uploaded_by], lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "case_file_id": self.case_file_id,
            "page_number": self.page_number,
            "filename": self.filename,
            "summary": self.summary,
            "mime_type": self.mime_type,
            "file_hash": self.file_hash,
            "file_size": self.file_size,
            "uploaded_by": self.uploaded_by,
            "uploaded_by_username": self.uploader.username if self.uploader else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
