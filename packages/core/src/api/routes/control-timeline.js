import { exportControlTimeline, getControlTimeline, } from "../../control-plane/timeline.js";
import { AUTHENTICATED_API_AUDIT_DEPENDENCIES, auditAccessHttpFailure, authorizeAndRecordAuditAccess, } from "../audit-access-runtime.js";
import { authMiddleware } from "../middleware/auth.js";
function parseLimit(value) {
    const parsed = Number.parseInt(value ?? "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return undefined;
    return Math.min(parsed, 2_000);
}
function parseSeverity(value) {
    return value === "debug" || value === "info" || value === "warning" || value === "error"
        ? value
        : undefined;
}
function parseAudience(value) {
    return value === "developer" ? "developer" : "user";
}
export function resolveControlTimelineAudience(requestedAudience, exposureContext) {
    if (exposureContext !== "audit")
        return "user";
    return parseAudience(requestedAudience);
}
function parseFormat(value) {
    return value === "json" ? "json" : "markdown";
}
function toTimelineQuery(query) {
    const severity = parseSeverity(query.severity);
    const limit = parseLimit(query.limit);
    return {
        ...(query.runId ? { runId: query.runId } : {}),
        ...(query.requestGroupId ? { requestGroupId: query.requestGroupId } : {}),
        ...(query.correlationId ? { correlationId: query.correlationId } : {}),
        ...(query.eventType ? { eventType: query.eventType } : {}),
        ...(query.component ? { component: query.component } : {}),
        ...(severity ? { severity } : {}),
        ...(limit ? { limit } : {}),
    };
}
export function registerControlTimelineRoute(app, auditDependencies = AUTHENTICATED_API_AUDIT_DEPENDENCIES) {
    app.get("/api/control/timeline", { preHandler: authMiddleware }, async (req) => ({
        timeline: getControlTimeline(toTimelineQuery(req.query), resolveControlTimelineAudience(req.query.audience, "public")),
    }));
    app.get("/api/control/timeline/export", { preHandler: authMiddleware }, async (req) => ({
        export: exportControlTimeline({
            ...toTimelineQuery(req.query),
            audience: resolveControlTimelineAudience(req.query.audience, "public"),
            format: parseFormat(req.query.format),
        }),
    }));
    app.get("/api/audit/control/timeline", { preHandler: authMiddleware }, async (req, reply) => {
        const query = toTimelineQuery(req.query);
        const audience = resolveControlTimelineAudience(req.query.audience, "audit");
        if (audience === "developer") {
            const decision = authorizeAndRecordAuditAccess({
                request: req,
                purpose: req.query.purpose,
                operation: "view",
                ...(req.query.runId ? { runId: req.query.runId } : {}),
                ...(req.query.requestGroupId ? { requestGroupId: req.query.requestGroupId } : {}),
                dependencies: auditDependencies,
            });
            if (!decision.allowed) {
                const failure = auditAccessHttpFailure(decision);
                return reply.status(failure.statusCode).send(failure.body);
            }
        }
        return { timeline: getControlTimeline(query, audience) };
    });
    app.get("/api/audit/control/timeline/export", { preHandler: authMiddleware }, async (req, reply) => {
        const query = toTimelineQuery(req.query);
        const audience = resolveControlTimelineAudience(req.query.audience, "audit");
        if (audience === "developer") {
            const decision = authorizeAndRecordAuditAccess({
                request: req,
                purpose: req.query.purpose,
                operation: "export",
                ...(req.query.runId ? { runId: req.query.runId } : {}),
                ...(req.query.requestGroupId ? { requestGroupId: req.query.requestGroupId } : {}),
                dependencies: auditDependencies,
            });
            if (!decision.allowed) {
                const failure = auditAccessHttpFailure(decision);
                return reply.status(failure.statusCode).send(failure.body);
            }
        }
        return {
            export: exportControlTimeline({
                ...query,
                audience,
                format: parseFormat(req.query.format),
            }),
        };
    });
}
//# sourceMappingURL=control-timeline.js.map