import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({ app: { getPath: () => "/tmp" } }))

import { localWorkspaceUrl, servesLocalWorkspace } from "./local-workspace"

describe("servesLocalWorkspace", () => {
  it("starts the local server when the saved address is this computer", () => {
    expect(servesLocalWorkspace(undefined)).toBe(true)
    expect(servesLocalWorkspace(localWorkspaceUrl())).toBe(true)
    expect(servesLocalWorkspace("https://example.com")).toBe(false)
  })
})
