import { admitWebResearchNextAction, createWebResearchMethodReceipt, } from "../contracts/web-research-method.js";
export async function executeWebResearchMethodProposal(input) {
    if (!input.runId.trim() ||
        input.runId.trim() !== input.snapshot.runId ||
        !input.receiptId.trim()) {
        return {
            ok: false,
            reasonCode: "web_research_context_invalid",
        };
    }
    let proposal;
    try {
        proposal = await input.provider.proposeNextAction({
            runId: input.runId,
            snapshot: input.snapshot,
        });
    }
    catch {
        return {
            ok: false,
            reasonCode: "web_research_provider_failed",
        };
    }
    try {
        const receipt = createWebResearchMethodReceipt({
            receiptId: input.receiptId,
            runId: input.runId,
            snapshot: input.snapshot,
            proposal,
        }, input.createFingerprint);
        return admitWebResearchNextAction({
            runId: input.runId,
            snapshot: input.snapshot,
            proposal,
            receipt,
        }, input.createFingerprint);
    }
    catch {
        return {
            ok: false,
            reasonCode: "web_research_provider_output_invalid",
        };
    }
}
//# sourceMappingURL=web-research-method-use-case.js.map