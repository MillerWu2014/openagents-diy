import { expect, it } from 'vitest'
import { promoteLatexDelimiters } from './latex-delimiters'

it('turns display and inline latex into dollar math', () => {
  const source = '候选记忆 \\(\\tilde c_t\\) 由\n\n\\[\nc_t=f_t\\odot c_{t-1}\n\\]\n'
  expect(promoteLatexDelimiters(source)).toBe('候选记忆 $\\tilde c_t$ 由\n\n\n$$\nc_t=f_t\\odot c_{t-1}\n$$\n\n')
})

it('leaves formulas inside code alone', () => {
  const source = '```\n\\[c_t\\]\n```\n`\\(a\\)`\n\\(b\\)\n```\n\\[c\\]'
  expect(promoteLatexDelimiters(source)).toBe('```\n\\[c_t\\]\n```\n`\\(a\\)`\n$b$\n```\n\\[c\\]')
})
