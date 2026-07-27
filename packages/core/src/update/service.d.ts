import type { RuntimePaths } from "../config/paths.js";
import { type PersistedConfigFileSystem } from "../config/persisted-file.js";
type UpdateStatus = "idle" | "latest" | "update_available" | "unsupported" | "error";
export interface UpdateSnapshot {
    currentVersion: string;
    latestVersion: string | null;
    checkedAt: number | null;
    updateAvailable: boolean;
    status: UpdateStatus;
    message: string;
    source: string | null;
    repositoryUrl: string | null;
    releaseUrl: string | null;
}
export interface UpdateRepositoryOptions {
    repositoryUrl?: string | null;
}
export type UpdateRuntimeEnvironment = Readonly<Record<string, string | undefined>>;
export interface UpdateRuntimeContext {
    readonly stateFilePath: string;
    readonly repositoryUrl: string | null;
    readonly fileSystem: PersistedConfigFileSystem;
}
export declare function createUpdateRuntimeContext(paths: Pick<RuntimePaths, "stateDir">, env: UpdateRuntimeEnvironment, fileSystem?: PersistedConfigFileSystem): UpdateRuntimeContext;
export declare function getCurrentAppVersion(): string;
export declare function getUpdateSnapshot(context: UpdateRuntimeContext, options?: UpdateRepositoryOptions): UpdateSnapshot;
export declare function checkForUpdates(context: UpdateRuntimeContext, options?: UpdateRepositoryOptions): Promise<UpdateSnapshot>;
export {};
//# sourceMappingURL=service.d.ts.map