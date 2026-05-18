import { DEFAULT_YEONJANG_EXTENSION_ID, canYeonjangHandleMethod, invokeYeonjangMethod, isYeonjangUnavailableError } from "../../yeonjang/mqtt-client.js";
import { buildYeonjangTargetParameterProperties, buildYeonjangTargetResolutionDetails, buildYeonjangTargetSelectionFailure, recordYeonjangRemoteExecutionApproval, revalidateYeonjangTargetSelection, resolveYeonjangTargetSelection, } from "./yeonjang-target.js";
import { withYeonjangRequestMetadata } from "./yeonjang-request-metadata.js";
const DEFAULT_TIMEOUT_SEC = 300;
// Simple obfuscation patterns to reject
const OBFUSCATION_PATTERNS = [
    /\beval\s*\(/i,
    /\bexec\s*\(/i,
    /base64\s*-d/i,
    /\bpython[23]?\s+-c\s+["'].*base64/i,
    /\$\(\s*echo\s+[A-Za-z0-9+/=]+\s*\|/,
];
function detectObfuscation(command) {
    for (const pattern of OBFUSCATION_PATTERNS) {
        if (pattern.test(command)) {
            return `Potentially obfuscated command detected (pattern: ${pattern.source})`;
        }
    }
    return null;
}
function resolveRemoteWorkDir(workDir) {
    const normalized = workDir?.trim();
    return normalized ? normalized : undefined;
}
function yeonjangRequiredFailure(method) {
    return {
        success: false,
        output: `이 작업은 Yeonjang 연장을 통해서만 실행할 수 있습니다. 현재 연결된 연장이 \`${method}\` 메서드를 지원하지 않거나 연결되어 있지 않습니다.`,
        error: "YEONJANG_REQUIRED",
        details: {
            requiredExecutor: "yeonjang",
            requiredMethod: method,
        },
    };
}
export const shellExecTool = {
    name: "shell_exec",
    description: "Execute a shell command on the local machine. " +
        "Use this for running scripts, installing packages, querying system state, etc. " +
        "Output is captured and returned. Long-running commands will be killed after the timeout.",
    parameters: {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "Shell command to execute (passed to /bin/sh -c on Unix, cmd.exe on Windows)",
            },
            workDir: {
                type: "string",
                description: "Working directory. Defaults to the session work directory.",
            },
            timeoutSec: {
                type: "number",
                description: `Timeout in seconds. Default: ${DEFAULT_TIMEOUT_SEC}`,
            },
            env: {
                type: "object",
                description: "Additional environment variables to set",
                additionalProperties: { type: "string" },
            },
            ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
        },
        required: ["command"],
    },
    riskLevel: "dangerous",
    requiresApproval: true,
    async execute(params, ctx) {
        const obfuscation = detectObfuscation(params.command);
        if (obfuscation) {
            return {
                success: false,
                output: `Command rejected: ${obfuscation}`,
                error: "obfuscation_detected",
            };
        }
        const selection = resolveYeonjangTargetSelection({
            requestedExtensionId: params.extensionId,
            targetSelector: params.targetSelector,
            expectedTargetSessionId: params.targetSessionId,
            userMessage: ctx.userMessage,
        });
        if (!selection.ok) {
            return {
                success: false,
                ...buildYeonjangTargetSelectionFailure(selection),
            };
        }
        const extensionId = selection.extensionId;
        const yeonjangOptions = withYeonjangRequestMetadata(ctx, extensionId ? {
            extensionId,
            ...(selection.targetSessionId ? { metadata: { targetSessionId: selection.targetSessionId } } : {}),
        } : {});
        const workDir = resolveRemoteWorkDir(params.workDir);
        try {
            if (await canYeonjangHandleMethod("system.exec", yeonjangOptions)) {
                const reboundSelection = revalidateYeonjangTargetSelection({ selection });
                if (!reboundSelection.ok) {
                    return {
                        success: false,
                        ...buildYeonjangTargetSelectionFailure(reboundSelection),
                    };
                }
                recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "system.exec", ctx });
                ctx.onProgress(`Yeonjang${extensionId ? `(${extensionId})` : ""}에서 명령 실행: ${params.command}`);
                const remote = await invokeYeonjangMethod("system.exec", {
                    command: params.command,
                    args: [],
                    ...(workDir ? { cwd: workDir } : {}),
                    shell: true,
                    ...(params.env ? { env: params.env } : {}),
                    timeout_sec: params.timeoutSec ?? DEFAULT_TIMEOUT_SEC,
                }, {
                    ...yeonjangOptions,
                    timeoutMs: (params.timeoutSec ?? DEFAULT_TIMEOUT_SEC) * 1000,
                });
                const combined = [remote.stdout, remote.stderr ? `[stderr]\n${remote.stderr}` : ""].filter(Boolean).join("\n");
                return {
                    success: remote.success,
                    output: combined || "(no output)",
                    details: {
                        via: "yeonjang",
                        exitCode: remote.exit_code ?? null,
                        ...buildYeonjangTargetResolutionDetails(reboundSelection),
                    },
                    ...(remote.success ? {} : { error: remote.exit_code != null ? `Exit code: ${remote.exit_code}` : "remote execution failed" }),
                };
            }
        }
        catch (error) {
            if (!isYeonjangUnavailableError(error)) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    success: false,
                    output: `Yeonjang 명령 실행 실패: ${message}`,
                    error: message,
                    details: {
                        via: "yeonjang",
                        ...buildYeonjangTargetResolutionDetails(selection),
                    },
                };
            }
        }
        const failure = yeonjangRequiredFailure("system.exec");
        return {
            ...failure,
            details: {
                ...(failure.details && typeof failure.details === "object" ? failure.details : {}),
                ...buildYeonjangTargetResolutionDetails(selection),
            },
        };
    },
};
//# sourceMappingURL=shell.js.map