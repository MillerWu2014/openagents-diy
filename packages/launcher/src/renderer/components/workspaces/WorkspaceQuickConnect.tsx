import React, { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import { Button } from "../ui/button"
import type { ToastType } from "../../hooks/useToast"
import {
  joinLocalProject,
  listLocalProjects,
  LocalProjectCreate,
} from "../../pages/agents/components/connect-workspace-pair"

/**
 * Join or create a project on this computer. Pairing happens inside that
 * flow; the user never types a code or visits the website.
 */
export function WorkspaceQuickConnect({
  open,
  onClose,
  onCreated,
  showToast,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  showToast: (msg: string, type?: ToastType) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [projects, setProjects] = useState<Array<{ slug: string; name: string }> | null>(null)
  const [busySlug, setBusySlug] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void listLocalProjects().then((rows) => { if (!cancelled) setProjects(rows) })
    return () => { cancelled = true }
  }, [open])

  const finish = (): void => {
    onCreated()
    onClose()
  }

  const join = async (slug: string): Promise<void> => {
    setBusySlug(slug)
    try {
      await joinLocalProject(slug)
      finish()
    } catch (err) {
      showToast(t("agents.connectDialog.toast.error", { message: (err as Error).message }), "error")
    } finally {
      setBusySlug(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("workspaces.quickConnect.title")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="gap-4">
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
          {open && <LocalProjectCreate showToast={showToast} onCreated={finish} />}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busySlug !== null}>
            {t("workspaces.quickConnect.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
