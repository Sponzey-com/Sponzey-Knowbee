import { redactLogText } from "../../logger/index.js";
export function toolUserFacingErrorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw);
}
//# sourceMappingURL=error-redaction.js.map