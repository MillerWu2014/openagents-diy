'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition
} from 'react';
import { useWorkspace } from '@/lib/workspace-context';
import { useThreadViewState, type BrowserView } from './use-thread-view-state';
import type { ArtifactReference } from '@/lib/thread-artifacts';
import { requestedResource, requestedView, withoutRequestedView } from '@/lib/resource-link';
import { useIsMobile } from '@/hooks/use-mobile';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { FileSortKey, FileTypeFilter } from '@/components/files/file-utils';

export type ViewMode = 'threads' | 'files' | 'knowledge' | 'browser' | 'issues' | 'workflows' | 'routines' | 'inbox' | 'connect' | 'skills' | 'agents';

/** Issues, knowledge, inbox, and workflows are gone. Sessions stay on threads. */
const RETIRED_VIEWS = new Set<ViewMode>(['issues', 'knowledge', 'inbox', 'workflows']);
export function keptView(mode: ViewMode): ViewMode {
  return RETIRED_VIEWS.has(mode) ? 'threads' : mode;
}

/** The Files view has two halves the folder panel switches between. */
export type FilesSection = 'folders' | 'trash';

/**
 * How the Files detail pane is currently looking at a folder.
 *
 * It lives up here because the grid doesn't: opening a file replaces it with
 * the preview, so state held inside it was thrown away every time you looked
 * at something. A filter that resets whenever you open one of the files it
 * turned up isn't a filter you can use to find a file.
 *
 * The two halves are kept apart because they answer different questions.
 * `view` and `sort` are how you like to read a listing — any listing — so they
 * follow you around. `narrowing` is about the folder you're standing in, and
 * leaving is what ends it.
 */
export interface FilesBrowseState {
  view: 'grid' | 'list';
  sort: FileSortKey;
  /**
   * The type filter and the search query, tagged with the folder they were set
   * on. The tag is what separates "opened a file" from "went somewhere else":
   * the preview doesn't change the folder, so the narrowing outlives it, while
   * any real navigation lands on a path these no longer match and the grid
   * starts the folder clean.
   */
  narrowing: { path: string; typeFilter: FileTypeFilter; query: string };
}

const EMPTY_NARROWING = { path: '', typeFilter: 'all' as FileTypeFilter, query: '' };

const DEFAULT_FILES_BROWSE: FilesBrowseState = {
  view: 'grid',
  sort: 'recent',
  narrowing: EMPTY_NARROWING,
};

/**
 * Views that render a list panel beside the icon rail. Everything else takes
 * over the full detail area, so the sidebar collapses down to the rail.
 */
export const VIEWS_WITH_LIST: ReadonlySet<ViewMode> = new Set<ViewMode>([
  'threads', 'files', 'knowledge',
]);

/**
 * Per-view list-panel preference, persisted in a cookie so it survives reloads
 * and is readable during SSR. Keyed by view because the habit differs per
 * surface — you might keep the thread list open but read files full-width.
 */
const LIST_PREFS_COOKIE = 'oa-list-open';
const LIST_PREFS_MAX_AGE = 60 * 60 * 24 * 365;

type ListPrefs = Partial<Record<ViewMode, boolean>>;

function readListPrefs(): ListPrefs {
  if (typeof document === 'undefined') return {};
  const match = document.cookie.match(new RegExp(`(?:^|; )${LIST_PREFS_COOKIE}=([^;]*)`));
  if (!match) return {};
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return {};
  }
}

function writeListPrefs(prefs: ListPrefs) {
  if (typeof document === 'undefined') return;
  const value = encodeURIComponent(JSON.stringify(prefs));
  document.cookie = `${LIST_PREFS_COOKIE}=${value}; path=/; max-age=${LIST_PREFS_MAX_AGE}; samesite=lax`;
}

/**
 * Whether the icon rail is expanded to show labels. Persisted the same way as
 * the list preference so the shell comes back the way it was left.
 */
const RAIL_COOKIE = 'oa-rail-expanded';

function readRailPref(): boolean {
  if (typeof document === 'undefined') return false;
  // Expanded by default — only an explicit collapse (cookie =0) folds the rail.
  return !new RegExp(`(?:^|; )${RAIL_COOKIE}=0`).test(document.cookie);
}

function writeRailPref(expanded: boolean) {
  if (typeof document === 'undefined') return;
  document.cookie = `${RAIL_COOKIE}=${expanded ? '1' : '0'}; path=/; max-age=${LIST_PREFS_MAX_AGE}; samesite=lax`;
}

