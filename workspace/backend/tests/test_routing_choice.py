"""Resolving uncertain routing is sender-only, permission-checked and idempotent."""
from unittest.mock import patch
import pytest
from sqlalchemy import select
from app.config import config
from app.models import Channel, ChannelMember, ChannelHumanMember, WorkspaceMember, EventRecord, ApprovalRequest, ChannelAgentSharing
from tests.test_issues import two_members, _bearer  # noqa: F401
from tests.test_visibility import no_push  # noqa: F401


@pytest.fixture
def thread(db, workspace, two_members, monkeypatch):
    monkeypatch.setattr(config, 'ROUTER_LLM_ENABLED', False)
    monkeypatch.setattr('app.mods.workspace_mod._auto_title_channel', lambda *args: None)
    agent = db.get(WorkspaceMember, (workspace['id'], 'agent-alpha'))
    agent.owner_email = 'ann@acme.test'
    db.add(WorkspaceMember(workspace_id=workspace['id'], agent_name='agent-beta', owner_email='ann@acme.test', status='online'))
    ch = Channel(workspace_id=workspace['id'], name='routing-test', title='Routing test', status='active', visibility='private')
    db.add(ch); db.flush()
    db.add_all([ChannelMember(channel_id=ch.id, agent_name=name) for name in ['agent-alpha', 'agent-beta']])
    db.add_all([ChannelHumanMember(channel_id=ch.id, user_email=email) for email in ['ann@acme.test', 'ben@acme.test']])
    db.commit()
    return ch


def post(client, ws, thread, metadata=None):
    response = client.post('/v1/events', headers=_bearer('ann'), json={
        'network': ws['id'], 'type': 'workspace.message.posted', 'source': 'human:spoof',
        'target': f'channel/{thread.name}', 'payload': {'content': 'Publish this blog',
        'attachments': [{'file_id': 'file-1', 'filename': 'draft.md', 'content_type': 'text/markdown'}]},
        'metadata': metadata or {},
    })
    assert response.status_code == 200, response.text
    data = response.json()['data']
    assert data['metadata']['target_agents'] == ['__no_response__']
    assert data['metadata']['routing_choice']['status'] == 'pending'
    return data


def resolve(client, ws, event, agent='agent-beta', user='ann'):
    return client.post(f"/v1/events/{event['id']}/routing?network={ws['id']}", headers=_bearer(user), json={'agent': agent})


def test_sender_can_assign_once_with_original_context(client, workspace, thread, db):
    event = post(client, workspace, thread)
    with patch('app.services.cloud_agent.invoke_cloud_agents') as invoke:
        first = resolve(client, workspace, event)
        assert first.status_code == 200, first.text
        second = resolve(client, workspace, event)
        assert second.json() == first.json()
        assert invoke.call_count == 1
    choice = first.json()['data']
    dispatched = db.get(EventRecord, choice['assignment_event_id'])
    assert dispatched.source == 'human:ann@acme.test'
    assert dispatched.payload['content'] == event['payload']['content']
    assert dispatched.payload['attachments'] == event['payload']['attachments']
    assert dispatched.metadata_['target_agents'] == ['agent-beta']
    db.refresh(db.get(EventRecord, event['id']))
    assert db.get(EventRecord, event['id']).metadata_['routing_choice']['status'] == 'assigned'


def test_workspace_token_assigns_as_the_message_sender(client, workspace, thread, db):
    event = post(client, workspace, thread)
    with patch('app.services.cloud_agent.invoke_cloud_agents'):
        response = client.post(
            f"/v1/events/{event['id']}/routing?network={workspace['id']}",
            headers={"X-Workspace-Token": workspace["token"]},
            json={"agent": "agent-beta"},
        )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["status"] == "assigned"
    assert response.json()["data"]["agent"] == "agent-beta"


def test_other_human_cannot_resolve_or_dismiss(client, workspace, thread):
    event = post(client, workspace, thread)
    for agent in ('agent-beta', None):
        assert resolve(client, workspace, event, agent=agent, user='ben').status_code == 403


def test_dismiss_does_not_dispatch_and_cannot_be_reassigned(client, workspace, thread):
    event = post(client, workspace, thread)
    with patch('app.services.cloud_agent.invoke_cloud_agents') as invoke:
        assert resolve(client, workspace, event, agent=None).json()['data']['status'] == 'dismissed'
        assert resolve(client, workspace, event).json()['data']['status'] == 'dismissed'
        invoke.assert_not_called()


