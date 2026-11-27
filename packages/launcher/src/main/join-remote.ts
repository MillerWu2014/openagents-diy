import { joinApiUrl, type JoinTarget } from "../shared/join-link"

export interface JoinedRemote {
  slug: string
  workspaceName: string
  apiUrl: string
  memberToken: string
}

interface InvitePeek {
  workspaceName?: string
  status?: string
}

/** Ask the other computer to add this person to the one project the code names. */
export async function redeemInvite(target: JoinTarget, displayName: string): Promise<JoinedRemote> {
  const name = displayName.trim()
  if (!name || name.length > 80) throw new Error("join:name")
  const apiUrl = joinApiUrl(target)
  const code = encodeURIComponent(target.code)
  let peek: InvitePeek
  try {
    const res = await fetch(`${apiUrl}/v1/invites/${code}`, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) throw new Error("join:missing")
    peek = ((await res.json()) as { data?: InvitePeek }).data || {}
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("join:")) throw err
    throw new Error("join:unreachable")
  }
  if (peek.status && peek.status !== "pending") throw new Error("join:unavailable")
  const accepted = await fetch(`${apiUrl}/v1/invites/${code}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: name }),
    signal: AbortSignal.timeout(8_000),
  })
  const payload = await accepted.json().catch(() => null) as { data?: JoinedRemote & { memberToken?: string }; message?: string } | null
  if (!accepted.ok || !payload?.data?.memberToken || !payload.data.slug) {
    throw new Error(payload?.message || "join:failed")
  }
  return {
    slug: payload.data.slug,
    workspaceName: payload.data.workspaceName || peek.workspaceName || payload.data.slug,
    apiUrl,
    memberToken: payload.data.memberToken,
  }
}
