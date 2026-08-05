import { getApiRuntimeConfig } from "../runtime-context.js";
const authenticatedPrincipals = new WeakMap();
export function getApiAuthenticationPrincipal(request) {
    return authenticatedPrincipals.get(request) ?? null;
}
const LOCALHOST_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
function isLocalhost(req) {
    const ip = req.socket.remoteAddress ?? "";
    return LOCALHOST_IPS.has(ip);
}
const rateLimitMap = new Map();
const MAX_FAILURES = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry)
        return { allowed: true };
    if (entry.lockedUntil > now) {
        return { allowed: false, retryAfter: Math.ceil((entry.lockedUntil - now) / 1000) };
    }
    if (entry.failures >= MAX_FAILURES) {
        rateLimitMap.delete(ip);
    }
    return { allowed: true };
}
function recordFailure(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip) ?? { failures: 0, lockedUntil: 0 };
    entry.failures += 1;
    if (entry.failures >= MAX_FAILURES)
        entry.lockedUntil = now + LOCKOUT_MS;
    rateLimitMap.set(ip, entry);
}
function recordSuccess(ip) {
    rateLimitMap.delete(ip);
}
function extractToken(req) {
    const header = req.headers.authorization ?? "";
    if (header.startsWith("Bearer "))
        return { token: header.slice(7), transport: "header" };
    const url = req.url ?? "";
    const match = /[?&]token=([^&]+)/.exec(url);
    if (match)
        return { token: decodeURIComponent(match[1] ?? ""), transport: "query" };
    return { token: "", transport: "none" };
}
export async function authMiddleware(req, reply) {
    const localhost = isLocalhost(req);
    if (localhost && !req.headers.authorization?.startsWith("Bearer "))
        return;
    const cfg = getApiRuntimeConfig(req);
    const staticAuthEnabled = cfg.webui.auth.enabled;
    const staticToken = cfg.webui.auth.token?.trim() ?? "";
    const provided = extractToken(req);
    const matchesStaticToken = Boolean(staticToken && provided.token === staticToken);
    if (localhost) {
        if (matchesStaticToken && provided.transport === "header") {
            authenticatedPrincipals.set(req, Object.freeze({
                principalRef: "api:static-token-owner",
                role: "administrator",
                authenticationMethod: "static_bearer_token",
            }));
        }
        return;
    }
    if (!staticAuthEnabled)
        return;
    const ip = req.socket.remoteAddress ?? "unknown";
    const { allowed, retryAfter } = checkRateLimit(ip);
    if (!allowed) {
        await reply.status(429).send({
            error: "Too many failed attempts",
            retryAfter,
        });
        return;
    }
    if (!matchesStaticToken) {
        recordFailure(ip);
        await reply.status(401).send({ error: "Unauthorized" });
        return;
    }
    recordSuccess(ip);
    if (provided.transport === "header") {
        authenticatedPrincipals.set(req, Object.freeze({
            principalRef: "api:static-token-owner",
            role: "administrator",
            authenticationMethod: "static_bearer_token",
        }));
    }
}
//# sourceMappingURL=auth.js.map