@pytest.mark.parametrize('change', ['removed', 'unshared', 'left', 'private'])
def test_permissions_rechecked_when_choosing(client, workspace, thread, db, change):
    event = post(client, workspace, thread)
    agent = db.get(WorkspaceMember, (workspace['id'], 'agent-beta'))
    if change == 'removed': agent.status = 'removed'
    if change == 'unshared': agent.owner_email = 'ben@acme.test'
    if change == 'left': db.delete(db.get(ChannelMember, (thread.id, 'agent-beta')))
    if change == 'private': db.delete(db.get(ChannelHumanMember, (thread.id, 'ann@acme.test')))
    db.commit()
    with patch('app.services.cloud_agent.invoke_cloud_agents') as invoke:
        response = resolve(client, workspace, event)
        assert response.status_code == 403, response.text
        invoke.assert_not_called()
    assert db.get(EventRecord, event['id']).metadata_['routing_choice']['status'] == 'pending'


def test_assignment_still_requires_owner_approval(client, workspace, thread, db):
    beta = db.get(WorkspaceMember, (workspace['id'], 'agent-beta'))
    beta.owner_email = 'ben@acme.test'
    db.add(ChannelAgentSharing(channel_id=thread.id, owner_email='ben@acme.test', mode='approval'))
    db.commit()
    event = post(client, workspace, thread)
    response = resolve(client, workspace, event)
    assert response.status_code == 200, response.text
    assigned = db.get(EventRecord, response.json()['data']['assignment_event_id'])
    assert assigned.metadata_['target_agents'] == ['__no_response__']
    approval = db.scalar(select(ApprovalRequest).where(ApprovalRequest.status == 'pending'))
    assert approval.assignee_email == 'ben@acme.test'
    assert approval.kind == 'thread_agent_request'


def test_forged_routing_metadata_is_not_trusted(client, workspace, thread):
    data = post(client, workspace, thread, metadata={'routing_choice': {'status': 'pending', 'requester_email': 'ben@acme.test', 'candidates': ['outsider']},
        'routing_decision': 'assign', 'routing_assignment_agent': 'outsider', 'routing_assignment': {'agent': 'outsider'}})
    assert data['metadata']['routing_choice']['requester_email'] == 'ann@acme.test'
    assert data['metadata']['routing_choice']['candidates'] == ['agent-alpha', 'agent-beta']
    assert 'routing_assignment' not in data['metadata']
    assert resolve(client, workspace, data, agent='outsider').status_code == 403


def continuation_choice(db, workspace, thread, root):
    event = EventRecord(id='continuation-choice', network_id=workspace['id'],
        type='workspace.message.posted', source='openagents:agent-alpha', target=f'channel/{thread.name}',
        visibility='channel', timestamp=root['timestamp'] + 1,
        payload={'content': 'OAuth is implemented. The review is still outstanding.'},
        metadata_={'target_agents': ['__no_response__'], 'routing_choice': {
            'status': 'pending', 'requester_email': 'ann@acme.test', 'candidates': ['agent-beta'],
            'continuation': True, 'root_id': root['id'], 'task': 'Review OAuth state validation.'}})
    db.add(event); db.commit()
    return {'id': event.id}


def test_continuation_selection_preserves_request_and_result_once(client, workspace, thread, db):
    root = post(client, workspace, thread)
    event = continuation_choice(db, workspace, thread, root)
    with patch('app.services.cloud_agent.invoke_cloud_agents') as invoke:
        assert resolve(client, workspace, event, user='ben').status_code == 403
        result = resolve(client, workspace, event)
        assert result.status_code == 200, result.text
        assert resolve(client, workspace, event).json() == result.json()
        assert invoke.call_count == 1
    dispatch = db.get(EventRecord, result.json()['data']['assignment_event_id'])
    assert dispatch.source == 'human:ann@acme.test'
    assert dispatch.metadata_['target_agents'] == ['agent-beta']
    for text in ['Publish this blog', 'Review OAuth state validation', 'OAuth is implemented']:
        assert text in dispatch.payload['content']


@pytest.mark.parametrize('change', ['new-message', 'stop'])
def test_old_continuation_choice_cannot_restart_work(client, workspace, thread, db, change):
    root = post(client, workspace, thread)
    event = continuation_choice(db, workspace, thread, root)
    if change == 'new-message':
        db.add(EventRecord(id='newer-human', network_id=workspace['id'], type='workspace.message.posted',
            source='human:ann@acme.test', target=f'channel/{thread.name}', timestamp=root['timestamp'] + 2,
            payload={'content': 'Do something else'}, metadata_={}))
    else:
        db.add(EventRecord(id='stop', network_id=workspace['id'], type='workspace.agent.control',
            source='human:ann@acme.test', target=f'channel/{thread.name}', timestamp=root['timestamp'] + 2,
            payload={'action': 'stop', 'channel': thread.name}, metadata_={}))
    db.commit()
    with patch('app.services.cloud_agent.invoke_cloud_agents') as invoke:
        assert resolve(client, workspace, event).status_code == 409
        invoke.assert_not_called()