/**
 * The rail's widths. The expanded default matches the Computer sidebar, which
 * is 16rem. Dragging stays between the minimum that still fits a project name
 * and a cap that leaves the conversation room.
 */
export const RAIL_WIDTH_COLLAPSED = 52;
export const RAIL_WIDTH_DEFAULT = 256;
export const RAIL_WIDTH_MIN = 220;
export const RAIL_WIDTH_MAX = 480;
export const RAIL_WIDTH_EXPANDED = RAIL_WIDTH_DEFAULT;

const RAIL_WIDTH_COOKIE = 'oa-rail-width';

function readRailWidth(): number {
  if (typeof document === 'undefined') return RAIL_WIDTH_DEFAULT;
  const match = document.cookie.match(new RegExp(`(?:^|; )${RAIL_WIDTH_COOKIE}=(\\d+)`));
  const width = match ? Number(match[1]) : RAIL_WIDTH_DEFAULT;
  if (!Number.isFinite(width)) return RAIL_WIDTH_DEFAULT;
  return Math.max(RAIL_WIDTH_MIN, Math.min(RAIL_WIDTH_MAX, width));
}

function writeRailWidth(width: number) {
  if (typeof document === 'undefined') return;
  document.cookie = `${RAIL_WIDTH_COOKIE}=${width}; path=/; max-age=${LIST_PREFS_MAX_AGE}; samesite=lax`;
}

/** Where a drag from `start` by `delta` pixels leaves the rail. */
export function nextRailDrag(start: number, delta: number): { expanded: boolean; width: number } {
  const next = Math.round(start + delta);
  if (next < RAIL_WIDTH_MIN) return { expanded: false, width: start >= RAIL_WIDTH_MIN ? start : RAIL_WIDTH_DEFAULT };
  return { expanded: true, width: Math.min(RAIL_WIDTH_MAX, next) };
}

/** On mobile, which pane is showing: the list or the detail */
export type MobilePane = 'list' | 'detail';
export type DeviceSetupMethod = 'desktop' | 'terminal' | 'agent';
export type ConnectSetupRequest = { method: DeviceSetupMethod | 'cloud' };

/** Which device agent's full settings to open, and the device it is on. */
export interface EditAgentRequest {
  agentName: string;
  nodeId: string;
}

