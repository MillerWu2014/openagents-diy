/** Turn `\(...\)` and `\[...\]` into the `$` / `$$` form the markdown math parser reads.
 *  CommonMark otherwise eats the backslash and the formula stays plain text.
 *  Fenced and inline code are left untouched, including a fence that is still open. */
export function promoteLatexDelimiters(source: string): string {
  const chunks: string[] = []
  const re = /```[\s\S]*?(?:```|$)/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    chunks.push(convertOutsideInlineCode(source.slice(last, match.index)))
    chunks.push(match[0])
    last = match.index + match[0].length
  }
  chunks.push(convertOutsideInlineCode(source.slice(last)))
  return chunks.join('')
}

function convertOutsideInlineCode(source: string): string {
  return source.replace(/`[^`\n]*`|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/g, (token) => {
    if (token.startsWith('`')) return token
    const tex = token.slice(2, -2).trim()
    return token.startsWith('\\[') ? `\n$$\n${tex}\n$$\n` : `$${tex}$`
  })
}
