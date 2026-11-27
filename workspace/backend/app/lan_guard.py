"""What another computer on the network may ask this project.

Loopback keeps the whole API. From anywhere else, an invite can be looked at
and accepted, and a member credential can use that project. The project token
and the local admin routes stay on this computer.
"""

import os

from app.services.local_members import token_known

_LOOPBACK = {"127.0.0.1", "::1", "testclient"}


def _enabled() -> bool:
    return os.environ.get("LOCAL_LAN_GUARD") == "1"


def _host(scope) -> str:
    client = scope.get("client")
    return client[0] if client else ""


def _bearer(scope) -> str:
    for key, value in scope.get("headers") or []:
        if key == b"authorization":
            text = value.decode("latin1")
            if text.lower().startswith("bearer "):
                return text[7:].strip()
    return ""


def _public_invite(method: str, path: str) -> bool:
    parts = [part for part in path.split("/") if part]
    if len(parts) == 3 and parts[0] == "v1" and parts[1] == "invites":
        return method == "GET"
    return (
        len(parts) == 4
        and parts[0] == "v1"
        and parts[1] == "invites"
        and parts[3] == "accept"
        and method == "POST"
    )


def _member_may_call(path: str, token: str) -> bool:
    if path.startswith("/v1/local") or path.startswith("/v1/nodes"):
        return False
    if not token:
        return False
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        return token_known(db, token)
    finally:
        db.close()


async def _forbid(send) -> None:
    body = (
        b'{"code":403,"message":"This network can only join a project with an invite.",'
        b'"data":null}'
    )
    await send({
        "type": "http.response.start",
        "status": 403,
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode()),
        ],
    })
    await send({"type": "http.response.body", "body": body})


class LanGuard:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or not _enabled():
            await self.app(scope, receive, send)
            return
        host = _host(scope)
        if host in _LOOPBACK or host.startswith("127."):
            await self.app(scope, receive, send)
            return
        method = scope.get("method") or "GET"
        path = scope.get("path") or ""
        if method == "OPTIONS" or _public_invite(method, path):
            await self.app(scope, receive, send)
            return
        if _member_may_call(path, _bearer(scope)):
            await self.app(scope, receive, send)
            return
        await _forbid(send)
