// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectSwitcher } from './project-switcher';

const state = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/lib/i18n', () => ({ useT: () => (key: string) => key }));
vi.mock('@/components/ui/dropdown-menu', () => {
  const wrap = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  const item = ({ children, onSelect }: { children?: React.ReactNode; onSelect?: () => void }) =>
    React.createElement('button', { onClick: onSelect }, children);
  return {
    DropdownMenu: wrap,
    DropdownMenuContent: wrap,
    DropdownMenuLabel: wrap,
    DropdownMenuTrigger: wrap,
    DropdownMenuCheckboxItem: item,
  };
});
vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.stubGlobal('fetch', vi.fn(async () => ({
  status: 200,
  json: async () => ({ data: [
    { slug: 'blog', name: 'blog', token: 't1', directory: '/tmp/blog' },
    { slug: 'stands', name: '机位分配', token: 't2', directory: '/tmp/stands' },
  ] }),
})));

let root: Root;
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
  state.push.mockClear();
});

it('lists projects and opens the one that is not current', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root.render(React.createElement(ProjectSwitcher, { name: 'blog', slug: 'blog' })); });
  await act(async () => { await Promise.resolve(); });
  expect(document.body.textContent).toContain('blog');
  expect(document.body.textContent).toContain('机位分配');
  expect(document.body.textContent).toContain('/tmp/stands');
  const other = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('机位分配'))!;
  await act(async () => other.click());
  expect(state.push).toHaveBeenCalledWith('/stands?token=t2');
  const current = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('/tmp/blog'))!;
  await act(async () => current.click());
  expect(state.push).toHaveBeenCalledTimes(1);
});
