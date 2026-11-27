import React from "react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { WorkspaceQuickConnect } from "./WorkspaceQuickConnect"

vi.mock("../../lib/analytics", () => ({ capture: vi.fn(), group: vi.fn() }))

type Api = Record<string, ReturnType<typeof vi.fn>>

function installApi(overrides: Partial<Api> = {}): Api {
  const api: Api = {
    connectNode: vi.fn().mockResolvedValue({
      connected: true,
      workspaceSlug: "project",
      workspaceName: "Project",
      warning: null,
    }),
    getSetting: vi.fn().mockResolvedValue("http://127.0.0.1:18765"),
    listAgents: vi.fn().mockResolvedValue([{ name: "lonely", displayName: null, type: "claude", state: "stopped", health: null }]),
    selectDirectory: vi.fn().mockResolvedValue("/tmp/market"),
    createLocalProject: vi.fn().mockResolvedValue({ slug: "abcd", name: "Market", token: "tok" }),
    openExternal: vi.fn(),
    ...overrides,
  }
  ;(window as unknown as { api: Api }).api = api
  return api
}

const showToast = vi.fn()
const onClose = vi.fn()
const onCreated = vi.fn()

function renderDialog(): void {
  render(
    <WorkspaceQuickConnect
      open
      onClose={onClose}
      onCreated={onCreated}
      showToast={showToast}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("WorkspaceQuickConnect — local projects", () => {
  it("does not ask for a pairing code", async () => {
    installApi()
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    ))
    renderDialog()
    expect(await screen.findByRole("heading", { name: /join a project on this computer/i })).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: /^pairing code$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "workspace.openagents.org" })).not.toBeInTheDocument()
    expect(screen.queryByText(/how do i get a pairing code/i)).not.toBeInTheDocument()
  })

  it("joins a project on this computer without a code", async () => {
    const api = installApi()
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).endsWith("/v1/local/projects")) {
        return new Response(JSON.stringify({ data: [{ slug: "project", name: "Project", token: "t" }] }), { status: 200 })
      }
      if (String(url).endsWith("/v1/local/pair")) {
        return new Response(JSON.stringify({ data: { code: "ABCD2345", slug: "project", name: "Project" } }), { status: 200 })
      }
      return new Response("no", { status: 404 })
    }))
    renderDialog()
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: /join project/i }))
    await waitFor(() => expect(api.connectNode).toHaveBeenCalledWith("ABCD2345"))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onCreated).toHaveBeenCalled()
    expect(api.openExternal).not.toHaveBeenCalled()
  })
})
