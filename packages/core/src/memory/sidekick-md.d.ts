/**
 * Walk up from workDir (up to 3 parent levels) searching for KNOWBEE.md first,
 * then legacy WIZBY.md / HOWIE.md / SIDEKICK.md.
 * Returns the file contents (trimmed to 8KB) or null if not found.
 */
export declare function loadKnowbeeMd(workDir: string): string | null;
/** Write a KNOWBEE.md template to the given directory. */
export declare function initKnowbeeMd(dir: string): string;
export declare const loadWizbyMd: typeof loadKnowbeeMd;
export declare const initWizbyMd: typeof initKnowbeeMd;
export declare const loadHowieMd: typeof loadKnowbeeMd;
export declare const initHowieMd: typeof initKnowbeeMd;
export declare const loadSidekickMd: typeof loadKnowbeeMd;
export declare const initSidekickMd: typeof initKnowbeeMd;
//# sourceMappingURL=sidekick-md.d.ts.map