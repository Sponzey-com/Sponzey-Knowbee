export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogPurpose = "product" | "debug" | "development";
export type LogPurposeInput = LogPurpose | "dev";
export declare function normalizeLogPurposeVisibility(value: string | undefined, fallback?: LogPurpose): LogPurpose;
export declare function redactLogText(value: string, purpose?: LogPurpose): string;
export interface Logger {
    product(message: string, ...args: unknown[]): void;
    fieldDebug(message: string, ...args: unknown[]): void;
    development(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    child(namespace: string): Logger;
}
export declare function createLogger(namespace: string): Logger;
export declare const logger: Logger;
//# sourceMappingURL=index.d.ts.map