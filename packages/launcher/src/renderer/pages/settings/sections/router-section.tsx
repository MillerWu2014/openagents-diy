import React, { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import { Spinner } from "@renderer/components/ui/spinner"
import type { ToastType } from "@renderer/hooks/useToast"
import { SettingsCard, Row } from "../components/settings-card"

interface RouterModel {
  baseUrl: string
  apiKey: string
  model: string
}

const EMPTY: RouterModel = { baseUrl: "", apiKey: "", model: "" }

interface Props {
  showToast: (msg: string, type?: ToastType) => void
}

/**
 * Saved as one value: saving restarts the local project API, which reads the
 * router from its environment, so three fields must not mean three restarts.
 */
export function RouterSection({ showToast }: Props): React.JSX.Element {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<RouterModel>(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void window.api.getSetting("routerModel").then((v) => {
      if (v && typeof v === "object") setDraft({ ...EMPTY, ...(v as Partial<RouterModel>) })
    })
  }, [])

  const field = (key: keyof RouterModel) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }))

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const restarted = await window.api.setSetting("routerModel", draft)
      showToast(
        t(restarted ? "settings.router.saved" : "settings.router.savedRestart"),
        restarted ? "success" : "info",
      )
    } catch (e) {
      showToast(t("settings.router.saveFailed", { error: (e as Error).message }), "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsCard
      title={t("settings.router.group")}
      desc={t("settings.router.groupDesc")}
      footer={
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          {saving && <Spinner />}
          {t(saving ? "settings.router.saving" : "settings.router.save")}
        </Button>
      }
    >
      <Row stacked label={t("settings.router.baseUrl")} desc={t("settings.router.baseUrlDesc")}>
        <Input
          value={draft.baseUrl}
          onChange={field("baseUrl")}
          placeholder="http://127.0.0.1:11434/v1"
        />
      </Row>
      <Row stacked label={t("settings.router.apiKey")} desc={t("settings.router.apiKeyDesc")}>
        <Input
          type="password"
          autoComplete="off"
          value={draft.apiKey}
          onChange={field("apiKey")}
          placeholder="sk-…"
        />
      </Row>
      <Row stacked label={t("settings.router.model")} desc={t("settings.router.modelDesc")}>
        <Input value={draft.model} onChange={field("model")} placeholder="deepseek-chat" />
      </Row>
    </SettingsCard>
  )
}
