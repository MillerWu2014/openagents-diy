// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import Page from '../app/[workspaceId]/page';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), fetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('@/lib/openagents-auth-context', () => ({ useOpenAgentsAuth: () => ({ user: null, idToken: null, loading: false, isOpenAgentsDomain: false }) }));
vi.mock('@/lib/workspace-context', () => ({ WorkspaceProvider: ({ children }: React.PropsWithChildren) => children, useWorkspace: () => ({ currentUser: { name: 'Test' }, setUserName: vi.fn() }) }));
vi.mock('@/components/layout/layout-context', () => ({ LayoutProvider: ({ children }: React.PropsWithChildren) => children }));
vi.mock('@/components/layout/wrapper', () => ({ Wrapper: () => React.createElement('div', null, 'Workspace opened') }));
vi.mock('@/lib/i18n', () => ({ useT: () => (key: string) => key }));

it('opens the local project when the restored id is a different workspace', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, fetch: mocks.fetch });
  mocks.replace.mockClear();
  mocks.fetch.mockResolvedValue({
    status: 200,
    json: async () => ({ data: { slug: 'project', token: 'local-project' } }),
  });
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => { root.render(React.createElement(Page, { params: Promise.resolve({ workspaceId: '339a8bcf' }) })); });
    expect(mocks.replace).toHaveBeenCalledWith('/project?token=local-project');
  } finally { await act(async () => root.unmount()); }
});

it('shows a retry instead of staying on the splash when the local project is missing', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, fetch: mocks.fetch });
  mocks.fetch.mockResolvedValue({ status: 404, json: async () => ({ detail: 'Not Found' }) });
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => { root.render(React.createElement(Page, { params: Promise.resolve({ workspaceId: 'project' }) })); });
    expect(host.textContent).toContain('workspaceGate.loadFailedTitle');
    expect(host.textContent).toContain('common.retry');
  } finally { await act(async () => root.unmount()); }
});
