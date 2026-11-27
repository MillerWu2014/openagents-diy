"""Another computer joins one project with an invite, not the project token."""

from fastapi.testclient import TestClient

from app.main import app


def test_named_join_from_the_network(monkeypatch):
    monkeypatch.setenv("LOCAL_LAN_GUARD", "1")
    local = TestClient(app, client=("127.0.0.1", 50000))
    remote = TestClient(app, client=("192.0.2.8", 9))
    created = local.post("/v1/local/projects", json={"name": "Blog"}).json()["data"]
    slug, token = created["slug"], created["token"]
    inv = local.post(
        f"/v1/workspaces/{slug}/invites",
        json={"role": "member"},
        headers={"X-Workspace-Token": token},
    ).json()["data"]
    assert inv["url"].startswith("openagents://join?")
    assert f"code={inv['code']}" in inv["url"]
    assert token not in inv["url"]

    assert remote.get("/v1/local/projects").status_code == 403
    assert remote.get(
        f"/v1/workspaces/{slug}/me",
        headers={"X-Workspace-Token": token},
    ).status_code == 403

    peek = remote.get(f"/v1/invites/{inv['code']}")
    assert peek.status_code == 200
    assert peek.json()["data"]["workspaceName"] == "Blog"

    assert remote.post(f"/v1/invites/{inv['code']}/accept").status_code == 401
    joined = remote.post(
        f"/v1/invites/{inv['code']}/accept",
        json={"displayName": "周明"},
    )
    assert joined.status_code == 200, joined.text
    body = joined.json()["data"]
    assert body["slug"] == slug and body["role"] == "member"
    assert body["memberToken"] and body["memberToken"] != token

    me = remote.get(
        f"/v1/workspaces/{slug}/me",
        headers={"Authorization": f"Bearer {body['memberToken']}"},
    )
    assert me.status_code == 200, me.text
    assert me.json()["data"]["displayName"] == "周明"
    assert me.json()["data"]["role"] == "member"
    assert me.json()["data"]["effectiveRole"] == "member"

    again = remote.post(
        f"/v1/invites/{inv['code']}/accept",
        json={"displayName": "另一个"},
    )
    assert again.status_code == 400
    assert remote.get(
        "/v1/local/projects",
        headers={"Authorization": f"Bearer {body['memberToken']}"},
    ).status_code == 403


def test_local_owner_edits_profile_without_a_login():
    local = TestClient(app, client=("127.0.0.1", 50000))
    created = local.post("/v1/local/projects", json={"name": "Desk"}).json()["data"]
    headers = {"X-Workspace-Token": created["token"]}

    got = local.get("/v1/account/profile", headers=headers)
    assert got.status_code == 200, got.text
    assert got.json()["data"]["email"] == "local@localhost"

    saved = local.patch(
        "/v1/account/profile",
        headers=headers,
        json={"display_name": "明朗", "avatar_url": "data:image/jpeg;base64,abc"},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["data"]["displayName"] == "明朗"
    assert saved.json()["data"]["avatarUrl"] == "data:image/jpeg;base64,abc"

    # A bearer that is not a person must not be promoted by the project token.
    denied = local.get(
        "/v1/account/profile",
        headers={**headers, "Authorization": "Bearer not-a-person"},
    )
    assert denied.status_code == 401

    remote = TestClient(app, client=("192.0.2.8", 9))
    assert remote.get("/v1/account/profile", headers=headers).status_code == 401
