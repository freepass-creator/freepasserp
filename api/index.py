"""Vercel serverless entrypoint.

Vercel runs Python as a serverless function. Export the Flask `app` object.
"""

from app import app  # noqa: F401
