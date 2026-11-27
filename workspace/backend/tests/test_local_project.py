"""A local project keeps the folder its sessions run in."""

from fastapi.testclient import TestClient

from app.main import app
from tests.test_visibility import people  # noqa: F401


def test_project_directory_round_trip():
    client = TestClient(app, client=("127.0.0.1", 50000))
    created = client.post("/v1/local/projects", json={"name": "Stands", "directory": "/tmp/stands"}).json()["data"]
    assert created["directory"] == "/tmp/stands"
    listed = client.get("/v1/local/projects").json()["data"]
    row = next(item for item in listed if item["slug"] == created["slug"])
    assert row["directory"] == "/tmp/stands"
    updated = client.patch(f"/v1/local/projects/{created['slug']}", json={"directory": "/tmp/blog"}).json()["data"]
    assert updated["directory"] == "/tmp/blog"


def test_workspace_token_can_mention_thread_agents(client, workspace, people, db):
    from tests.test_thread_agent_settings import setup_thread
    setup_thread(client, workspace, db)
    data = client.get(
        f"/v1/channels/settings-test/participants?network={workspace['id']}",
        headers={"X-Workspace-Token": workspace["token"]},
    )
    assert data.status_code == 200, data.text
    agents = data.json()["data"]["agents"]
    assert agents, data.text
    assert all(agent["request_access"] == "yes" for agent in agents)


def test_local_projects_refuse_a_remote_caller():
    client = TestClient(app)
    assert client.get("/v1/local/projects").status_code == 403
