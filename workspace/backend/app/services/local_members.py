"""A person who joined one local project from another computer.

The invite link carries a one-time code, never the project token. Accepting it
with a display name stores a member credential here. That credential is the
only thing the other computer sends, and it grants the invited role in this
one project.

SQLite only. The hosted database keeps using signed-in accounts.
"""

import os
import secrets
import socket
from urllib.parse import urlencode

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import User


def _sqlite(db: Session) -> bool:
    bind = db.get_bind()
    return bind is not None and bind.dialect.name == "sqlite"


def ensure(db: Session) -> None:
    if not _sqlite(db):
        return
    db.execute(text(
        """
        CREATE TABLE IF NOT EXISTS local_member_credentials (
            token TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            display_name TEXT NOT NULL
        )
        """
    ))
    db.flush()


def clean_display_name(raw: str | None) -> str | None:
    name = (raw or "").strip()
    if not name or len(name) > 80 or any(ord(ch) < 32 for ch in name):
        return None
    return name


def issue(db: Session, workspace_id: str, user_id: str, role: str, display_name: str) -> str:
    ensure(db)
    token = secrets.token_urlsafe(32)
    db.execute(
        text(
            """
            INSERT INTO local_member_credentials
                (token, workspace_id, user_id, role, display_name)
            VALUES
                (:token, :workspace_id, :user_id, :role, :display_name)
            """
        ),
        {
            "token": token,
            "workspace_id": workspace_id,
            "user_id": user_id,
            "role": role,
            "display_name": display_name,
        },
    )
    db.flush()
    return token


def user_for_token(db: Session, token: str) -> User | None:
    if not token or not _sqlite(db):
        return None
    ensure(db)
    row = db.execute(
        text("SELECT user_id FROM local_member_credentials WHERE token = :token"),
        {"token": token},
    ).first()
    if row is None:
        return None
    return db.get(User, row[0])


def role_for_token(db: Session, workspace_id: str, token: str) -> str | None:
    if not token or not _sqlite(db):
        return None
    ensure(db)
    row = db.execute(
        text(
            """
            SELECT role FROM local_member_credentials
            WHERE token = :token AND workspace_id = :workspace_id
            """
        ),
        {"token": token, "workspace_id": workspace_id},
    ).first()
    return row[0] if row else None


def token_known(db: Session, token: str) -> bool:
    if not token or not _sqlite(db):
        return False
    ensure(db)
    row = db.execute(
        text("SELECT 1 FROM local_member_credentials WHERE token = :token"),
        {"token": token},
    ).first()
    return row is not None


def lan_host() -> str:
    """The address another computer on this network can use. No packet is sent."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("192.0.2.1", 9))
        ip = sock.getsockname()[0]
        return ip or "127.0.0.1"
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def project_join_url(token: str) -> str:
    port = os.environ.get("LOCAL_WORKSPACE_PORT", "18765")
    query = urlencode({"host": lan_host(), "port": port, "code": token})
    return f"openagents://join?{query}"
