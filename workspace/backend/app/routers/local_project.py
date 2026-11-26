# -*- coding: utf-8 -*-
"""One local project, opened with no login."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Workspace, WorkspaceMembership
from app.response import success_response

router = APIRouter(prefix="/v1/local", tags=["Local project"])

LOCAL_EMAIL = "local@localhost"
LOCAL_SLUG = "project"
LOCAL_TOKEN = "local-project"


@router.get("/project")
def get_local_project(db: Session = Depends(get_db)):
    """Return the single local project, creating it on first open."""
    user = db.execute(select(User).where(User.email == LOCAL_EMAIL)).scalar_one_or_none()
    if user is None:
        user = User(
            email=LOCAL_EMAIL,
            display_name="Local",
            email_verified_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.flush()

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

    membership = db.execute(
        select(WorkspaceMembership).where(
            WorkspaceMembership.workspace_id == workspace.id,
            WorkspaceMembership.user_id == user.id,
        )
    ).scalar_one_or_none()
    if membership is None:
        db.add(WorkspaceMembership(workspace_id=workspace.id, user_id=user.id, role="owner"))

    db.commit()
    return success_response({
        "slug": workspace.slug,
        "name": workspace.name or "Project",
        "token": workspace.password_hash or LOCAL_TOKEN,
    })
