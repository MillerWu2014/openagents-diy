import { expect, it } from "vitest"
import { agentsToMove } from "./adopt-project"

const installed = [
  { name: "codex", network: "blog", path: "/tmp/blog" },
  { name: "cursor", network: "blog", path: "/tmp/blog" },
  { name: "spare", network: "blog", path: "/tmp/blog" },
]

it("moves a project's agents off the project they are still listening to", () => {
  expect(agentsToMove(["codex", "cursor"], installed, "stands", "/tmp/stands")).toEqual(["codex", "cursor"])
})

it("leaves an agent that is already on the project and its folder", () => {
  expect(agentsToMove(["codex", "missing"], installed, "blog", "/tmp/blog")).toEqual([])
})

it("moves an agent whose folder is still the previous project's", () => {
  expect(agentsToMove(["codex"], installed, "blog", "/tmp/stands")).toEqual(["codex"])
})
