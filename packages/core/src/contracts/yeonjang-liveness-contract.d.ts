/**
 * Cross-runtime Yeonjang liveness contract.
 *
 * The Rust runtime publishes presence at the heartbeat interval. Gateway
 * projections must allow bounded event-loop and transport jitter before they
 * remove an otherwise healthy session from runnable target selection.
 */
export declare const YEONJANG_HEARTBEAT_INTERVAL_MS = 30000;
export declare const YEONJANG_SESSION_STALE_AFTER_MS = 90000;
//# sourceMappingURL=yeonjang-liveness-contract.d.ts.map