interface LayoutState {
  selectedBrowser: ArtifactReference | null;
  browserView: BrowserView | null;
  browserWatchOnly: boolean;
  setBrowserView: (view: BrowserView, browser?: ArtifactReference, watchOnly?: boolean) => void;
  hasSavedThreadView: boolean;
  applyThreadArtifactDefault: (artifact: ArtifactReference | null, unavailable?: boolean) => void;
  conversationWidth: number;
  setConversationWidth: (width: number) => void;
  selectedArtifact: ArtifactReference | null;
  setSelectedArtifact: (artifact: ArtifactReference | null) => void;
  openArtifact: (artifact: ArtifactReference) => void;
  isMobile: boolean;
  /** Whether the list panel beside the rail is showing (the sidebar's open state) */
  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarToggle: () => void;
  viewMode: ViewMode;
  /** The view being switched to, ahead of `viewMode` while the switch renders —
   *  what the rail highlights, so a click answers at once. */
  railViewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  /** Switch view and open/collapse the list panel to match it */
  openView: (mode: ViewMode) => void;
  openConnectSetup: (method: ConnectSetupRequest['method']) => void;
  connectSetupRequest: ConnectSetupRequest | null;
  /** Open Connect Agents on its Cloud Agents tab. */
  openCloudAgents: () => void;
  /** Set by `openCloudAgents` until the connect view acts on it. */
  cloudAgentsPending: boolean;
  /** The connect view calls this once it has switched to Cloud Agents. */
  consumeCloudAgents: () => void;
  /** Open Connect Agents straight on the add-agent gallery of a device. */
  openAddAgent: () => void;
  /** Set by `openAddAgent` until the connect view acts on it. */
  addAgentPending: boolean;
  /** The connect view calls this once it has opened the gallery. */
  consumeAddAgent: () => void;
  /** Close the agent profile and open Connect Agents on the full settings of
   * one device agent. */
  openEditAgent: (request: EditAgentRequest) => void;
  /** Set by `openEditAgent` until the devices tab acts on it. */
  editAgentPending: EditAgentRequest | null;
  /** The devices tab calls this once it has acted on the request. */
  consumeEditAgent: () => void;
  threadFilter: 'all' | 'starred' | 'archived' | 'dms';
  setThreadFilter: (filter: 'all' | 'starred' | 'archived' | 'dms') => void;
  selectedAgentName: string | null;
  setSelectedAgentName: (name: string | null) => void;
  isAgentPanelOpen: boolean;
  /** Which pane is visible on mobile (ignored on desktop) */
  mobilePane: MobilePane;
  /** Navigate to detail pane on mobile */
  openMobileDetail: () => void;
  /** Navigate back to list pane on mobile */
  openMobileList: () => void;
  /** Whether the detail pane is expanded to full width (collapses the list panel) */
  isDetailExpanded: boolean;
  toggleDetailExpanded: () => void;
  /** Whether the current view has a list panel at all */
  selectedRoutineId: string | null;
  setSelectedRoutineId: (id: string | null) => void;
  hasListPanel: boolean;
  /** Whether the icon rail is widened to show its labels */
  isRailExpanded: boolean;
  /** Width of the rail while it is expanded. Collapsed stays at the icon width. */
  railExpandedWidth: number;
  /** Live width while a drag is in progress. Null the rest of the time. */
  railDragWidth: number | null;
  railResizing: boolean;
  beginRailResize: () => void;
  /** `width` is the rail width the pointer is asking for, in pixels. */
  resizeRail: (width: number) => void;
  endRailResize: () => void;
  toggleRail: () => void;
  setRailExpanded: (expanded: boolean) => void;
  /** Show an artifact side-by-side with chat */
  splitBrowser: boolean;
  setSplitBrowser: (v: boolean) => void;
  /** Whether the artifact preview panel is currently showing */
  showBrowserPreview: boolean;
  setShowBrowserPreview: (v: boolean) => void;
  /** Whether the New Thread dialog (agent picker) is open */
  newThreadOpen: boolean;
  setNewThreadOpen: (v: boolean) => void;
  /** Open the New Thread dialog so the user can pick agents for a new session */
  openNewThread: () => void;
  /**
   * Which half of the Files view the folder panel is pointing at: the folder
   * tree, or the trash. The detail pane swaps wholesale between them.
   */
  filesSection: FilesSection;
  setFilesSection: (section: FilesSection) => void;
  /** View, sort, type filter and search for the Files grid; see {@link FilesBrowseState}. */
  filesBrowse: FilesBrowseState;
  /** Patch one part of it and leave the rest alone. */
  setFilesBrowse: (updates: Partial<FilesBrowseState>) => void;
  /**
   * Hand-off from other views (e.g. an Inbox notification) into the Issues
   * view: the issue to open on arrival. IssuesView consumes and clears it.
   */
  pendingIssueId: string | null;
  setPendingIssueId: (id: string | null) => void;
}