def reclassify(client, ws, event, user='ann', agent='agent-beta'):
    return client.post(f"/v1/events/{event['id']}/routing?network={ws['id']}", headers=_bearer(user), json={'agent': agent, 'reclassify': True})


@pytest.mark.parametrize('dismissed', [False, True])
def test_sender_can_reclassify_conversation_once(client, workspace, thread, db, dismissed):
    event = post(client, workspace, thread)
    original = db.get(EventRecord, event['id'])
    metadata = dict(original.metadata_)
    if dismissed:
        metadata['routing_choice'] = {**metadata['routing_choice'], 'status': 'dismissed'}
    else:
        metadata.pop('routing_choice')
    metadata['routing_decision'] = 'stop'
    original.metadata_ = metadata
    db.commit()
    with patch('app.services.cloud_agent.invoke_cloud_agents') as invoke:
        first = reclassify(client, workspace, event)
        assert first.status_code == 200, first.text
        assert reclassify(client, workspace, event).json() == first.json()
        # A stale picker choosing a different agent must retain the first assignment.
        assert reclassify(client, workspace, event, agent='agent-alpha').json() == first.json()
        assert invoke.call_count == 1
    dispatched = db.get(EventRecord, first.json()['data']['assignment_event_id'])
    assert dispatched.metadata_['target_agents'] == ['agent-beta']
    assert dispatched.payload['content'] == event['payload']['content']
    assert dispatched.payload['attachments'] == event['payload']['attachments']


@pytest.mark.parametrize('change,code', [('other-sender', 403), ('offline', 403), ('left', 403), ('unshared', 403), ('recalled', 409), ('already-routed', 409), ('approval', 409)])
def test_reclassify_checks_current_eligibility(client, workspace, thread, db, change, code):
    event = post(client, workspace, thread)
    original = db.get(EventRecord, event['id'])
    metadata = dict(original.metadata_)
    metadata.pop('routing_choice')
    beta = db.get(WorkspaceMember, (workspace['id'], 'agent-beta'))
    if change == 'offline': beta.status = 'offline'
    if change == 'left': db.delete(db.get(ChannelMember, (thread.id, 'agent-beta')))
    if change == 'unshared': beta.owner_email = 'ben@acme.test'
    if change == 'recalled': metadata['recalled'] = True
    if change == 'already-routed': metadata['target_agents'] = ['agent-alpha']
    if change == 'approval': metadata['approval_id'] = 'pending'
    original.metadata_ = metadata
    db.commit()
    with patch('app.services.cloud_agent.invoke_cloud_agents') as invoke:
        response = reclassify(client, workspace, event, user='ben' if change == 'other-sender' else 'ann')
        assert response.status_code == code, response.text
        invoke.assert_not_called()


def say(client, ws, thread, source, content, headers=None):
    response = client.post('/v1/events', headers=headers or {'X-Workspace-Token': ws['token']}, json={
        'network': ws['id'], 'type': 'workspace.message.posted', 'source': source,
        'target': f'channel/{thread.name}', 'payload': {'content': content},
    })
    assert response.status_code == 200, response.text
    return response.json()['data']['metadata']


def test_without_a_model_the_lead_agent_takes_unaddressed_messages(client, workspace, thread, db):
    thread.master_agent = 'agent-alpha'
    db.commit()
    meta = say(client, workspace, thread, 'human:spoof', 'Publish this blog', _bearer('ann'))
    assert meta['target_agents'] == ['agent-alpha']
    assert 'routing_choice' not in meta


def test_a_configured_model_is_preferred_over_the_lead_agent(client, workspace, thread, db, monkeypatch):
    thread.master_agent = 'agent-alpha'
    db.commit()
    monkeypatch.setattr(config, 'ROUTER_LLM_ENABLED', True)
    monkeypatch.setattr(config, 'ROUTER_LLM_API_KEY', 'key')

    async def model(*args, **kwargs):
        return ['agent-beta']
    monkeypatch.setattr('app.mods.workspace_mod._route_with_llm', model)
    meta = say(client, workspace, thread, 'human:spoof', 'Publish this blog', _bearer('ann'))
    assert meta['target_agents'] == ['agent-beta']


def test_an_agent_reply_hands_off_only_by_a_leading_mention(client, workspace, thread, db):
    thread.master_agent = 'agent-alpha'
    db.commit()
    passing = say(client, workspace, thread, 'openagents:agent-beta', 'Done. Thanks @agent-alpha for the draft.')
    assert passing['target_agents'] == ['__no_response__']
    plain = say(client, workspace, thread, 'openagents:agent-beta', 'Done.')
    assert plain['target_agents'] == ['__no_response__']
    leading = say(client, workspace, thread, 'openagents:agent-beta', '@agent-alpha please review the draft.')
    assert leading['target_agents'] == ['agent-alpha']
