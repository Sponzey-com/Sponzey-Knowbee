export type StartupEnvironment = Readonly<Record<string, string | undefined>>;
export interface StartupProcessContext {
    readonly env: StartupEnvironment;
    readonly argv: readonly string[];
    readonly cwd: string;
    readonly platform?: string;
}
export interface StartupProcessContextInput {
    env: Readonly<Record<string, string | undefined>>;
    argv: readonly string[];
    cwd: string;
    platform?: string;
}
export declare function createStartupProcessContext(input: StartupProcessContextInput): StartupProcessContext;
export declare function captureStartupProcessContext(): StartupProcessContext;
//# sourceMappingURL=startup-process-context.d.ts.map