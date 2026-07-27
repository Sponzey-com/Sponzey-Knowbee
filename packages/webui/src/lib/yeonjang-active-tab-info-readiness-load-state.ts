import { parseYeonjangBrowserActiveTabInfoPublicReadinessSummary } from "../contracts/yeonjang"
import {
  buildYeonjangBrowserActiveTabInfoGeneralReadinessView,
  type YeonjangActiveTabInfoGeneralReadinessView,
} from "./yeonjang-active-tab-info-readiness-view"

type TextFn = (ko: string, en: string) => string

export type YeonjangActiveTabInfoReadinessLoadStatus = "loading" | "ready" | "empty" | "error"

export interface YeonjangActiveTabInfoReadinessLoadState {
  status: YeonjangActiveTabInfoReadinessLoadStatus
  view: YeonjangActiveTabInfoGeneralReadinessView | null
  message: string | null
  retryable: boolean
}

export interface LoadYeonjangBrowserActiveTabInfoReadinessStateInput {
  request: (signal?: AbortSignal) => Promise<unknown>
  text: TextFn
  signal?: AbortSignal
  previousView?: YeonjangActiveTabInfoGeneralReadinessView | null
}

export async function loadYeonjangBrowserActiveTabInfoReadinessState({
  request,
  text,
  signal,
  previousView = null,
}: LoadYeonjangBrowserActiveTabInfoReadinessStateInput): Promise<YeonjangActiveTabInfoReadinessLoadState> {
  try {
    const rawSummary = await request(signal)
    const summary = parseYeonjangBrowserActiveTabInfoPublicReadinessSummary(rawSummary, "general")
    const view = buildYeonjangBrowserActiveTabInfoGeneralReadinessView(summary, text)
    return {
      status: view.targetCount === 0 ? "empty" : "ready",
      view,
      message: null,
      retryable: false,
    }
  } catch (error) {
    return buildYeonjangActiveTabInfoReadinessErrorState(error, previousView, text)
  }
}

export function buildYeonjangActiveTabInfoReadinessLoadingState(
  previousView: YeonjangActiveTabInfoGeneralReadinessView | null = null,
): YeonjangActiveTabInfoReadinessLoadState {
  return {
    status: "loading",
    view: previousView,
    message: null,
    retryable: false,
  }
}

export function buildYeonjangActiveTabInfoReadinessErrorState(
  _error: unknown,
  previousView: YeonjangActiveTabInfoGeneralReadinessView | null,
  text: TextFn,
): YeonjangActiveTabInfoReadinessLoadState {
  return {
    status: "error",
    view: previousView,
    message: text(
      "활성 탭 준비 상태를 불러오지 못했습니다. 잠시 후 다시 시도하세요.",
      "Active tab readiness could not be loaded. Try again shortly.",
    ),
    retryable: true,
  }
}
