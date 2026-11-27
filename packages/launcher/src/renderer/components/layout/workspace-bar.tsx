import React from "react"
import { cn } from "@renderer/lib/utils"
import { LauncherUpdateBanner } from "@renderer/components/LauncherUpdateBanner"
import { useWorkspaceTabsStore } from "@renderer/store/workspace-tabs"
import { WORKSPACE_HOME_TAB } from "../../../shared/workspace-view"
import { AccountChip } from "./account-chip"
import { ModeSwitch } from "./mode-switch"

/**
 * The Workspace side's top edge: the switch between This Computer and the
 * single project. There is no workspace tab strip. The web app brings its own
 * sidebar, so the window gives it the full width.
 *
 * It is the window's title bar: it drags the window and clears the OS buttons
 * on whichever side they are drawn.
 */
export function WorkspaceBar(): React.JSX.Element {
  const onHome = useWorkspaceTabsStore((s) => s.active === WORKSPACE_HOME_TAB)

  // The bar is sidebar-coloured; the OS window buttons drawn over its right
  // end on Windows/Linux follow it while it is up. `?.` for an older preload.
  React.useEffect(() => {
    void window.api?.setChromeSurface?.("sidebar")?.catch(() => {})
    return () => void window.api?.setChromeSurface?.("page")?.catch(() => {})
  }, [])

  return (
    <header className={cn(
      "titlebar-drag flex h-(--mode-bar-h) shrink-0 items-center gap-3 bg-sidebar pr-(--window-controls-w) pl-(--traffic-lights-w)",
      onHome && "border-b",
    )}>
      <div className="flex min-w-0 flex-1 items-center gap-3 pl-2">
        <ModeSwitch />
      </div>
      <div className="flex shrink-0 items-center gap-3 pr-3">
        <div className="titlebar-no-drag flex shrink-0 justify-center">
          <LauncherUpdateBanner inline />
        </div>
        {onHome && <AccountChip />}
      </div>
    </header>
  )
}
