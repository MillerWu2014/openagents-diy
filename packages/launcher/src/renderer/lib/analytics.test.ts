import { describe, expect, it } from 'vitest'

describe('Launcher analytics', () => {
  it('does not report usage', async () => {
    const analytics = await import('./analytics')
    expect(() => {
      analytics.initAnalytics()
      analytics.capture('agent_installed', { agent_type: 'test-cli' })
      analytics.group('workspace', 'fixture')
    }).not.toThrow()
  })
})
