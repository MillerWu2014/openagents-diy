// This fork does not report usage anywhere. The functions stay so existing
// call sites compile; they never open a network connection.
export function initAnalytics(): void {}

export function capture(_event: string, _properties?: Record<string, unknown>): void {}

export function group(_groupType: string, _groupKey: string, _properties?: Record<string, unknown>): void {}
