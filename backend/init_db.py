"""
Initialize the application database schema.

This script intentionally does not create default users. Create the first
administrator through your chosen production provisioning flow.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app, db


def init_db():
    app = create_app(os.getenv("APP_ENV", "development"))

    with app.app_context():
        db.create_all()
        print("Database tables created successfully.")

if __name__ == '__main__':
    init_db()
