import { expect, it } from 'vitest';
import { mergeConversationRows } from './conversation-list';
import type { WorkspaceSession, DMConversation } from './types';
const thread = { sessionId: 'thread', title: 'Bravo', lastEventAt: 20 } as WorkspaceSession;
const dm = { agents: ['human:me', 'human:sam'], lastMessage: { timestamp: 30 } } as DMConversation;
it('interleaves threads and DMs by activity for All', () => {
  expect(mergeConversationRows([thread], [dm], 'recent', () => 'Sam').map(r => r.kind)).toEqual(['dm', 'thread']);
  expect(mergeConversationRows([thread], [dm], 'oldest', () => 'Sam').map(r => r.kind)).toEqual(['thread', 'dm']);
});
it('sorts by displayed names and avoids duplicate synthetic DM threads', () => {
  const synthetic = { ...thread, sessionId: 'dm:human:me,human:sam' };
  const result = mergeConversationRows([thread, synthetic], [dm], 'title', () => 'Alice');
  expect(result.map(r => r.title)).toEqual(['Alice', 'Bravo']);
});

it.each(['recent', 'oldest', 'title'] as const)('keeps pinned threads first with %s sorting and restores ordering when unpinned', (order) => {
  const pinned = { ...thread, sessionId: 'pinned', title: 'Zulu', lastEventAt: 10, pinned: true };
  const rows = mergeConversationRows([thread, pinned], [dm], order, () => 'Alice');
  expect(rows[0].id).toBe('pinned');
  const unpinned = mergeConversationRows([thread, { ...pinned, pinned: false }], [dm], order, () => 'Alice');
  if (order !== 'oldest') expect(unpinned[0].kind).toBe('dm');
});

it('keeps issue execution threads out of the conversation list', () => {
  const execution = { ...thread, sessionId: 'issue-work-b474eebfd36f', title: 'Renamed execution', status: 'active', pinned: true, starred: true } as WorkspaceSession;
  const linked = { ...thread, sessionId: 'support-queue', title: 'Issue work: customer support', status: 'active' } as WorkspaceSession;
  expect(mergeConversationRows([execution, linked], [], 'recent', () => '').map(row => row.id)).toEqual(['support-queue']);
});


it('keeps pinned DMs above other conversations and excludes routine queues', () => {
  const pinned = { ...dm, pinned: true, lastMessage: { ...dm.lastMessage, timestamp: 1 } };
  const routine = { ...thread, sessionId: 'routines:posthog-analyst', starred: true };
  expect(mergeConversationRows([routine,thread],[pinned],'recent',()=> 'Sam').map(r=>r.kind)).toEqual(['dm','thread']);
});
