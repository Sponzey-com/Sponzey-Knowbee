import type { RuntimePaths } from "./paths.js";
export type PersistedConfigPaths = Pick<RuntimePaths, "configFile">;
export interface PersistedConfigFileSystem {
    exists(path: string): boolean;
    makeDirectory(path: string): void;
    readText(path: string): string;
    writeText(path: string, content: string): void;
    rename(sourcePath: string, targetPath: string): void;
    remove(path: string): void;
}
export declare const NODE_PERSISTED_FILE_SYSTEM: PersistedConfigFileSystem;
export declare function readPersistedRawConfig(paths: PersistedConfigPaths, fileSystem?: PersistedConfigFileSystem): Record<string, unknown>;
export declare function writePersistedRawConfig(raw: Record<string, unknown>, paths: PersistedConfigPaths, fileSystem?: PersistedConfigFileSystem): void;
export declare function writeAtomicTextFile(targetPath: string, content: string, fileSystem?: PersistedConfigFileSystem): void;
//# sourceMappingURL=persisted-file.d.ts.map