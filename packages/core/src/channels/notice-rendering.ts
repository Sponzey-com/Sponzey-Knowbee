import {
  renderUserFacingNoticeText,
  type UserFacingNoticeRenderDependencies,
} from "../runs/user-facing-notice-rendering.js"

export interface ChannelNoticeRenderDependencies extends UserFacingNoticeRenderDependencies {}

export type ChannelNoticeRenderResolution =
  | { status: "ready"; text: string; textSource: "llm_reviewed" }
  | { status: "blocked"; reason: string }

export async function renderChannelNoticeText(params: {
  originalRequest: string
  rawText: string
  dependencies?: ChannelNoticeRenderDependencies | undefined
}): Promise<ChannelNoticeRenderResolution> {
  return renderUserFacingNoticeText({
    originalRequest: params.originalRequest,
    rawText: params.rawText,
    reasonPrefix: "channel_notice",
    dependencies: params.dependencies,
  })
}
