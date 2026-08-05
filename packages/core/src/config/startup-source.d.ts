import type { KnowbeeConfig } from "./types.js";
export type StartupConfigSourceState = "empty" | "loading" | "ready" | "failed";
export type StartupConfigLoader = () => KnowbeeConfig;
export interface StartupConfigSource {
    getState(): StartupConfigSourceState;
    getSnapshot(): KnowbeeConfig;
}
export declare function createImmutableConfigSnapshot(config: KnowbeeConfig): KnowbeeConfig;
export declare function createStartupConfigSource(loader: StartupConfigLoader): StartupConfigSource;
//# sourceMappingURL=startup-source.d.ts.map