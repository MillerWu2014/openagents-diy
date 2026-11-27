import React from "react"
import { useTranslation } from "react-i18next"

import { FieldError } from "../ui/field"
import { Input } from "../ui/input"
import { cn } from "../../lib/utils"
import { formatCode } from "../../lib/pairing-code"

/**
 * The pairing-code field. State and the action that submits it live with the
 * caller (see `usePairDevice`); this only renders. No visible label: the
 * dialog title already says what goes here, so the field sits right under it.
 */
export function PairPanel({
  code,
  onChange,
  onSubmit,
  error,
  autoFocus = true,
  className,
}: {
  code: string
  onChange: (v: string) => void
  onSubmit: () => void
  error: string | null
  autoFocus?: boolean
  className?: string
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Input
        id="quick-connect-code"
        aria-label={t("workspaces.quickConnect.pairLabel")}
        aria-invalid={!!error || undefined}
        value={code}
        onChange={(e) => onChange(formatCode(e.target.value))}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder={t("workspaces.quickConnect.pairPlaceholder")}
        className="h-14 text-center font-mono text-xl tracking-widest uppercase md:text-xl"
        autoFocus={autoFocus}
      />
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}
