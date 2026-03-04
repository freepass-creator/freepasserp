"""Vercel serverless entrypoint.

Vercel's Python runtime expects a WSGI app exposed as `app`.
We re-export the Flask app from the project root `app.py`.
"""

from app import app  # noqa: F401
