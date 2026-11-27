import { describe, expect, it } from "vitest"

import { parseJoinUrl } from "../shared/join-link"

describe("parseJoinUrl", () => {
  it("reads a project invite", () => {
    expect(parseJoinUrl("openagents://join?host=192.168.1.5&port=18765&code=abc_def")).toEqual({
      host: "192.168.1.5",
      port: 18765,
      code: "abc_def",
    })
  })

  it("refuses a website link and a project token stuffed into the address", () => {
    expect(parseJoinUrl("https://workspace.openagents.org/invite/abc")).toBeNull()
    expect(parseJoinUrl("openagents://join?host=192.168.1.5/secret&port=18765&code=abc")).toBeNull()
    expect(parseJoinUrl("openagents://join?host=192.168.1.5&port=18765&code=")).toBeNull()
  })
})
