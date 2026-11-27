'use client';

import { toast } from 'sonner';
import { useState, useMemo } from 'react';
import { isIssueWorkSession, isRoutineSession, mergeConversationRows, sessionActivityTime, type ConversationRow } from '@/lib/conversation-list';
import { agentLabel } from '@/lib/helpers';
import { useWorkspace } from '@/lib/workspace-context';
import { useLayout } from '@/components/layout/layout-context';
import { useFormatters, useT } from '@/lib/i18n';
import { workspaceApi } from '@/lib/api';
import { addressName, dmCounterpart, dmSessionId, LEGACY_HUMAN, myAddress } from '@/lib/dm';
import { onlineMemberNames } from '@/lib/sidebar-members';
import { useHumanNames, useTeamRoster } from '@/hooks/use-team-roster';
import { filterMentionPeople } from '@/lib/people-mentions';
import type { DMConversation, WorkspaceSession } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DmRow } from './dm-row';
import { NewDmMenu } from './new-dm-menu';
import { ThreadListEmpty } from './thread-list-empty';
import { ThreadConversationFilter, ThreadListHeader, ThreadSearch } from './thread-list-header';
import { buildThreadPreview } from './thread-preview';
import { ThreadRow } from './thread-row';
import { ThreadRowMenu } from './thread-row-menu';
import { useThreadProjectActions } from './use-thread-project-actions';
import { MoveToProjectMenu, startThreadDrag } from './thread-projects';
import { useThreadSearch, useThreadShortcuts } from './use-thread-list-input';
import { TABS, dmDedupKey, dmDisplayTitle, dmRowId, highlightMatch, type FilterTab, type SortOrder } from './thread-list-utils';
import { threadPrivacyApplies } from '@/components/chat/thread-privacy-control';
import { prefetchChannelParticipants } from '@/lib/channel-participants-store';

