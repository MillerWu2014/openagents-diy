import React, { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { parseJoinUrl } from "../../../shared/join-link"
import { useAccountStore } from "../../store/account"
import type { ToastType } from "../../hooks/useToast"
import { Button } from "../ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog"
import { Input } from "../ui/input"

interface JoinFields {
  host: string
  port: number
  code: string
}

let openWith: ((target: JoinFields | null) => void) | null = null

/** Open the join dialog, optionally already filled from an invite link. */
export function openJoinDialog(target: JoinFields | null = null): void {
  openWith?.(target)
}

export function JoinRemoteDialog({
  showToast,
}: {
  showToast: (msg: string, type?: ToastType) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState("")
  const [host, setHost] = useState("")
  const [port, setPort] = useState("18765")
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  const fill = (target: JoinFields | null): void => {
    if (target) {
      setHost(target.host)
      setPort(String(target.port))
      setCode(target.code)
    }
    setOpen(true)
  }

  useEffect(() => {
    openWith = fill
    void window.api.pendingJoin().then((target) => { if (target) fill(target) })
    return window.api.onJoinRequest(fill)
  }, [])

  const applyLink = (value: string): void => {
    setLink(value)
    const parsed = parseJoinUrl(value)
    if (!parsed) return
    setHost(parsed.host)
    setPort(String(parsed.port))
    setCode(parsed.code)
  }

  const submit = async (): Promise<void> => {
    setBusy(true)
    try {
      const joined = await window.api.joinRemoteProject({
        link: link.trim() || undefined,
        host: host.trim(),
        port: Number(port),
        code: code.trim(),
        displayName: name.trim(),
      })
      setOpen(false)
      useAccountStore.getState().openWorkspace({
        slug: joined.slug,
        name: joined.workspaceName,
        token: null,
        remote: { apiUrl: joined.apiUrl, memberToken: joined.memberToken },
      })
    } catch (err) {
      const message = (err as Error).message
      const key = message.startsWith("join:") ? `workspaces.joinRemote.error.${message.slice(5)}` : ""
      showToast(key ? t(key) : message, "error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next) }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("workspaces.joinRemote.title")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="gap-3">
          <p className="text-sm text-muted-foreground">{t("workspaces.joinRemote.hint")}</p>
          <label className="flex flex-col gap-1 text-sm">
            {t("workspaces.joinRemote.link")}
            <Input value={link} onChange={(e) => applyLink(e.target.value)} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("workspaces.joinRemote.host")}
            <Input value={host} onChange={(e) => setHost(e.target.value)} autoComplete="off" />
          </label>
          <div className="flex gap-2">
            <label className="flex w-28 flex-col gap-1 text-sm">
              {t("workspaces.joinRemote.port")}
              <Input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              {t("workspaces.joinRemote.code")}
              <Input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            {t("workspaces.joinRemote.name")}
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {t("workspaces.joinRemote.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !name.trim() || !code.trim() || !host.trim()}>
            {t("workspaces.joinRemote.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
