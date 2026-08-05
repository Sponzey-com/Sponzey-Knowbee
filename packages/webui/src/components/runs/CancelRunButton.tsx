import { useState } from "react"
import { useUiI18n } from "../../lib/ui-i18n"

export function CancelRunButton({
  canCancel,
  onCancel,
}: {
  canCancel: boolean
  onCancel: () => void | Promise<void>
}) {
  const { text } = useUiI18n()
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  if (confirming) {
    return (
      <span className="flex flex-wrap items-center justify-end gap-2" aria-live="polite">
        <span className="text-xs font-medium text-stone-700">
          {text("실행을 취소할까요?", "Cancel this run?")}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setConfirming(false)
          }}
          className="min-h-11 rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900/20"
        >
          {text("계속 실행", "Keep running")}
        </button>
        <button
          type="button"
          disabled={cancelling}
          onClick={async (event) => {
            event.stopPropagation()
            if (cancelling) return
            setCancelling(true)
            try {
              await onCancel()
              setConfirming(false)
            } catch {
              // The owner renders recovery guidance; keep confirmation open for retry.
            } finally {
              setCancelling(false)
            }
          }}
          className="min-h-11 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/30"
        >
          {cancelling ? text("취소 중", "Cancelling") : text("취소 확인", "Confirm cancellation")}
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        setConfirming(true)
      }}
      disabled={!canCancel}
      aria-label={text("실행 취소 확인 열기", "Review run cancellation")}
      className="min-h-11 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {text("실행 취소", "Cancel Run")}
    </button>
  )
}
