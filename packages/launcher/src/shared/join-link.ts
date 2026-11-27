/** An invitation another computer on the network can redeem. */

export interface JoinTarget {
  host: string
  port: number
  code: string
}

const NAME = /^[a-zA-Z0-9.-]+$/

function hostOk(host: string): boolean {
  if (!host || host.length > 253 || !NAME.test(host)) return false
  if (!host.includes(".")) return host === "localhost"
  const parts = host.split(".")
  if (parts.every((part) => /^\d+$/.test(part))) {
    return parts.length === 4 && parts.every((part) => Number(part) <= 255)
  }
  return parts.every((part) => part.length > 0 && part.length <= 63)
}

/** `openagents://join?host=&port=&code=` — anything else is not an invite. */
export function parseJoinUrl(raw: string): JoinTarget | null {
  let url: URL
  try { url = new URL(raw.trim()) } catch { return null }
  if (url.protocol !== "openagents:" || url.hostname !== "join") return null
  const host = url.searchParams.get("host")?.trim() || ""
  const port = Number(url.searchParams.get("port") || "18765")
  const code = url.searchParams.get("code")?.trim() || ""
  if (!hostOk(host)) return null
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  if (!code || code.length > 200 || /[\s/]/.test(code)) return null
  return { host, port, code }
}

export function joinApiUrl(target: JoinTarget): string {
  return `http://${target.host}:${target.port}`
}