const LayoutContext = createContext<LayoutState | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const { workspace, currentUser, currentSessionId } = useWorkspace();
  const threadView = useThreadViewState(workspace?.workspaceId || '', currentUser.id, currentSessionId || '');
  const { selectedArtifact, selectedBrowser, browserView, browserWatchOnly, previewOpen: showBrowserPreview, conversationWidth } = threadView.state;
  const setSelectedArtifact = useCallback((artifact: ArtifactReference | null) => threadView.update({ selectedArtifact: artifact }), [threadView.update]);
  const setShowBrowserPreview = useCallback((open: boolean) => threadView.update({ previewOpen: open }), [threadView.update]);
  const setBrowserView = useCallback((view: BrowserView, browser?: ArtifactReference, watchOnly = false) => threadView.update({ browserView: view, browserWatchOnly: watchOnly, ...(view === 'closed' ? { selectedBrowser: null } : browser ? { selectedBrowser: browser } : {}) }), [threadView.update]);
  const setConversationWidth = useCallback((width: number) => threadView.update({ conversationWidth: width }), [threadView.update]);
  const [threadFilter, setThreadFilter] = useState<'all' | 'starred' | 'archived' | 'dms'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('threads');
  useEffect(() => {
    const resource = requestedResource(window.location.href);
    if (resource) setViewMode(keptView(resource.view));
    // `?view=connect` from a settings page: open Manage Agents, then drop the
    // parameter so a reload lands on the workspace as usual.
    const view = requestedView(window.location.href);
    if (view) {
      setViewMode(keptView(view));
      window.history.replaceState(window.history.state, '', withoutRequestedView(window.location.href));
    }
  }, []);
  const [filesSection, setFilesSection] = useState<FilesSection>('folders');
  const [filesBrowse, setFilesBrowseState] = useState<FilesBrowseState>(DEFAULT_FILES_BROWSE);
  const setFilesBrowse = useCallback((updates: Partial<FilesBrowseState>) => {
    setFilesBrowseState((prev) => ({ ...prev, ...updates }));
  }, []);
  const [listPrefs, setListPrefs] = useState<ListPrefs>({});
  const [selectedAgentName, setSelectedAgentName] = useState<string | null>(null);
  const [pendingIssueId, setPendingIssueId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>('list');
  useEffect(() => {
    if (requestedResource(window.location.href)?.id || /\/threads\//.test(window.location.pathname) || new URLSearchParams(window.location.search).has('thread')) setMobilePane('detail');
  }, []);
  const splitBrowser = true;
  const handleSetSplitBrowser = (v: boolean) => { if (!v) setShowBrowserPreview(false); };
  const [isRailExpanded, setIsRailExpanded] = useState(false);
  const [railExpandedWidth, setRailExpandedWidth] = useState(RAIL_WIDTH_DEFAULT);
  const [railResizing, setRailResizing] = useState(false);
  const [railDragWidth, setRailDragWidth] = useState<number | null>(null);
  const railExpandedRef = useRef(isRailExpanded);
  const railWidthRef = useRef(railExpandedWidth);
  railExpandedRef.current = isRailExpanded;
  railWidthRef.current = railExpandedWidth;
  const openArtifact = useCallback((artifact: ArtifactReference) => {
    if (artifact.kind === 'browser') threadView.update({ selectedBrowser: artifact, browserView: 'compact', browserWatchOnly: false });
    else threadView.update({ selectedArtifact: artifact, previewOpen: true });
    setMobilePane('detail');
  }, [threadView.update]);
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const openNewThread = () => { setNewThreadOpen(true); };

  // Read on mount rather than in the initial state, so the server render and the
  // first client render agree before the stored preference is applied.
  useEffect(() => {
    setListPrefs(readListPrefs());
    setIsRailExpanded(readRailPref());
    setRailExpandedWidth(readRailWidth());
  }, []);

  // Persist outside the state updater: React may run an updater more than once
  // (StrictMode, concurrent renders), and writing a cookie from there is a
  // side effect in the render phase.
  const setRailExpanded = (expanded: boolean) => {
    setIsRailExpanded(expanded);
    writeRailPref(expanded);
  };

  const toggleRail = () => setRailExpanded(!isRailExpanded);

  const beginRailResize = () => setRailResizing(true);
  const resizeRail = (width: number) => {
    const shown = Math.max(RAIL_WIDTH_COLLAPSED, Math.min(RAIL_WIDTH_MAX, Math.round(width)));
    setRailDragWidth(shown);
    const result = nextRailDrag(width, 0);
    if (!result.expanded) {
      if (railExpandedRef.current) setRailExpanded(false);
      return;
    }
    if (railWidthRef.current !== result.width) {
      railWidthRef.current = result.width;
      setRailExpandedWidth(result.width);
    }
    if (!railExpandedRef.current) setRailExpanded(true);
  };
  const endRailResize = () => {
    setRailResizing(false);
    setRailDragWidth(null);
    writeRailWidth(railWidthRef.current);
  };

  const isAgentPanelOpen = selectedAgentName !== null;
  const openMobileDetail = () => setMobilePane('detail');
  const openMobileList = () => setMobilePane('list');

  // In the app-shell-4 layout the list lives *inside* the sidebar, so
  // "expand the detail pane" and "collapse the sidebar" are the same gesture.
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const hasListPanel = VIEWS_WITH_LIST.has(viewMode);
  // Default to open the first time a view is used; after that the user's own
  // choice for that view wins.
  const isSidebarOpen = hasListPanel ? (viewMode === 'threads' ? threadView.state.sidebarOpen : null) ?? listPrefs[viewMode] ?? true : false;

  const setSidebarOpen = (open: boolean) => {
    if (!hasListPanel) return; // nothing to remember for full-width views
    if (viewMode === 'threads') threadView.update({ sidebarOpen: open });
    const next = { ...listPrefs, [viewMode]: open };
    setListPrefs(next);
    writeListPrefs(next);
  };

  const isDetailExpanded = !isSidebarOpen;
  const toggleDetailExpanded = () => setSidebarOpen(!isSidebarOpen);
  const sidebarToggle = () => setSidebarOpen(!isSidebarOpen);

  // Switching views keeps whatever the user last chose for the target view.
  // The switch renders as a transition: revealing a kept-alive view re-runs
  // all of its effects, and rendered as an urgent update that held the click
  // (and on Windows the whole window) until it was done. The rail follows the
  // optimistic value, so the click still answers immediately.
  const [, startViewTransition] = useTransition();
  const [railViewMode, setRailViewMode] = useOptimistic(viewMode);
  const openView = (mode: ViewMode) => {
    const next = keptView(mode);
    startViewTransition(() => {
      setRailViewMode(next);
      setViewMode(next);
      // Files is the exception: its list pane is a folder tree, and what you want
      // on opening it is usually the file you or an agent just added — which is
      // the detail pane's recent listing. The tree stays one tap away, and any
      // folder already selected is what the pane opens on.
      setMobilePane(next === 'files' ? 'detail' : 'list');
    });
  };

  const [connectSetupRequest, setConnectSetupRequest] = useState<ConnectSetupRequest | null>(null);
  const openConnectSetup = (method: ConnectSetupRequest['method']) => {
    // A fresh request also handles choosing the same location after changing modes manually.
    setConnectSetupRequest({ method });
    openView('connect');
  };

  const [cloudAgentsPending, setCloudAgentsPending] = useState(false);
  const openCloudAgents = () => {
    setCloudAgentsPending(true);
    openView('connect');
  };
  const consumeCloudAgents = useCallback(() => setCloudAgentsPending(false), []);

  const [addAgentPending, setAddAgentPending] = useState(false);
  const openAddAgent = () => {
    setAddAgentPending(true);
    openView('connect');
  };
  const consumeAddAgent = useCallback(() => setAddAgentPending(false), []);

  const [editAgentPending, setEditAgentPending] = useState<EditAgentRequest | null>(null);
  const openEditAgent = (request: EditAgentRequest) => {
    setSelectedAgentName(null);
    // A fresh object per click, so asking again for the same agent re-runs.
    setEditAgentPending({ ...request });
    openView('connect');
  };
  const consumeEditAgent = useCallback(() => setEditAgentPending(null), []);

  // Sidebar widths now come from <SidebarProvider> (components/ui/sidebar).
  const cssVariables = useMemo(() => ({
    '--header-height-mobile': '60px',
  } as React.CSSProperties), []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    Object.entries(cssVariables).forEach(([prop, val]) => {
      html.style.setProperty(prop, val as string);
    });

    body.setAttribute('data-sidebar-open', isSidebarOpen.toString());

    return () => {
      Object.keys(cssVariables).forEach((prop) => {
        html.style.removeProperty(prop);
      });
      body.removeAttribute('data-sidebar-open');
    };
    // `data-sidebar-open` is kept on <body> so page-level styles can react to
    // the rail state even though the sidebar itself owns the widths now.
  }, [cssVariables, isSidebarOpen]);

  return (
    <LayoutContext.Provider value={{
      isMobile,
      isSidebarOpen,
      setSidebarOpen,
      sidebarToggle,
      viewMode,
      railViewMode,
      setViewMode,
      filesSection,
      setFilesSection,
      filesBrowse,
      setFilesBrowse,
      pendingIssueId,
      setPendingIssueId,
      openView,
      openConnectSetup,
      connectSetupRequest,
      openCloudAgents,
      cloudAgentsPending,
      consumeCloudAgents,
      openAddAgent,
      addAgentPending,
      consumeAddAgent,
      openEditAgent,
      editAgentPending,
      consumeEditAgent,
      threadFilter,
      setThreadFilter,
      selectedAgentName,
      setSelectedAgentName,
      isAgentPanelOpen,
      mobilePane,
      openMobileDetail,
      openMobileList,
      isDetailExpanded,
      toggleDetailExpanded,
      hasListPanel,
      selectedRoutineId, setSelectedRoutineId,
      isRailExpanded,
      railExpandedWidth,
      railDragWidth,
      railResizing,
      beginRailResize,
      resizeRail,
      endRailResize,
      toggleRail,
      setRailExpanded,
      splitBrowser,
      setSplitBrowser: handleSetSplitBrowser,
      selectedArtifact, setSelectedArtifact, openArtifact,
      selectedBrowser, browserView, browserWatchOnly, setBrowserView,
      hasSavedThreadView: threadView.hasSavedView,
      applyThreadArtifactDefault: threadView.applyDefault,
      conversationWidth, setConversationWidth,
      showBrowserPreview,
      setShowBrowserPreview,
      newThreadOpen,
      setNewThreadOpen,
      openNewThread,
    }}>
      <div data-slot="layout-wrapper" className="flex grow">
        <TooltipProvider delayDuration={0}>
          {children}
        </TooltipProvider>
      </div>
    </LayoutContext.Provider>
  );
}

export const useLayout = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
};