export function ThreadList() {
  const {
    workspace, sessions, currentSessionId, setCurrentSessionId, agents, lastMessageBySession,
    activeSessionIds, completedSessionIds, dmConversations,
    unreadSessionIds, unreadThreadCounts, unreadDmSessionIds, unreadSignals, refreshAgents, refreshDMConversations, currentUser, onlineUsers,
  } = useWorkspace();
  const me = myAddress(currentUser);
  const humanNames = useHumanNames();
  const { isMobile, openMobileDetail, openNewThread, threadFilter: filter, setThreadFilter: setFilter, setSelectedAgentName } = useLayout();
  const t = useT();
  const { timeAgo } = useFormatters();

  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const { searchQuery, setSearchQuery, searching, hitsByChannel, isSearching } = useThreadSearch();

  // Sort by backend last_event_at so rows don't jump around client-side
  const sortedSessions = useMemo(() => {
    return [...sessions]
      .filter((s) =>
        s.status !== 'deleted' && !isIssueWorkSession(s) &&
        // Task working threads live on the Kanban board, not the thread list.
        !s.sessionId.startsWith('task:') && !s.sessionId.startsWith('dm:') &&
        !isRoutineSession(s))
      .sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        if (sortOrder === 'title') return (a.title || '').localeCompare(b.title || '');
        if (sortOrder === 'oldest') return sessionActivityTime(a) - sessionActivityTime(b);
        return sessionActivityTime(b) - sessionActivityTime(a);
      });
  }, [sessions, currentSessionId, sortOrder]);

  const { projectModel, createProject } = useThreadProjectActions({
    workspaceId: workspace?.workspaceId || '',
    userId: currentUser.id,
    sessions: sortedSessions,
    setFilter,
    setSearchQuery,
  });

  const activeSessions = useMemo(() => sortedSessions.filter((s) => s.status === 'active'), [sortedSessions]);
  const starredSessions = useMemo(() => activeSessions.filter((s) => s.starred), [activeSessions]);
  const archivedSessions = useMemo(() => sortedSessions.filter((s) => s.status === 'archived'), [sortedSessions]);

  // Keep the viewer's DM history even when the counterpart is offline.
  const visibleDMs = useMemo(() => {
    const filtered = [...dmConversations]
      .filter(c => !!dmCounterpart(c.agents, me))
      .sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp);
    const seen = new Set<string>();
    return filtered.filter((c) => {
      const key = dmDedupKey(c.agents, me);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [dmConversations, me]);

  // While searching, the query spans every thread regardless of the active tab
  const tabSessions = isSearching
    ? sortedSessions.filter((s) => s.title?.toLowerCase().includes(searchQuery.toLowerCase()) || hitsByChannel.has(s.sessionId))
    : filter === 'starred' ? starredSessions
    : filter === 'archived' ? archivedSessions
    : activeSessions;
  const visibleSessions = tabSessions;

  const dmTitle = (convo: DMConversation) => {
    const counterpart = dmCounterpart(convo.agents, me);
    if (!counterpart) return dmDisplayTitle(convo.agents, me);
    if (counterpart === me) return t('threads.you');
    const name = addressName(counterpart);
    const agent = agents.find(a => a.agentName === name);
    return agent ? agentLabel(agent) : humanNames[name.toLowerCase()] || name;
  };
  const matchingDMs = isSearching ? visibleDMs.filter(c =>
    `${dmTitle(c)} ${c.agents.join(' ')} ${c.lastMessage.content}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    hitsByChannel.has(dmRowId(c.agents))) : visibleDMs;
  const allRows = mergeConversationRows(visibleSessions, matchingDMs, sortOrder, dmTitle);
  const sortedDMRows = mergeConversationRows([], matchingDMs, sortOrder, dmTitle);
  const starredRows = mergeConversationRows(visibleSessions, matchingDMs.filter(dm => dm.starred), sortOrder, dmTitle);
  const shortcutIds = isSearching ? [] : filter === 'all' ? allRows.map(r => r.id)
    : filter === 'dms' ? sortedDMRows.map(r => r.id) : filter === 'starred' ? starredRows.map(r => r.id) : visibleSessions.map(s => s.sessionId);

  const unreadThreadCount = activeSessions.filter((s) => unreadSessionIds.has(s.sessionId)).length;
  const unreadDmCount = visibleDMs.filter((c) => unreadDmSessionIds.has(dmRowId(c.agents))).length;
  const unreadCount = unreadThreadCount + unreadDmCount;

  // All and DMs count what's unread (Slack-style), hidden at zero; Starred and
  // Archived keep their totals.
  const tabCount: Record<FilterTab, number | undefined> = {
    all: unreadCount,
    starred: starredSessions.length + visibleDMs.filter(dm => dm.starred).length,
    archived: archivedSessions.length,
    dms: unreadDmCount,
  };

  const selectSession = (sessionId: string) => {
    setSelectedAgentName(null);
    setCurrentSessionId(sessionId);
    if (isMobile) openMobileDetail();
  };

  useThreadShortcuts({ shortcutIds, currentSessionId, isMobile, setCurrentSessionId, openMobileDetail });

  const previewContext = { isSearching, searchQuery, hitsByChannel, lastMessageBySession, agents, humanNames, t };

  const renderSessionRows = (rows: WorkspaceSession[], muted = false, offset = 0) =>
    rows.map((session, idx) => {
      const { node, isStatus } = buildThreadPreview(session.sessionId, previewContext);
      const activityMs = session.lastEventAt;
      return (
        // Hovering a thread reads its roster, so the header opens complete.
        <div key={session.sessionId} draggable onDragStart={event => startThreadDrag(event, session.sessionId)} onPointerEnter={() => { if (threadPrivacyApplies(session.sessionId)) prefetchChannelParticipants(session.sessionId); }}>
        <ThreadRow
          session={session}
          agents={agents}
          isSelected={session.sessionId === currentSessionId}
          isUnread={unreadSessionIds.has(session.sessionId)}
          unreadCount={unreadThreadCounts[session.sessionId] || 0}
          mentionCount={session.sessionId === currentSessionId ? 0 : unreadSignals[session.sessionId]?.mentions ?? 0}
          isRunning={activeSessionIds.has(session.sessionId)}
          isCompleted={completedSessionIds.has(session.sessionId) && !activeSessionIds.has(session.sessionId)}
          preview={node}
          previewIsStatus={isStatus}
          displayTime={activityMs ? timeAgo(new Date(activityMs).toISOString()) : session.createdAt ? timeAgo(session.createdAt) : ''}
          // Hidden while searching: the rendered list reorders but the 1-9
          // handler still operates on activeSessions.
          shortcutKey={!isSearching && !muted && idx + offset < 9 ? idx + offset + 1 : null}
          title={isSearching ? highlightMatch(session.title || t('threads.untitled'), searchQuery) : (session.title || t('threads.untitled'))}
          muted={muted}
          onSelect={() => selectSession(session.sessionId)}
          actions={<ThreadRowMenu session={session} projectActions={<MoveToProjectMenu model={projectModel} threadId={session.sessionId} onCreate={() => void createProject(session.sessionId)} />} />}
        />
        </div>
      );
    });

  // ── Start a new DM ──
  // Candidates: online agents plus the workspace's other people (roster
  // cached per workspace; token-only sessions may not have team access, in
  // which case the picker just shows agents).
  const team = useTeamRoster();
  const onlinePeople = useMemo(() => onlineMemberNames(team, onlineUsers), [team, onlineUsers]);
  const dmPeople = useMemo(
    () => [...(me !== LEGACY_HUMAN ? [{ email: addressName(me), name: t('threads.you') }] : []), ...filterMentionPeople(team, '', currentUser.id.includes('@') ? currentUser.id : null)],
    [team, currentUser.id, me, t],
  );
  // Canonical DM id: sorted pair, matching the backend's (lesser, greater)
  // conversation normalization — so opening the same counterpart always
  // lands on the same session id.
  const startDM = (address: string) => selectSession(dmSessionId(me, address));

  const [pendingDm, setPendingDm] = useState<string | null>(null);
  const changeDMPreference = async (id: string, update: { pinned?: boolean; starred?: boolean }) => {
    if (pendingDm) return;
    setPendingDm(id);
    try { await workspaceApi.updateDMPreference(id, update); await refreshDMConversations(); }
    catch { toast.error(t('threads.preferenceFailed')); }
    finally { setPendingDm(null); }
  };

  const renderDMRows = (rows: DMConversation[], offset = 0) =>
    rows.map((convo, idx) => (
      <DmRow
        key={dmRowId(convo.agents)}
        convo={convo}
        shortcutKey={!isSearching && idx + offset < 9 ? idx + offset + 1 : null}
        onlinePeople={onlinePeople}
        pendingDm={pendingDm}
        onSelect={selectSession}
        onPreference={(id, update) => void changeDMPreference(id, update)}
      />
    ));

  const renderConversations = (rows: ConversationRow[], muted = false) =>
    rows.map((row, index) => row.kind === 'thread' ? renderSessionRows([row.thread], muted, index) : renderDMRows([row.dm], index));

  const emptyState = (tab: FilterTab) => (
    <ThreadListEmpty
      tab={tab}
      isSearching={isSearching}
      onClearSearch={() => setSearchQuery('')}
      onNewThread={openNewThread}
    />
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <ThreadListHeader
        onNewThread={openNewThread}
        onRefresh={() => { refreshAgents(); refreshDMConversations(); }}
        onSort={setSortOrder}
        sortOrder={sortOrder}
      />

      <div className="flex shrink-0 items-center gap-1 px-3 pt-2 pb-1">
        <ThreadSearch inline value={searchQuery} searching={searching} onChange={setSearchQuery} />
        <ThreadConversationFilter value={isSearching ? 'all' : filter} counts={tabCount} disabled={isSearching} onChange={setFilter} />
      </div>

      {isSearching && <p className="px-4 pb-2 text-xs text-muted-foreground">{t('threadProjects.searchAll')}</p>}

      <div className="flex min-h-0 flex-1 flex-col">
        {TABS.filter(tab => tab.id === (isSearching ? 'all' : filter)).map((tab) => (
          <div key={tab.id} className="min-h-0 grow" role="region" aria-label={t(tab.labelKey)}>
            {/* Gutters on the viewport, not the rows: the selected row is
                outlined and rounded, and flush against the edge its ring
                collided with the scrollbar. */}
            <ScrollArea className="h-full" viewportClassName="px-2 [&>div]:flex! [&>div]:min-h-full [&>div]:flex-col">
              {tab.id === 'all' ? (
                allRows.length === 0 ? emptyState('all') : renderConversations(allRows)
              ) : tab.id === 'dms' ? (
                <>
                  {!isSearching && <NewDmMenu agents={agents} people={me === LEGACY_HUMAN ? [] : dmPeople} onStart={startDM} />}
                  {sortedDMRows.length === 0 ? emptyState('dms') : sortedDMRows.map((row, idx) => row.kind === 'dm' ? renderDMRows([row.dm], idx) : null)}
                </>
              ) : tab.id === 'starred' ? (
                starredRows.length === 0 ? emptyState('starred') : renderConversations(starredRows)
              ) : visibleSessions.length === 0 ? (
                emptyState(tab.id)
              ) : (
                renderConversations(mergeConversationRows(visibleSessions, [], sortOrder, dmTitle), tab.id === 'archived' && !isSearching)
              )}
            </ScrollArea>
          </div>
        ))}
      </div>
    </div>
  );
}
