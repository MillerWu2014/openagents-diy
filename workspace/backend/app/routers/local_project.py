# -*- coding: utf-8 -*-
"""Local projects, opened with no login and no pairing code."""

import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.models import NodePairingCode, User, Workspace, WorkspaceMembership
from app.response import ResponseCode, json_response, success_response
from app.routers.nodes import PAIRING_TTL, format_pairing_code, generate_pairing_code

router = APIRouter(prefix="/v1/local", tags=["Local project"])

LOCAL_EMAIL = "local@localhost"
LOCAL_SLUG = "project"
LOCAL_TOKEN = "local-project"


class LocalProjectBody(BaseModel):
    name: str = ""
    directory: str = ""


class LocalProjectDirectory(BaseModel):
    directory: str = ""


class LocalPairBody(BaseModel):
    slug: Optional[str] = None


def _local_request(request: Request):
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "::1"):
        return json_response(ResponseCode.FORBIDDEN, "Local projects are only available on this computer")
    return None


def _user(db: Session) -> User:
    user = db.execute(select(User).where(User.email == LOCAL_EMAIL)).scalar_one_or_none()
    if user is None:
        user = User(
            email=LOCAL_EMAIL,
            display_name="Local",
            email_verified_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.flush()
    return user


def _own(db: Session, user: User, workspace: Workspace) -> None:
    membership = db.execute(
        select(WorkspaceMembership).where(
            WorkspaceMembership.workspace_id == workspace.id,
            WorkspaceMembership.user_id == user.id,
        )
    ).scalar_one_or_none()
    if membership is None:
        db.add(WorkspaceMembership(workspace_id=workspace.id, user_id=user.id, role="owner"))
        db.flush()


def _ensure_default(db: Session, user: User) -> Workspace:
    workspace = db.execute(
        select(Workspace).where(Workspace.slug == LOCAL_SLUG, Workspace.status != "deleted")
    ).scalar_one_or_none()
    if workspace is None:
        workspace = Workspace(
            slug=LOCAL_SLUG,
            name="Project",
            creator_email=LOCAL_EMAIL,
            password_hash=LOCAL_TOKEN,
            require_login=False,
            settings={"local_project": True},
            status="active",
        )
        db.add(workspace)
        db.flush()
    _own(db, user, workspace)
    return workspace


def _directory(workspace: Workspace) -> str:
    settings = workspace.settings if isinstance(workspace.settings, dict) else {}
    value = settings.get("directory")
    return value.strip() if isinstance(value, str) else ""


def _checked_directory(value: str):
    directory = value.strip()
    if not directory or len(directory) > 4096 or "\x00" in directory:
        return None
    return directory


def _payload(workspace: Workspace) -> dict:
    return {
        "slug": workspace.slug,
        "name": workspace.name or "Project",
        "token": workspace.password_hash or LOCAL_TOKEN,
        "directory": _directory(workspace),
    }


def _projects(db: Session, user: User) -> list[Workspace]:
    _ensure_default(db, user)
    return list(db.execute(
        select(Workspace)
        .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
        .where(WorkspaceMembership.user_id == user.id, Workspace.status != "deleted")
        .order_by(Workspace.slug)
    ).scalars().all())


@router.get("/project")
def get_local_project(db: Session = Depends(get_db)):
    """Return the default local project, creating it on first open."""
    user = _user(db)
    workspace = _ensure_default(db, user)
    db.commit()
    return success_response(_payload(workspace))


@router.get("/projects")
def list_local_projects(request: Request, db: Session = Depends(get_db)):
    denied = _local_request(request)
    if denied:
        return denied
    user = _user(db)
    rows = _projects(db, user)
    db.commit()
    return success_response([_payload(row) for row in rows])


@router.post("/projects")
def create_local_project(body: LocalProjectBody, request: Request, db: Session = Depends(get_db)):
    denied = _local_request(request)
    if denied:
        return denied
    name = body.name.strip()
    if not name or len(name) > 80:
        return json_response(ResponseCode.BAD_REQUEST, "Project name is required")
    directory = _checked_directory(body.directory) if body.directory.strip() else ""
    if body.directory.strip() and not directory:
        return json_response(ResponseCode.BAD_REQUEST, "Project folder is invalid")
    user = _user(db)
    settings = {"local_project": True}
    if directory:
        settings["directory"] = directory
    workspace = Workspace(
        slug=secrets.token_hex(4),
        name=name,
        creator_email=LOCAL_EMAIL,
        password_hash=secrets.token_urlsafe(32),
        require_login=False,
        settings=settings,
        status="active",
    )
    db.add(workspace)
    db.flush()
    _own(db, user, workspace)
    db.commit()
    return success_response(_payload(workspace))


@router.patch("/projects/{slug}")
def update_local_project_directory(slug: str, body: LocalProjectDirectory, request: Request, db: Session = Depends(get_db)):
    """The project's folder. An agent joined to the project runs its sessions here."""
    denied = _local_request(request)
    if denied:
        return denied
    directory = _checked_directory(body.directory)
    if not directory:
        return json_response(ResponseCode.BAD_REQUEST, "Project folder is invalid")
    user = _user(db)
    workspace = next((row for row in _projects(db, user) if row.slug == slug), None)
    if workspace is None:
        return json_response(ResponseCode.NOT_FOUND, "Project not found")
    settings = dict(workspace.settings or {})
    settings["directory"] = directory
    workspace.settings = settings
    flag_modified(workspace, "settings")
    db.commit()
    return success_response(_payload(workspace))


@router.post("/pair")
def pair_local_project(body: LocalPairBody, request: Request, db: Session = Depends(get_db)):
    """Mint a one-time code for this computer and return it. The launcher redeems it itself."""
    denied = _local_request(request)
    if denied:
        return denied
    user = _user(db)
    slug = (body.slug or LOCAL_SLUG).strip()
    rows = _projects(db, user)
    workspace = next((row for row in rows if row.slug == slug), None)
    if workspace is None:
        return json_response(ResponseCode.NOT_FOUND, "Project not found")
    code = generate_pairing_code()
    db.add(NodePairingCode(
        code=code,
        workspace_id=workspace.id,
        created_by=LOCAL_EMAIL,
        expires_at=datetime.now(timezone.utc) + PAIRING_TTL,
    ))
    db.commit()
    return success_response({
        "code": format_pairing_code(code),
        "slug": workspace.slug,
        "name": workspace.name or "Project",
    })
