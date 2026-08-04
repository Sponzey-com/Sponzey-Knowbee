/**
 * Cross-runtime Yeonjang liveness contract.
 *
 * The Rust runtime publishes presence at the heartbeat interval. Gateway
 * projections must allow bounded event-loop and transport jitter before they
 * remove an otherwise healthy session from runnable target selection.
 */
export const YEONJANG_HEARTBEAT_INTERVAL_MS = 30_000;
export const YEONJANG_SESSION_STALE_AFTER_MS = 90_000;
//# sourceMappingURL=yeonjang-liveness-contract.js.map