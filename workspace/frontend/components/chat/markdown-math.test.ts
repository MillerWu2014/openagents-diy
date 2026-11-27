import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('./mermaid-block', () => ({ MermaidBlock: () => null }));
import { MarkdownContent } from './markdown-content';

it('renders latex delimiters as formulas', () => {
  const html = renderToStaticMarkup(createElement(MarkdownContent, {
    content: '候选记忆 \\(\\tilde c_t\\) 由\n\n\\[\nc_t=f_t\\odot c_{t-1}\n\\]',
    agentNames: [],
  }));
  expect(html).toContain('class="katex"');
  expect(html).toContain('katex-display');
  expect(html).toContain('⊙');
});
