function normalizedName(value) {
    return value.normalize("NFKC").trim().toLocaleLowerCase();
}
function signature(command) {
    if (command.kind === "create")
        return JSON.stringify([
            command.kind,
            normalizedName(command.name),
            command.role.trim(),
            command.modelName?.trim() ?? "",
        ]);
    if (command.kind === "update")
        return JSON.stringify([
            command.kind,
            command.agentRef,
            command.baseRevision,
            normalizedName(command.name),
            command.role.trim(),
        ]);
    return JSON.stringify([command.kind, command.agentRef, command.baseRevision, command.confirmed]);
}
function terminalReceipt(input) {
    return {
        mutationId: input.command.envelope.mutationId,
        nonce: input.command.envelope.nonce,
        requestSignature: input.requestSignature,
        kind: input.command.kind,
        state: input.state,
        reasonCode: input.reasonCode,
        transitions: [...input.transitions, input.state],
        ...(input.record
            ? {
                agentRef: input.record.agentRef,
                revision: input.record.revision,
                name: input.record.name,
                role: input.record.role,
                impact: {
                    activeChildCount: input.record.activeChildCount,
                    activeBindingCount: input.record.activeBindingCount,
                },
            }
            : {}),
    };
}
export function executeAgentIdentityCommand(command, repository) {
    const requestSignature = signature(command);
    const existingReceipt = repository.receiptByNonce(command.envelope.nonce);
    if (existingReceipt) {
        if (existingReceipt.mutationId === command.envelope.mutationId &&
            existingReceipt.requestSignature === requestSignature)
            return existingReceipt;
        return terminalReceipt({
            command,
            requestSignature,
            state: "conflict",
            reasonCode: "agent_mutation_nonce_conflict",
            transitions: ["draft", "validating"],
        });
    }
    const transitions = ["draft", "validating"];
    const envelope = command.envelope;
    if (!envelope.mutationId.trim() ||
        !envelope.nonce.trim() ||
        !envelope.actorRef.trim() ||
        envelope.scope !== "agent_identity") {
        const receipt = terminalReceipt({
            command,
            requestSignature,
            state: "failed",
            reasonCode: "agent_mutation_envelope_invalid",
            transitions,
        });
        repository.saveReceipt(receipt);
        return receipt;
    }
    if (command.kind === "archive" && !command.confirmed) {
        const record = repository.recordByRef(command.agentRef) ?? undefined;
        const receipt = terminalReceipt({
            command,
            requestSignature,
            state: "cancelled",
            reasonCode: "agent_archive_confirmation_required",
            transitions,
            ...(record ? { record } : {}),
        });
        repository.saveReceipt(receipt);
        return receipt;
    }
    let current = null;
    if (command.kind !== "create") {
        current = repository.recordByRef(command.agentRef);
        if (!current) {
            const receipt = terminalReceipt({
                command,
                requestSignature,
                state: "failed",
                reasonCode: "agent_ref_not_found",
                transitions,
            });
            repository.saveReceipt(receipt);
            return receipt;
        }
        if (current.agentType === "knowbee") {
            const receipt = terminalReceipt({
                command,
                requestSignature,
                state: "failed",
                reasonCode: "main_agent_mutation_forbidden",
                transitions,
            });
            repository.saveReceipt(receipt);
            return receipt;
        }
        if (current.revision !== command.baseRevision) {
            const receipt = terminalReceipt({
                command,
                requestSignature,
                state: "conflict",
                reasonCode: "agent_revision_conflict",
                transitions,
                record: current,
            });
            repository.saveReceipt(receipt);
            return receipt;
        }
    }
    if (command.kind !== "archive") {
        const normalized = normalizedName(command.name);
        if (!normalized) {
            const receipt = terminalReceipt({
                command,
                requestSignature,
                state: "failed",
                reasonCode: "agent_name_required",
                transitions,
                ...(current ? { record: current } : {}),
            });
            repository.saveReceipt(receipt);
            return receipt;
        }
        if (!command.role.trim()) {
            const receipt = terminalReceipt({
                command,
                requestSignature,
                state: "failed",
                reasonCode: "agent_role_required",
                transitions,
                ...(current ? { record: current } : {}),
            });
            repository.saveReceipt(receipt);
            return receipt;
        }
        const duplicate = repository.recordByNormalizedName(normalized);
        if (duplicate && duplicate.agentRef !== current?.agentRef) {
            const receipt = terminalReceipt({
                command,
                requestSignature,
                state: "conflict",
                reasonCode: "agent_name_conflict",
                transitions,
                ...(current ? { record: current } : {}),
            });
            repository.saveReceipt(receipt);
            return receipt;
        }
    }
    transitions.push("persisting");
    const persisted = command.kind === "create"
        ? repository.create({
            name: command.name.trim(),
            normalizedName: normalizedName(command.name),
            role: command.role.trim(),
            ...(command.modelName?.trim() ? { modelName: command.modelName.trim() } : {}),
        })
        : command.kind === "update"
            ? repository.compareAndUpdate({
                agentRef: command.agentRef,
                baseRevision: command.baseRevision,
                name: command.name.trim(),
                normalizedName: normalizedName(command.name),
                role: command.role.trim(),
            })
            : repository.compareAndArchive({
                agentRef: command.agentRef,
                baseRevision: command.baseRevision,
            });
    if ("reasonCode" in persisted) {
        const state = persisted.reasonCode.includes("conflict") ? "conflict" : "failed";
        const receipt = terminalReceipt({
            command,
            requestSignature,
            state,
            reasonCode: persisted.reasonCode,
            transitions,
            ...(current ? { record: current } : {}),
        });
        repository.saveReceipt(receipt);
        return receipt;
    }
    transitions.push("verifying");
    const verified = repository.recordByRef(persisted.agentRef);
    if (!verified || verified.revision !== persisted.revision) {
        const receipt = terminalReceipt({
            command,
            requestSignature,
            state: "failed",
            reasonCode: "agent_mutation_verification_failed",
            transitions,
            record: persisted,
        });
        repository.saveReceipt(receipt);
        return receipt;
    }
    const receipt = {
        mutationId: envelope.mutationId,
        nonce: envelope.nonce,
        requestSignature,
        kind: command.kind,
        state: "active",
        agentRef: verified.agentRef,
        revision: verified.revision,
        name: verified.name,
        role: verified.role,
        impact: {
            activeChildCount: verified.activeChildCount,
            activeBindingCount: verified.activeBindingCount,
        },
        transitions: [...transitions, "active"],
    };
    repository.saveReceipt(receipt);
    return receipt;
}
export function publicAgentIdentityReceipt(receipt) {
    const { nonce: _nonce, requestSignature: _signature, ...safe } = receipt;
    return safe;
}
//# sourceMappingURL=agent-identity-command.js.map