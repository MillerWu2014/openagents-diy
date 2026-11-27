import React, { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { DialogBody, DialogFooter } from "@renderer/components/ui/dialog"
import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import type { PairedWorkspace } from "@renderer/components/workspaces/use-pair-device"
import type { ToastType } from "@renderer/hooks/useToast"

interface LocalProject {
  slug: string
  name: string
  directory?: string
}

async function localBase(): Promise<string> {
  const configured = await window.api.getSetting("workspaceEndpoint").catch(() => "")
  const base = typeof configured === "string" ? configured.trim() : ""
  return (base || "http://127.0.0.1:18765").replace(/\/$/, "")
}

async function readData(res: Response): Promise<unknown> {
  const body = await res.json().catch(() => null) as { data?: unknown } | null
  if (!res.ok || !body) throw new Error("request failed")
  return body.data
}

export async function listLocalProjects(): Promise<LocalProject[]> {
  try {
    const base = await localBase()
    const data = await readData(await fetch(`${base}/v1/local/projects`))
    return Array.isArray(data) ? data as LocalProject[] : []
  } catch {
    return []
  }
}

/** Pair this computer to a local project and hand the joined workspace back. */
export async function joinLocalProject(slug: string): Promise<PairedWorkspace> {
  const base = await localBase()
  const data = await readData(await fetch(`${base}/v1/local/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  })) as { code?: string }
  if (!data?.code) throw new Error("request failed")
  return window.api.connectNode(data.code)
}

export function LocalProjectCreate({
  agentName,
  showToast,
  onCreated,
}: {
  /** Pre-checked when this dialog was opened for one agent. */
  agentName?: string
  showToast: (msg: string, type?: ToastType) => void
  onCreated: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [directory, setDirectory] = useState("")
  const [agents, setAgents] = useState<Array<{ name: string; displayName?: string | null }>>([])
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.api.listAgents().then((list) => {
      if (cancelled) return
      const rows = (list || []).map((agent) => ({ name: agent.name, displayName: agent.displayName }))
      setAgents(rows)
      if (agentName && rows.some((agent) => agent.name === agentName)) setSelected([agentName])
    }).catch(() => { if (!cancelled) setAgents([]) })
    return () => { cancelled = true }
  }, [agentName])

  const ready = !!name.trim() && !!directory && selected.length > 0 && !busy

  const create = async (): Promise<void> => {
    if (!ready) return
    setBusy(true)
    try {
      await window.api.createLocalProject({ name: name.trim(), directory, agents: selected })
      showToast(t("agents.connectDialog.toast.created"), "success")
      onCreated()
    } catch (err) {
      showToast(t("agents.connectDialog.toast.error", { message: (err as Error).message }), "error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 text-left">
      <Input
        aria-label={t("agents.connectDialog.namePlaceholder")}
        placeholder={t("agents.connectDialog.namePlaceholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void create() }}
      />
      <div className="flex items-center gap-2">
        <Input
          readOnly
          aria-label={t("agents.connectDialog.folderLabel")}
          placeholder={t("agents.connectDialog.folderPlaceholder")}
          value={directory}
        />
        <Button variant="outline" onClick={() => void window.api.selectDirectory(directory || undefined).then((dir) => { if (dir) setDirectory(dir) })}>
          {t("agents.connectDialog.folderBrowse")}
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <p className="m-0 text-xs text-muted-foreground">{t("agents.connectDialog.agentsLabel")}</p>
        {agents.length === 0 ? (
          <p className="m-0 text-xs text-muted-foreground">{t("agents.connectDialog.agentsEmpty")}</p>
        ) : (
          agents.map((agent) => (
            <label key={agent.name} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(agent.name)}
                onChange={() => setSelected((current) =>
                  current.includes(agent.name) ? current.filter((name) => name !== agent.name) : [...current, agent.name],
                )}
              />
              {agent.displayName || agent.name}
            </label>
          ))
        )}
      </div>
      <Button data-testid="ws-create-project" disabled={!ready} onClick={() => void create()}>
        {t("agents.connectDialog.createLocal")}
      </Button>
    </div>
  )
}

/**
 * This computer is not in a project yet. Projects live on the local backend;
 * joining one pairs the device without a code from the website.
 */
export function ConnectWorkspacePair({
  agentName,
  onPaired,
  onCreated,
  onCancel,
  showToast,
}: {
  agentName?: string
  onPaired: (workspace: PairedWorkspace) => void
  onCreated: () => void
  onCancel: () => void
  showToast: (msg: string, type?: ToastType) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [projects, setProjects] = useState<LocalProject[] | null>(null)
  const [busySlug, setBusySlug] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const base = await localBase()
        const data = await readData(await fetch(`${base}/v1/local/projects`))
        if (!cancelled) setProjects(Array.isArray(data) ? data as LocalProject[] : [])
      } catch {
        if (!cancelled) setProjects([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  const join = async (slug: string): Promise<void> => {
    setBusySlug(slug)
    try {
      onPaired(await joinLocalProject(slug))
    } catch (err) {
      showToast(t("agents.connectDialog.toast.error", { message: (err as Error).message }), "error")
    } finally {
      setBusySlug(null)
    }
  }

  return (
    <>
      <DialogBody className="items-center gap-4 py-8 text-center" data-testid="ws-none-paired">
        <p className="m-0 text-sm font-medium">{t("agents.connectDialog.emptyTitle")}</p>
        <div className="flex w-full flex-col gap-2">
          {(projects || []).map((project) => (
            <Button
              key={project.slug}
              data-testid={`ws-join-${project.slug}`}
              disabled={busySlug !== null}
              onClick={() => void join(project.slug)}
            >
              {t("agents.connectDialog.joinLocal", { name: project.name || project.slug })}
            </Button>
          ))}
        </div>
        <LocalProjectCreate agentName={agentName} showToast={showToast} onCreated={onCreated} />
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t("agents.connectDialog.cancel")}
        </Button>
      </DialogFooter>
    </>
  )
}
