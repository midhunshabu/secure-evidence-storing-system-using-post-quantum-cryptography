"""Initialize routes for import"""
from app.routes.auth import auth_bp
from app.routes.evidence import evidence_bp
from app.routes.admin import admin_bp

__all__ = ['auth_bp', 'evidence_bp', 'admin_bp']
