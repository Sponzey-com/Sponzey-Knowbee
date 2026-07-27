import React from "react"
import { Button } from "./Button.js"

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "failed"
export type SaveEvent = "edit" | "save" | "succeed" | "fail" | "reset"

const TRANSITIONS: Readonly<Partial<Record<SaveState, Partial<Record<SaveEvent, SaveState>>>>> = {
  clean: { edit: "dirty" },
  dirty: { save: "saving", reset: "clean" },
  saving: { succeed: "saved", fail: "failed" },
  saved: { edit: "dirty", reset: "clean" },
  failed: { edit: "dirty", reset: "clean" },
}

export function transitionSaveState(state: SaveState, event: SaveEvent): SaveState {
  const next = TRANSITIONS[state]?.[event]
  if (!next) throw new Error(`Invalid save state transition: ${state} -> ${event}`)
  return next
}

export interface SaveBarProps {
  state: SaveState
  onSave: () => void
  message?: string
}

export function SaveBar({ state, onSave, message }: SaveBarProps) {
  const failed = state === "failed"
  return (
    <div className="flex min-h-[64px] items-center justify-between gap-3 border-t border-stone-200 bg-white px-4 py-3">
      <p role={failed ? "alert" : "status"} className={failed ? "text-sm text-red-700" : "text-sm text-stone-600"}>
        {message ?? (state === "dirty" ? "Unsaved changes" : state === "saving" ? "Saving" : state === "saved" ? "Saved" : "No changes")}
      </p>
      <Button variant="primary" pending={state === "saving"} disabled={state !== "dirty"} onClick={onSave}>Save</Button>
    </div>
  )
}
