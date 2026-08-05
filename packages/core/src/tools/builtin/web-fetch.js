import { createPublicWebDocumentAdapter, } from "../../adapters/public-web-document.js";
import { createLogger } from "../../logger/index.js";
const log = createLogger("tools:web-fetch");
const MAX_PUBLIC_DOCUMENT_BYTES = 4_000_000;
export { applyPublicTargetRouteGuard, fetchPublicHttp, NetworkTargetPolicyError, } from "../../adapters/public-http-fetch.js";
export function createWebFetchTool(dependencies = {}) {
    const fetchDocument = createPublicWebDocumentAdapter(dependencies);
    return {
        name: "web_fetch",
        evidenceSourceKind: "web",
        description: "Fetch a public HTTP or HTTPS document as Markdown evidence.",
        parameters: {
            type: "object",
            properties: {
                url: { type: "string", description: "Public HTTP or HTTPS document URL" },
                maxLength: {
                    type: "number",
                    description: "Maximum Markdown characters, default 20000",
                },
                freshnessPolicy: {
                    type: "string",
                    enum: ["normal", "latest_approximate", "strict_timestamp"],
                    description: "Source freshness evidence policy",
                },
            },
            required: ["url"],
        },
        riskLevel: "safe",
        requiresApproval: false,
        async execute(params, ctx) {
            const startedAt = Date.now();
            log.product("web_fetch_started", { runId: ctx.runId });
            const outcome = await fetchDocument({
                url: params.url,
                maxBytes: MAX_PUBLIC_DOCUMENT_BYTES,
                maxMarkdownCharacters: params.maxLength ?? 20_000,
                freshnessPolicy: params.freshnessPolicy ?? "normal",
                signal: ctx.signal,
            });
            if (!outcome.ok) {
                log.product("web_fetch_finished", {
                    runId: ctx.runId,
                    status: "failed",
                    durationMs: Date.now() - startedAt,
                });
                log.fieldDebug("web_fetch_failed", {
                    reasonCode: outcome.reasonCode,
                    retryable: outcome.retryable,
                });
                return {
                    success: false,
                    output: "공개 웹 문서를 가져오지 못했습니다.",
                    error: outcome.reasonCode,
                    details: {
                        reasonCode: outcome.reasonCode,
                        ...(outcome.rejectionCode ? { rejectionCode: outcome.rejectionCode } : {}),
                    },
                };
            }
            log.product("web_fetch_finished", {
                runId: ctx.runId,
                status: "succeeded",
                truncated: outcome.document.truncated,
                durationMs: Date.now() - startedAt,
            });
            log.development("web_fetch_projection_created", {
                truncated: outcome.document.truncated,
            });
            return {
                success: true,
                output: outcome.markdown,
                details: {
                    document: outcome.document,
                    sourceEvidence: outcome.document.sourceEvidence,
                    truncated: outcome.document.truncated,
                    linkObservations: outcome.linkObservations,
                },
            };
        },
    };
}
export const webFetchTool = createWebFetchTool();
//# sourceMappingURL=web-fetch.js.map