import React from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@renderer/components/ui/badge"
import { Card } from "@renderer/components/ui/card"
import { BrandMark } from "@renderer/components/ui-kit"
import { useThemeStore } from "@renderer/store/theme"
import { SettingsCard,
  InfoRow,
} from "../components/settings-card"
import type { RuntimeInfo, SystemInfo } from "@renderer/types"

interface Props {
  launcherVersion: string
  runtimeInfo: RuntimeInfo | null
  systemInfo: SystemInfo | null
}

export function AboutSection({
  launcherVersion,
  runtimeInfo,
  systemInfo,
}: Props): React.JSX.Element {
  const { t } = useTranslation()
  const dark = useThemeStore((s) => s.resolved === "dark")

  return (
    <>
      {/* This page is about the app you are running — the launcher — not the
          OpenAgents platform as a whole. The version badge belongs to it, so
          the name has to say "launcher" too, and the platform gets one line of
          context underneath rather than top billing. */}
      <Card className="mb-5 flex-row items-center gap-5 px-6 py-6">
        {/* The sidebar's mark, larger: the mono cut-out on a tile of the
            primary colour, as the neutral theme draws its brand everywhere. */}
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary">
          <BrandMark variant={dark ? "black" : "white"} className="size-9" />
        </span>
        <div className="min-w-0">
          <div className="text-base font-semibold tracking-tight">
            {t("settings.about.productName")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("settings.about.tagline")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("settings.about.copyright", { year: new Date().getFullYear() })}
          </div>
        </div>
        <Badge variant="secondary" className="ml-auto shrink-0 font-mono">
          {launcherVersion}
        </Badge>
      </Card>

      <SettingsCard title={t("settings.about.versionGroup")}>
        <InfoRow
          label={t("settings.runtime.coreLibrary")}
          value={
            runtimeInfo?.coreVersion
              ? `v${runtimeInfo.coreVersion}`
              : t("common.notInstalled")
          }
          mono
        />
        <InfoRow
          label={t("settings.about.buildType")}
          value={
            systemInfo
              ? systemInfo.packaged
                ? t("settings.about.buildPackaged")
                : t("settings.about.buildDev")
              : "—"
          }
        />
        <InfoRow
          label={t("settings.runtime.electron")}
          value={
            systemInfo
              ? `Electron ${systemInfo.electronVersion} · Chrome ${systemInfo.chromeVersion}`
              : "—"
          }
          mono
        />
      </SettingsCard>
    </>
  )
}
