import { useState } from "react"
import type { ToolCall } from "../stores/chat"
import { useUiI18n } from "../lib/ui-i18n"
import {
  buildApprovalParamSummary,
  buildToolResultSummary,
  describeApprovalToolName,
} from "../lib/approval-preview"

export function ToolCallPanel({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false)
  const pending = call.result === undefined
  const { text } = useUiI18n()
  const toolLabel = describeApprovalToolName(call.name, text)
  const inputSummary = buildApprovalParamSummary(call.params, text)
  const resultSummary = buildToolResultSummary(call.result, call.success, text)

  return (
    <div className="my-1 min-w-0 rounded border border-gray-200 bg-gray-50 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100"
      >
        <span>{pending ? "⏳" : call.success ? "✓" : "✗"}</span>
        <span className="min-w-0 flex-1 break-words font-semibold text-gray-700">{toolLabel}</span>
        <span className="ml-auto text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="min-w-0 space-y-1 border-t border-gray-200 px-3 py-2">
          <div className="font-semibold text-gray-500">{text("입력", "Input")}</div>
          <ul className="rounded bg-gray-100 px-4 py-2 text-xs leading-5 text-gray-700">
            {inputSummary.map((line) => (
              <li key={line} className="list-disc">{line}</li>
            ))}
          </ul>
          {!pending && (
            <>
              <div className={`font-semibold ${call.success ? "text-green-600" : "text-red-600"}`}>
                {call.success ? text("결과", "Result") : text("오류", "Error")}
              </div>
              <ul className="rounded bg-gray-100 px-4 py-2 text-xs leading-5 text-gray-700">
                {resultSummary.map((line) => (
                  <li key={line} className="list-disc">{line}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
