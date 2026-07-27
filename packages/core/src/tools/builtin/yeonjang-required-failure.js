const DEFAULT_NEXT_ACTION = "Yeonjang을 연결하거나 해당 기능을 지원하는 인스턴스를 선택한 뒤 다시 실행하세요.";
export function buildYeonjangRequiredFailure(input) {
    const reason = input.reason?.trim();
    const method = input.method?.trim();
    const reasonCode = input.reasonCode ??
        (reason ? "core_local_path_forbidden" : "method_unavailable_or_disconnected");
    const message = reason
        ? `이 작업은 Yeonjang 연장을 통해서만 실행할 수 있습니다. ${reason}`
        : `이 작업은 Yeonjang 연장을 통해서만 실행할 수 있습니다. 현재 연결된 연장이 \`${method ?? "unknown"}\` 메서드를 지원하지 않거나 연결되어 있지 않습니다.`;
    const userNextAction = input.userNextAction?.trim() || DEFAULT_NEXT_ACTION;
    return {
        success: false,
        output: `${message}\n다음 행동: ${userNextAction}`,
        error: "YEONJANG_REQUIRED",
        details: {
            requiredExecutor: "yeonjang",
            ...(method ? { requiredMethod: method } : {}),
            missingYeonjangCapability: method ?? null,
            reasonCode,
            knowbeeOnlyFallbackAvailable: true,
            userNextAction,
        },
    };
}
//# sourceMappingURL=yeonjang-required-failure.js.map