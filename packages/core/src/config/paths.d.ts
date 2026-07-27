export type RuntimePathEnvironment = Readonly<Record<string, string | undefined>>;
export interface RuntimePathDependencies {
    homeDir: string;
    exists(path: string): boolean;
}
export interface RuntimePaths {
    readonly stateDir: string;
    readonly configFile: string;
    readonly dbFile: string;
    readonly memoryDbFile: string;
    readonly setupStateFile: string;
    readonly lockFile: string;
    readonly logsDir: string;
    readonly sessionsDir: string;
    readonly pluginsDir: string;
}
export declare function createRuntimePaths(env: RuntimePathEnvironment, dependencies?: RuntimePathDependencies): RuntimePaths;
export declare function captureRuntimePaths(): RuntimePaths;
//# sourceMappingURL=paths.d.ts.map