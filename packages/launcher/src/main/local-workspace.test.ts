import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({ app: { getPath: () => "/tmp" } }))

import { localWorkspaceUrl, routerEnv, servesLocalWorkspace } from "./local-workspace"

describe("servesLocalWorkspace", () => {
  it("starts the local server when the saved address is this computer", () => {
    expect(servesLocalWorkspace(undefined)).toBe(true)
    expect(servesLocalWorkspace(localWorkspaceUrl())).toBe(true)
    expect(servesLocalWorkspace("https://example.com")).toBe(false)
  })
})

describe("routerEnv", () => {
  it("turns the router setting into backend env and enables handoffs", () => {
    expect(routerEnv(undefined)).toEqual({})
    expect(routerEnv({ baseUrl: " ", model: "m" })).toEqual({})
    const env = routerEnv({ baseUrl: " http://127.0.0.1:11434/v1 ", apiKey: "", model: "qwen3" })
    expect(env.ROUTER_LLM_PROVIDER).toBe("openai")
    expect(env.ROUTER_LLM_BASE_URL).toBe("http://127.0.0.1:11434/v1")
    expect(env.ROUTER_LLM_API_KEY).not.toBe("")
    expect(env.ROUTER_LLM_MODEL).toBe("qwen3")
    expect(env.COMPLETION_ROUTING_ENABLED).toBe("true")
    expect(routerEnv({ baseUrl: "u", apiKey: "sk-1", model: "m" }).ROUTER_LLM_API_KEY).toBe("sk-1")
  })
})
