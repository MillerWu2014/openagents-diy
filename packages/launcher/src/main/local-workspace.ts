/**
 * The desktop app opens one local project. The packaged UI asks
 * `/v1/local/project` on whatever API it was given; the hosted API answers
 * 404 and the page stays on the loading splash. This starts that API on
 * this computer, with a SQLite file in the app's own data directory. Another
 * computer can reach only an invite and, after joining, that one project.
 */
import { execFileSync, spawn, type ChildProcess } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"
import { app } from "electron"

import { slog } from "./bootstrap/startup-log"

export const LOCAL_WORKSPACE_PORT = 18765

export function localWorkspaceUrl(): string {
  return `http://127.0.0.1:${LOCAL_WORKSPACE_PORT}`
}

/** The saved endpoint is this computer's project API, so the process has to be running. */
export function servesLocalWorkspace(endpoint: string | undefined): boolean {
  return !endpoint || endpoint === localWorkspaceUrl()
}

let child: ChildProcess | null = null

export function stopLocalWorkspace(): void {
  const proc = child
  child = null
  if (!proc || proc.killed) return
  proc.kill()
}

function backendDir(): string | null {
  const candidates = [
    process.env.OPENAGENTS_WORKSPACE_BACKEND,
    process.resourcesPath ? path.join(process.resourcesPath, "workspace-backend") : "",
    path.resolve(__dirname, "../../../../workspace/backend"),
    path.resolve(__dirname, "../../../workspace/backend"),
  ]
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, "app", "main.py"))) return dir
  }
  return null
}

function canImport(bin: string, cwd: string): boolean {
  try {
    execFileSync(bin, ["-c", "import fastapi, uvicorn, sqlalchemy"], {
      cwd,
      timeout: 20_000,
      stdio: "ignore",
    })
    return true
  } catch {
    return false
  }
}

function pythonBin(cwd: string): string | null {
  const home = os.homedir()
  const listed = [
    process.env.OPENAGENTS_PYTHON,
    path.join(home, "miniconda3/bin/python3"),
    path.join(home, "anaconda3/bin/python3"),
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python3",
  ].filter((bin): bin is string => !!bin && fs.existsSync(bin))
  for (const bin of listed) {
    if (canImport(bin, cwd)) return bin
  }
  if (canImport("python3", cwd)) return "python3"
  try {
    const found = execFileSync("/bin/zsh", ["-lc", "command -v python3"], {
      encoding: "utf8",
      timeout: 8_000,
    })
      .trim()
      .split("\n")
      .pop()
    if (found && canImport(found, cwd)) return found
  } catch {
    /* A login shell is only a fallback for a Python that is not on the default path. */
  }
  return null
}

function sqliteUrl(file: string): string {
  // sqlite:/// plus an absolute path. Encoding the space makes SQLAlchemy
  // open "Application%20Support", which does not exist, and every request 500s.
  return `sqlite:///${file}`
}

async function healthy(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/v1/local/project`, { signal: AbortSignal.timeout(800) })
    return res.ok
  } catch {
    return false
  }
}

/** Start the loopback API if it is not already answering. */
export async function ensureLocalWorkspace(): Promise<boolean> {
  const url = localWorkspaceUrl()
  if (await healthy(url)) {
    slog(`[local-workspace] already up at ${url}`)
    return true
  }
  const dir = backendDir()
  if (!dir) {
    slog("[local-workspace] backend source not found")
    return false
  }
  const python = pythonBin(dir)
  if (!python) {
    slog(`[local-workspace] no Python with fastapi, uvicorn and sqlalchemy (backend ${dir})`)
    return false
  }
  const db = path.join(app.getPath("userData"), "local-workspace.sqlite")
  child = spawn(
    python,
    ["-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", String(LOCAL_WORKSPACE_PORT)],
    {
      cwd: dir,
      env: {
        ...process.env,
        DATABASE_URL: sqliteUrl(db),
        BACKGROUND_JOBS_ENABLED: "false",
        CORS_ORIGINS: "*",
        // The process listens on the network so an invite can be redeemed.
        // Everything except that invite, and a member of the project, stays
        // on this computer. See app/lan_guard.py.
        LOCAL_LAN_GUARD: "1",
        LOCAL_WORKSPACE_PORT: String(LOCAL_WORKSPACE_PORT),
        FRONTEND_BASE_URL: url,
        PUBLIC_API_BASE: url,
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  )
  let stderrTail = ""
  child.stderr?.setEncoding("utf8")
  child.stderr?.on("data", (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-1500)
  })
  child.on("exit", (code) => {
    slog(`[local-workspace] exited code=${code}`)
    child = null
  })
  slog(`[local-workspace] starting ${python} in ${dir}`)
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (await healthy(url)) {
      slog(`[local-workspace] ready ${url}`)
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  slog("[local-workspace] did not become ready")
  if (stderrTail.trim()) slog(`[local-workspace] ${stderrTail.trim()}`)
  return false
}
