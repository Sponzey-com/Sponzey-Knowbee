import type { UserRecoveryProjection } from "./user-recovery"

export type ResourceReadStatus = "idle" | "loading" | "ready" | "stale" | "failed"

export interface ResourceReadState<T> {
  status: ResourceReadStatus
  data: T | null
  observedAt: number | null
  failure: UserRecoveryProjection | null
}

export type ResourceReadEvent<T> =
  | { type: "load_started" }
  | { type: "load_succeeded"; data: T; observedAt: number }
  | { type: "load_failed"; failure: UserRecoveryProjection }

export function initialResourceReadState<T>(): ResourceReadState<T> {
  return { status: "idle", data: null, observedAt: null, failure: null }
}

export function reduceResourceReadState<T>(
  current: ResourceReadState<T>,
  event: ResourceReadEvent<T>,
): ResourceReadState<T> {
  if (event.type === "load_started") {
    return {
      status: "loading",
      data: current.data,
      observedAt: current.observedAt,
      failure: null,
    }
  }
  if (event.type === "load_succeeded") {
    if (!Number.isFinite(event.observedAt) || event.observedAt < 0) {
      throw new Error("resource_read_observed_at_invalid")
    }
    return {
      status: "ready",
      data: event.data,
      observedAt: event.observedAt,
      failure: null,
    }
  }
  if (current.data !== null && current.observedAt !== null) {
    return {
      status: "stale",
      data: current.data,
      observedAt: current.observedAt,
      failure: event.failure,
    }
  }
  return {
    status: "failed",
    data: null,
    observedAt: null,
    failure: event.failure,
  }
}
