import * as React from "react"
import { DisabledPanel } from "./DisabledPanel"
import { ErrorState } from "./ErrorState"
import { PlannedState } from "./PlannedState"
import { useUiI18n } from "../lib/ui-i18n"
import { useCapability } from "../stores/capabilities"

export function FeatureGate({
  capabilityKey,
  title,
  children,
}: {
  capabilityKey: string
  title?: string
  children: React.ReactNode
}) {
  const capability = useCapability(capabilityKey)
  const { displayText, text } = useUiI18n()

  if (capability?.status === "ready") {
    return <>{children}</>
  }

  if (!capability) {
    return (
      <ErrorState
        title={title ?? capabilityKey}
        description={text(
          "기능 상태를 확인할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도하세요.",
          "The feature status is unavailable. Check the connection and try again.",
        )}
      />
    )
  }

  if (capability.status === "planned") {
    return (
      <PlannedState
        title={title ?? capability.label}
        description={displayText(
          capability.reason ??
            text(
              "현재 사용할 수 없습니다. 필요한 조건을 확인한 뒤 다시 시도하세요.",
              "This feature is currently unavailable. Check the required conditions before trying again.",
            ),
        )}
      />
    )
  }

  if (capability.status === "error") {
    return (
      <ErrorState
        title={title ?? capability.label}
        description={displayText(
          capability.reason ??
            text("현재 오류 상태입니다.", "This feature is currently in an error state."),
        )}
      />
    )
  }

  return (
    <DisabledPanel
      title={title ?? capability.label}
      reason={displayText(
        capability.reason ??
          text("현재 사용할 수 없는 기능입니다.", "This feature is not available right now."),
      )}
    />
  )
}
