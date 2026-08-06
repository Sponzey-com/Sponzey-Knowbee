# Sponzey Knowbee Release, Backup, Restore, Rollback Runbook

## Purpose

This runbook defines the minimum release process for Sponzey Knowbee. A release is not just a binary build. It must carry the Gateway/CLI bundle, WebUI static files, prompt seed files, DB migration source, Yeonjang protocol files, package checksums, backup rehearsal evidence, and rollback instructions.

## Release Version Rule

- The displayed release version is based on `git describe --tags --always --dirty`.
- `KNOWBEE_DISPLAY_VERSION` or `KNOWBEE_GIT_VERSION` may override display version for reproducible CI builds.
- Gateway `/api/status`, CLI `--version`, and Yeonjang MQTT/node status must expose the same git-tag-derived version when built from the same checkout.
- `package.json` and `Cargo.toml` remain package baseline versions. They do not replace the release display version.

## Release Artifact Inventory

Required payload:

- Gateway/CLI Node bundle: the complete `packages/cli/dist` and `packages/core/dist` trees,

  including `launcher.js`, `serve-entry.js`, `runtime/serve-bundle.js`,
  `runtime/serve-bundle.manifest.json`, and `runtime/bootstrap.js`. Local, service, npm, and
  release startup must resolve the same verified serve bundle.
- WebUI static build: `packages/webui/dist`.
- DB migration source: `packages/core/src/db/migrations.ts`.
- Approval continuation migration 72 and canonical approval-state migration 73 must be

  applied together in the candidate database. Migration 73 preserves existing canonical
  aggregate and receipt rows while adding `AWAITING_APPROVAL` and the `approval` receipt
  kind; reject release if either table still exposes the older CHECK contract.
- Prompt seed files: all required files from the prompt source registry, including the canonical

  `prompts` directory inside the staged Core npm package at `dist/prompts`.
- Yeonjang protocol and permission contract: `Yeonjang/src/protocol.rs`, `Yeonjang/manifests/permissions.json`.
- Release runbook: `docs/release-runbook.md`.

Platform payload:

- macOS: `Yeonjang.app` from `scripts/build-yeonjang-macos.sh`.
- Windows: `knowbee-yeonjang.exe`, `build/start/stop-yeonjang-windows.bat`, tray/service packaging notes.
- Linux: `knowbee-yeonjang` binary from a Linux build host.

Platform binaries are optional on a single-host local release build, but must be present before publishing a release for that platform.

### Installer lifecycle ownership gate

The candidate installer must create a bounded `.knowbee-install-root.json` ownership marker and
version directories outside the independent `~/.knowbee` application state. Exercise
first-install, same-version, upgrade, downgrade and forced post-check rollback before publishing.
`knowbee uninstall` must stop and remove only the candidate service, launcher, versions and
installer receipts; it must preserve `~/.knowbee`. Run `knowbee uninstall --purge` as a separate,
explicit destructive cell and prove the state root is then absent. A live lifecycle lock,
malformed ownership marker, unexpected install-root entry, unsafe launcher or service-stop
failure must block deletion. Windows must run uninstall from a copied private Node so the active
version is not held open while it is removed.

### Installer option and offline gate

Run default, every effect opt-out, no-service, registered-but-not-started, non-interactive JSON and
dry-run profiles on both bootstraps. Dry-run must create no temporary installer directory and call
neither network nor application handoff. Mutation JSON without `--non-interactive`, half an offline
pair, duplicate/conflicting/unknown flags and unsupported locale must fail before download.

For offline cells, remove network access and supply `--manifest` plus `--bundle-dir`; require the
same pinned verifier digest, unsigned manifest artifact digest, target receipt and staged entrypoint as online.
There is no online fallback. `--with-yeonjang` requires exact platform package inventory and may
record no OS permission or launch effect before authenticated initialization. Re-run the same
release with a different effect profile and require profile convergence rather than an
inventory-only `already_active` result.

### Unsigned installer candidate and prerelease gate

The tag workflow verifies the pinned Node 24.18.0 `SHASUMS256.txt.sig` with the pinned Node
release-key archive, builds each of the five native bundles twice, and emits an unsigned manifest
v2 with bundle and verifier SHA-256 receipts. Node supplier GPG verification remains required.
Knowbee bundle, verifier and manifest are not publisher-authenticated: every installer and native
receipt records `unsigned_origin_unverified`. HTTPS, pinned bootstrap verifier digests, exact target
selection and artifact SHA-256 prevent transport/corruption mistakes but do not authenticate a
release origin.

macOS and Windows jobs do not import certificates, sign, notarize, staple or run Authenticode.
The Linux Yeonjang package builds in Rocky Linux 8.10 (glibc 2.28 and GCC 8), the native verifier
uses `x86_64-unknown-linux-musl`, and native evidence checks header target plus exact candidate,
artifact and verifier digests; Linux also checks the stated ABI floor.

The macOS application plist, Rust build and Swift camera helper all pin deployment target 13.5;
the macOS verifier build uses the same target. This does not replace an actual 13.5 clean-machine
cell. `macos-15-intel` is the explicit Intel runner label. `windows-11-arm` is currently a GitHub
hosted public-preview label, so verify that it is available to this repository before starting a
candidate. If it is unavailable, route the exact ARM64 job to an approved native self-hosted runner
or leave the ARM64 cell incomplete; never substitute the x64 runner or copy its receipt.

Run `.github/workflows/installer-native-evidence.yml` with the immutable tag and exact candidate
workflow run ID. It verifies and extracts the exact unsigned manifest artifact on its target host,
then records target header/digest evidence (and `readelf` ABI evidence on Linux). The aggregate artifact is
`installer-native-evidence-<tag>` and contains five candidate-, bundle-, and verifier-bound rows.
It is an input to the later clean-machine artifact; it is not by itself installation or rollback
success.

Run `installer release finalize` only with the exact candidate workflow run and an independently
produced `installer-clean-machine-evidence-<tag>` artifact. It must contain:

- `platform-evidence.json`: five unique `unsigned_origin_unverified` receipts bound to manifest,
  bundle and native verifier digests. Linux also requires the glibc 2.28, `GLIBCXX_3.4.25`, and
  verifier glibc floor checks.
- `dry-run-receipts.json`: five unique target receipts with the same candidate and bundle digest.
- `rollback-receipt.json`: a passed previous-version rollback receipt for the same candidate.

The finalizer verifies the unsigned manifest, all five verifier receipts, every platform
cell, dry-run cells and rollback before rendering `install.sh` or `install.ps1`. It uploads only
to an already-existing prerelease and never selects `latest` or approves a stable promotion.
Missing native host, a mismatched digest, failed rollback, unresolved
bootstrap placeholder, or non-prerelease target blocks upload.

#### Installer rehearsal, finalization, and stable promotion order

Use one immutable `release_tag` and preserve every workflow run ID. Do not substitute another run
because its tag or version text looks equivalent.

Before opening a candidate workflow, an authenticated release operator can run the read-only
preflight below. It checks the three required protected environments and their
`required_reviewers` protection rule, at least one self-hosted runner registration, and the exact
prerelease tag; it does not inspect or expose secrets, create a release, or substitute for
native/clean-machine evidence.

```bash
node scripts/check-installer-release-readiness.mjs \
  --repo Sponzey-com/Sponzey-Knowbee \
  --release-tag vX.Y.Z-rc.N
```

A nonzero result is a release blocker. Resolve every returned `missing` item and rerun the
preflight before beginning the sequence below.

1. Run `npm release` for the tag and retain the
   `installer-release-candidate-<tag>` artifact and its run ID.
2. Run `installer native evidence` with that candidate run. It must produce all five
   `unsigned_origin_unverified` native rows.
3. Run `installer rehearsal publish` with the candidate and native-evidence run IDs. The protected
   `installer-release-publish` environment renders the unsigned bootstrap and uploads the scripts,
   manifest, five bundles, five verifiers, and `installer-rehearsal-gate.json` only to the
   already-existing exact prerelease.
4. On GitHub-hosted Actions clean matrix hosts, exercise the published prerelease bytes. Produce one
   artifact per exact target named `installer-clean-machine-receipt-<target>`, containing
   `clean-machine-receipt-<target>.json`. Each closed receipt must state
   `originTrust=unsigned_origin_unverified` and record that the OS warning was both observed and
   acknowledged; it must not claim publisher authentication. Each hosted job is an external release
   operation and must not be replaced with fixture or synthetic passed receipts.
5. Run `installer clean machine evidence` with the candidate, native-evidence, and independent
   receipt run IDs. It accepts exactly five closed-schema receipts and binds every one to the same
   candidate and artifact SHA-256. Each receipt must report one command, zero or one confirmation,
   zero follow-up commands, and passed dry-run, online/offline install, service/health/WebUI,
   opt-out, login PATH, same-version, upgrade, forced rollback, reinstall, state-preserving
   uninstall, and reboot recovery checks.
6. Run `installer release finalize` with the candidate and aggregated evidence run IDs. It verifies
   that the 14 rehearsal bytes are unchanged, then adds only `installer-release-gate.json` and
   `installer-finalized-assets.json`. The finalizer artifact contains the exact 14 publishable
   assets and their size/SHA-256 inventory.
7. Review the finalizer evidence, then manually run `installer stable promote` through the
   protected `installer-stable-promotion` environment. Supply the exact finalizer run ID and the
   currently observed `previous_latest_tag`. The workflow re-downloads and hashes all 14 release
   assets before changing release state; it has no build or signing credentials.

Stable promotion changes the exact release from prerelease to stable/latest only after the final
inventory passes. It then downloads both `releases/latest/download/install.sh` and
`install.ps1` and compares them byte-for-byte with the finalized artifact. If that post-check
fails, the workflow marks the candidate prerelease again and restores `previous_latest_tag` as
latest. It never deletes or rebuilds release assets. If automatic restoration itself fails, stop
all publishing, leave the candidate commands undocumented as current, and restore the two release
pointers manually before any retry.

### Gateway-free Yeonjang macOS device pre-gate

On a macOS arm64 release host, build the signed package and run the direct MQTT
device gate before any Gateway or channel acceptance:

```bash
bash scripts/build-yeonjang-macos.sh
YEONJANG_LIVE_DEVICE_GATE=1 bash scripts/self/run-yeonjang-independent-mqtt-gate.sh
```

The exact signed app must already have Camera and Screen Recording permission;
the gate does not request or change OS permission. It verifies loaded/package
identity, independent Mosquitto mTLS and exact ACL, then a signed
`capture.permission.get` response before any artifact exists. Both camera and
screen must report platform availability, canonical local policy, and the
actual non-prompting OS observation as separate fields. It then verifies one
signed revision-CAS deny for each capture capability. Capabilities and
permission read must expose the same new revision and denied policy rows while
`advertisedMethods` continues to describe executable implementation support.
Both denied commands must return `local_policy_denied` before effect and leave
zero artifacts. The gate must then apply a signed rollback to the original
allow snapshot and continue with one real camera JPEG and one real screen PNG,
terminal and artifact digest
agreement, camera consumer ACK/cleanup, screen transfer cancel, late-ACK
fail-closed behavior, cancel replay, restart cleanup, graceful shutdown, and
same-instance reacquisition. Record the command result with the candidate
identity. A transport-only run without
`YEONJANG_LIVE_DEVICE_GATE=1`, helper output, a camera indicator light, MQTT
PUBACK, or a Gateway/channel smoke is not device-completion evidence. This
macOS result must not fill Windows or Linux matrix cells.

The live gate enables `--stage-timing-jsonl` only on the package process. Before
restart it must parse bounded Product JSONL and require one or more observations
for the closed queue, authorization, handler, post-check, publish, transfer, and
ack inventory. Every row must carry only a SHA-256 correlation plus wall-clock
endpoints and monotonic microsecond duration; broker secrets and private config,
key, or artifact paths must be absent. Record the emitted target OS,
architecture, stage, and `duration_us` lines as the package baseline. Missing
stages or redaction failures block the cell. A duration value alone never
changes effect outcome, retry strategy, timeout, terminal state, or delivery
state.

The same gate sends an exact `command.cancel` while the macOS camera helper is
running. Require a distinct signed cancel acknowledgement with `accepted`, a
target command terminal with `cancelled`, and no artifact. A blocking command
worker may register after the following control worker starts, so the canonical
registry may observe that transition for at most 500ms. This coordination
grace must not be interpreted as effect success or failure, and a cancel ACK
must never substitute for the target terminal.

Publish one exact signed camera command payload twice in succession. Require
one successful immutable terminal/artifact. The competing delivery may return
`authorization_replayed` or `idempotency_in_progress` with
`effect_state=not_started`, or replay the same terminal binding; it must not
produce another artifact identity. Fetch and digest the artifact, then bind
ACK to the canonical lifecycle's current awaiting-ACK revision rather than
computing a revision. Cleanup and the following normal capture must pass.

The gate then restarts only the Mosquitto process in its owned container,
preserving the exact host port and certificate fixture while forcing both TLS
connections closed. Require the signed app to reconnect without an external
signal, resubscribe every ingress topic, and publish fresh signed online and
capability projections. Reconnect the requester with the same mTLS/client
identity and require subsequent real camera and screen terminal/artifact
completion. A Docker container restart whose random published port disappears
is test-infrastructure failure, not product reconnect evidence. TLS socket I/O
is recoverable; certificate, key, DNS, authentication, and handshake failures
remain terminal.

After graceful signed-app shutdown and same-instance restart, redeliver the
exact previously completed camera command. Require identical terminal payload,
opaque receipt ID, and response digest with zero new artifact. Message ID,
issued time, nonce, and signature are publication fields and may change; they
must not be used as durable delivery identity.

For forward compatibility, seed one legacy sequence-derived schema-1 delivery
receipt and replay its exact terminal through the candidate runtime. The wire
response must reuse that legacy ID and its durable published/acknowledged
revision. Both old and new binaries accept either opaque bounded ID format.
If storage contains multiple legacy IDs for one immutable terminal binding,
block publication and repair the state; never choose one or create another.

The permission read is an additive `yeonjang.control.v2` contract:
`capture.permission.get` has empty params and requires the exact
`permission.read` HMAC scope. Its signed response schema is
`yeonjang.capture-permission-response.v2`; unavailable outcomes contain no
success-looking permission rows. It does not change existing command,
capabilities, artifact, or policy schemas. Before a mixed-version rollout, the
requester must use pairing/package release identity to prove the target
supports this discriminator. An older runtime rejects it before effect and
does not publish a response; therefore rollback must disable the query rather
than translating it to a legacy method or inferring permission from timeout.

Pre-effect command failures use the signed, QoS 1, non-retained
`yeonjang.command-rejection.v2` response. Verify that a v1 command returns
`protocol_upgrade_required` with `effect_state=not_started`, performs no platform
effect, and creates no terminal delivery receipt. The envelope binds only the
configured instance/session/requester topic identity and a SHA-256 input
correlation; it must not copy untrusted request, command, operation, or
idempotency identities. Retained commands remain non-publishing rejections.

Production terminal content schema 3 carries `target_scope_digest`. Use that
exact value for signed `receipt.get`; never substitute the platform
`terminal.binding_digest`. Verify the receipt response returns the same
immutable terminal revision, then bind the original terminal `receipt_id`,
`response_digest`, and revision into `response.ack`. Only its `accepted`
result is consumer acknowledgement; MQTT PUBACK and artifact ACK are separate.
Redelivery must return `duplicate` with the same delivery revision.

Readers remain compatible with durable terminal content schema 1 and 2. A
runtime that writes schema 3 cannot be rolled back to a binary that rejects the
new field. Before release, prepare and exercise a previous-version rollback
package containing schema 3 read compatibility; otherwise stop the rollout
rather than deleting, rewriting, or guessing terminal state.

Run the previous-package rehearsal on one native reference host for the
platform-neutral Rust durable schema. Each selected OS still requires its own
package/loaded identity and device gate. Repeat the rollback rehearsal on
another OS only when that release changes an OS-specific persistence or
serialization boundary:

```bash
YEONJANG_LIVE_DEVICE_GATE=1 \
YEONJANG_ROLLBACK_GATE=1 \
YEONJANG_ROLLBACK_BINARY='/absolute/previous/package/binary' \
YEONJANG_ROLLBACK_PACKAGE_MANIFEST='/absolute/previous/release-identity.json' \
  bash scripts/self/run-yeonjang-independent-mqtt-gate.sh
```

Both paths are mandatory, absolute, non-symlink package inputs. The loaded
previous identity must match its manifest and the current OS/architecture but
have a different binary digest from the current candidate. The current package
first writes a successful schema-3 camera terminal and shuts down cleanly. The
gate then starts the previous package against the same config and durable state,
redelivers the exact signed command, and requires identical terminal payload,
receipt ID, and response digest with no new artifact before graceful shutdown.
Startup, online status, timeout, or current-binary restart alone is not rollback
evidence. Verify the platform package signature through the normal native
package gate before supplying it to this rehearsal.

The 2026-07-31 macOS arm64 rehearsal used two valid signed bundles with distinct
binary digests. The current package wrote the schema-3 camera terminal; the
06:25 previous package replayed the exact terminal payload, receipt ID, and
response digest from the same state root with no new camera effect. This is the
schema compatibility evidence. Windows ARM64 and Ubuntu X11 package/device
identity remain independently proven by their native gates.

### Gateway-free Yeonjang Windows/Linux device gates

Windows 11 native x64, Windows 11 native ARM64, Ubuntu LTS Wayland, and Ubuntu
LTS X11 are separate evidence cells. The release matrix may designate which
native Windows architecture is required, but a result from one architecture
must never be copied into the other cell. Each executed cell must use the
packaged binary and direct TLS/mTLS MQTT v2
path to verify camera JPEG, screen PNG, exact terminal/artifact digest,
consumer ACK, cleanup, shutdown, and same-instance restart. A host-side unit
test, cross-compile, tool lookup, `/dev/video*` observation, or another OS result
must not fill these cells.

Linux capability readiness is evaluated from one startup snapshot. Camera
requires both a supported capture tool and an observed `/dev/video*`; screen
requires a backend compatible with the observed Wayland or X11 session.
Unknown or mismatched sessions remain unadvertised. Linux display index
selection is currently an exact pre-effect limitation, not a generic helper
failure. The Windows source/helper DTO is compiled by host-side tests, but each
Windows architecture's package, process identity, OS permission, and actual
output remain unverified until that native device cell runs.

Run each Linux cell from that exact interactive session. The script builds and
packages the current native binary, fails before effect when camera/session
prerequisites are absent, and invokes the shared desktop requester contract:

```bash
XDG_SESSION_TYPE=wayland YEONJANG_LIVE_DEVICE_GATE=1 \
  bash scripts/self/run-yeonjang-independent-mqtt-gate.sh
XDG_SESSION_TYPE=x11 YEONJANG_LIVE_DEVICE_GATE=1 \
  bash scripts/self/run-yeonjang-independent-mqtt-gate.sh
```

Do not run the Linux gate through SSH without the actual desktop display and
device access. Run each Windows cell from Git Bash in the exact interactive
Windows 11 native camera/display session:

```bash
YEONJANG_LIVE_WINDOWS_CAMERA_DEVICE_ID='<exact-device-id>' \
  YEONJANG_LIVE_DEVICE_GATE=1 \
  bash scripts/self/run-yeonjang-independent-mqtt-gate.sh
```

The gate reads the physical processor's CIM `Architecture` code so an x64 Git
Bash process cannot misreport an ARM64 host. It accepts only native x64 or ARM64,
rejects explicit target overrides, and rejects a missing exact camera device ID before
building and packaging the matching native binary. The PE architecture,
release manifest, and loaded executable digest must all match that native
target. It runs the same shared assertions. The packaged GUI-subsystem process
attaches its parent
console once; the gate creates an exact process group and sends Ctrl+Break so
offline publication, runtime drain, lease release, and same-instance restart
are verified without terminating the requester. Keep an architecture cell
incomplete until this full gate runs with Docker, OpenSSL, Node, Rust, camera,
display, and pre-granted OS permissions on that exact native host.

The selected 2026-08-05 Parallels `Windows 11 - 개발` ARM64 session passed this full gate,
including actual camera JPEG, screen PNG, duplicate single-effect convergence,
running cancellation, artifact fetch/digest/ACK/cancel/cleanup, broker/runtime
restart, and singleton reacquisition. Ubuntu `192.168.20.123` passed the same
gate from its active X11 desktop session on 2026-08-05. The signed macOS arm64
package also passed its native direct-MQTT camera/screen gate on the same date.
These are the required desktop cells for the current user-selected release
matrix. Windows x64 and Ubuntu Wayland remain separately runnable compatibility
profiles; they are not claimed as actual results in this release.

## Release Readiness Authorization

Performance and sub-agent rollout gates require explicit administrator decisions. The release commands never create an approval, choose thresholds, or infer a database from the active runtime environment.

1. Prepare a performance matrix JSON candidate containing `schemaVersion`, `matrixId`, `matrixVersion`, `baselineVersion`, the complete five-flow `baselineSnapshot`, and thresholds for `direct_answer`, `current_fact_read`, `tool_write`, `child_delegation`, and `cancel`.
2. Prepare a rollout policy JSON candidate containing `schemaVersion`, `policyId`, `policyVersion`, `releaseMode`, and all rollout thresholds. `duplicateFinalAnswerCount` must remain zero.
3. Review the values and record each decision in the exact runtime evidence database. The command derives the administrator identity from the local OS login; actor, role, or authentication values cannot be supplied as arguments.

```bash
pnpm run release:authorize -- \
  --database <runtime-evidence.db> \
  --candidate <performance-matrix.json> \
  --scope performance \
  --decision approved \
  --authorization-id <unique-performance-decision-id>

pnpm run release:authorize -- \
  --database <runtime-evidence.db> \
  --candidate <rollout-policy.json> \
  --scope rollout \
  --decision approved \
  --authorization-id <unique-rollout-decision-id>
```

Use `denied` or `revoked` with a new authorization ID to supersede an earlier approval. Records are append-only; reusing an authorization ID is rejected.

4. Select one completed runtime run for every required performance flow, then pass the exact authorization and run selectors to the standard dry-run.

```bash
pnpm run release:dry-run -- \
  --rollout-database <runtime-evidence.db> \
  --rollout-policy-id <policy-id> \
  --rollout-policy-version <positive-version> \
  --rollout-policy-mode <limited_beta|full_enable> \
  --database <runtime-evidence.db> \
  --matrix-id <matrix-id> \
  --matrix-version <positive-version> \
  --baseline-version <baseline-version> \
  --run direct_answer=<run-id> \
  --run current_fact_read=<run-id> \
  --run tool_write=<run-id> \
  --run child_delegation=<run-id> \
  --run cancel=<run-id>
```

The dry-run opens both databases read-only, verifies exact latest decisions and measured run evidence, and still blocks publication until signed live acceptance is present. Candidate contents, thresholds, baseline snapshots, and local paths are not printed by the authorization command.

## Production Live Acceptance and External Signing

Live acceptance is disabled during ordinary local startup. Enable it only for an intentional release run; changing the environment of an already running Gateway is unsupported.

1. Restart the local services with the live executor and administrator UI enabled.

```bash
bash scripts/knowbee-start.sh --restart --admin-ui --live-acceptance
```

2. Confirm readiness without making an external call or writing a signing request.

```bash
pnpm --filter @knowbee/cli exec knowbee smoke acceptance --check --json
```

`ready` means all seven bounded capability checks are ready: WebUI, Telegram, Slack, Web, one safe read-only Skill selection, one safe read-only MCP selection, and one trusted online Yeonjang session. The response never includes target, binding, catalog, tool, session, token, secret, or filesystem identifiers. `disabled`, `unavailable`, an authentication failure, or a transport failure blocks the live run. The command exits non-zero for every non-ready result while leaving the Gateway running. Do not treat Gateway liveness as live acceptance readiness.

The execution preflight also compares the startup-captured Gateway bundle identity with the
current version-2 bundle manifest, bundle digest, launcher-entry digest, bundled-input-set
digest, build status, artifact timestamp, and process start time.
`live_acceptance_runtime_build_required`,
`live_acceptance_runtime_restart_required`,
`live_acceptance_runtime_bundle_identity_mismatch`, or
`live_acceptance_runtime_identity_invalid` blocks the run before any external live work. Build
and generated-source tests do not prove that an already running Gateway loaded those files.
Rebuild and perform a controlled restart, then repeat the check; never bypass this gate by
editing the manifest or treating `/api/health` as activation evidence.

3. Create one schema-version-2 execution request containing the exact release candidate identity, active authorization reference, one read-only Skill selection, one read-only MCP selection, the exact online Yeonjang instance/session using `system.info`, and the trusted public signing key ID. Execute it through the authenticated Gateway.

```bash
pnpm --filter @knowbee/cli exec knowbee smoke acceptance --request <live-acceptance-execution-request.json> --json
```

The run must collect exactly one accepted evidence receipt for WebUI, Telegram, Slack, Web, Skill, MCP, and Yeonjang. A partial collection remains blocked. The Gateway writes an exclusive signing request under the configured state directory; the CLI does not expose its local path or raw evidence.

4. Transfer that signing request to the external signer identified by `requestedKeyId`. The repository and Gateway must never receive or store the private key. The signer authenticates the release administrator, verifies the candidate, approval window and seven bounded evidence records, then returns a schema-version-1 Ed25519 signature response for the exact request ID and payload.
5. Assemble the response with the trusted public key. This command verifies request immutability, key identity, signature and candidate binding before creating the bundle.

```bash
pnpm run release:live:exchange -- assemble \
  --request <signing-request.json> \
  --signature-response <signature-response.json> \
  --public-key <trusted-release-public-key.pem> \
  --output <live-acceptance-bundle.json>
```

6. Run the standard dry-run with the Task 189 performance/rollout selectors plus the signed bundle inputs.

```bash
pnpm run release:dry-run -- \
  <performance-and-rollout-selector-arguments> \
  --live-acceptance-bundle <live-acceptance-bundle.json> \
  --live-acceptance-public-key <trusted-release-public-key.pem>
```

Publication remains blocked if the bundle is stale, signed by another key, bound to another candidate, missing a capability, or carries a revoked/expired approval. Stop and restart without `--live-acceptance` after the release operation.

## Release Build Order

1. Confirm checkout state and tag.
2. Run release dry-run: `pnpm run release:dry-run`.
3. Build packages: `pnpm -r build`.
4. Typecheck packages: `pnpm -r typecheck`.
5. Run automated tests: `pnpm test`.
6. Run Phase 022 execution decision regression gate: `pnpm run test:phase022`.
7. Run Phase 027 topology delegation/runtime cleanup gate: `pnpm run test:phase027`.
8. Run architecture cleanup gate: `pnpm run test:architecture`.
9. Review dead-code cleanup evidence in `.tasks/dead-code-candidates.md` and confirm no immediate-delete candidate remains in production source.
10. Run UI mode release gate: `pnpm test tests/task017-ui-release-gate.test.ts`.
11. Run memory compaction release gate: `pnpm exec vitest run tests/task006-memory-release-gate.test.ts`.
12. Run Yeonjang multi-instance release gate: `pnpm exec vitest run tests/task010-yeonjang-multi-instance-e2e.test.ts tests/task010-yeonjang-release-gate.test.ts`.
13. Run sub-agent release readiness gate: `pnpm test tests/task030-release-gate-rollback-soak.test.ts`.
14. Run Enterprise Topology release gate: `pnpm test tests/task025-enterprise-topology-release-gate.test.ts`.
15. Run backup/restore rehearsal: `pnpm run backup:rehearsal`.
16. Run channel delivery release gate: `pnpm exec vitest run tests/channel-delivery-fallback.test.ts tests/channel-smoke-runner.test.ts tests/channel-adapter-contract-runner.test.ts tests/channel-connections.test.ts tests/task013-channel-api.test.ts`.
17. Run channel smoke dry-run: `pnpm run smoke:channels`. WebUI and Telegram must each contain the five canonical scenarios (`basic_query`, `web_skill`, `approval_required_tool`, `artifact_delivery`, and `failure_tool`) from the same build with no skipped or failed result. Verify exact run/request-group/session binding, ordered LLM receipts, one final answer, and a visible delivery post-check; a transport acknowledgement is not completion evidence.
18. Build Yeonjang packages for each target OS.
19. Stage npm tarballs, install them in a clean consumer project, and start the installed CLI:

    `pnpm run smoke:install`.
20. Generate release manifest and checksum files: `pnpm run release:package`.
21. Run artifact cleanup CLI smoke: `pnpm run smoke:artifact-cleanup-cli`.
22. Review artifact cleanup preview for the release output if the release package output should be retired after publication:

    `knowbee admin artifact-cleanup --release-output-dir <release-output-dir> --json`.
23. Start the Gateway with `KNOWBEE_CHANNEL_SMOKE_LIVE=1`, then run at least one live channel smoke with `knowbee smoke channels --live --channel <webui|telegram|slack>`. Run without `--channel` only when all selected channels are configured. Derive the required scenario count from `getDefaultChannelSmokeScenarios()` and require every selected scenario to pass without a skipped result; do not maintain a fixed count in this runbook. Treat the 30-second objective as the first visible response budget, not as a count-only terminal failure rule. Record terminal latency separately; a slow provider or materially changed recovery path may continue while progress remains valid. Telegram live acceptance additionally requires an explicitly approved dedicated target and configured allowlist/credential. If that exact target approval is absent, record Telegram live acceptance as incomplete instead of substituting another target or a dry-run. Run one Yeonjang smoke before public publish.

For controlled local restart evidence, retain the bounded `gateway-startup.json` projection and
confirm one startup ID binds the PID, phase transitions, elapsed time, and terminal result. A
performance-budget overrun remains `still_starting`; it must not trigger cleanup. Only explicit
failed/cancelled or process exit may clean the exact current launch job/PID. Require repository
ownership, listener, `/api/health`, `/api/ready`, and WebUI checks before recording success.

## Release Artifact Cleanup Operation

Artifact cleanup is an explicit administrator operation. It is not part of ordinary Gateway startup, release packaging, live acceptance, or rollback. Preview does not delete files. Execution requires an exact confirmation phrase and must be started by an administrator after reviewing the preview.

```bash
knowbee admin artifact-cleanup --json
knowbee admin artifact-cleanup --release-output-dir <release-output-dir> --json
knowbee admin artifact-cleanup --execute --confirm "CONFIRM ARTIFACT CLEANUP"
knowbee admin artifact-cleanup --audit --json
```

`releaseOutputDir is an explicit action argument`; do not store it as mutable runtime configuration and do not inject it into a running process through environment changes. The command receives external values at invocation time and passes them through the cleanup use case boundary as explicit input.

Cleanup responsibility split:

- `release package output cleanup`: scans only a release output directory explicitly passed with `--release-output-dir`. The target must contain regular `manifest.json` and `SHA256SUMS` marker files. Payload cleanup uses the manifest artifact whitelist and does not delete rogue payload files, symlinks, or paths outside the payload root.
- `sanitized diagnostic export cleanup`: scans old admin diagnostic export artifacts created for sanitized release diagnostics. The public summary must not expose raw filesystem paths, filenames, internal evidence refs, or private payload content.
- `live acceptance signing request cleanup`: scans old external signing request files under the configured state directory. These files are private raw-by-design artifacts for an external signer, have operator cleanup retention, and are not exposed through a public route.
- `audit raw data retention`: remains owned by the audit subsystem and its purpose/access/confirmation policy. Audit raw data is not an artifact-cleanup target and must not be removed by `knowbee admin artifact-cleanup`.

Execution rules:

- Run preview first and check the user-facing display summary. Default output must hide internal reason codes, raw paths, filenames, manifest content, operation evidence, and raw registry data.
- Execute only with `--execute --confirm "CONFIRM ARTIFACT CLEANUP"` after the preview matches the intended target.
- Use `--audit --json` only when an administrator needs aggregate reason counts. Audit output may include aggregate public reason counts but must still hide raw paths, filenames, and private payload content.
- Verify post-delete verification fields after execution: `deletedFiles`, `verifiedDeletedFiles`, and `failedDeleteFiles`. A release operator must treat any non-zero `failedDeleteFiles` as a blocked cleanup and investigate before re-running cleanup.
- Do not use artifact cleanup to delete audit raw data, DB rows, run history, topology versions, prompt sources, generated source artifacts, or user memory.

Smoke selection:

- Default installed CLI smoke is non-destructive and must be safe for local developer machines and CI: `pnpm run smoke:artifact-cleanup-cli`.
- The default smoke verifies preview and confirmation-failure behavior only. It must not run a successful destructive cleanup path.
- The destructive success path is verified only with an isolated fixture: `node scripts/self/smoke-artifact-cleanup-cli.mjs --destructive-fixture`.
- The destructive fixture smoke must use a temporary release output directory created by the smoke script and must not target a real release output or user state.
- The destructive fixture smoke must verify that whitelisted old payload and marker files are deleted, rogue payload and symlink entries remain, and stdout, stderr, and audit log records do not expose raw paths, filenames, or reason codes by default.

## Memory Compaction Manual Smoke

Run these checks in `advanced` or `admin` UI mode before public publish.

### UI smoke

- Open `/advanced/memory` and confirm `Memory inspector` cards show raw token estimate, raw message count, latest capsule age, chain depth, rollup age, compaction reason, pending preservation count, recall hit count, and drift state.
- Confirm beginner UI does not expose memory internals, compact preview, or admin-only manual controls.
- Confirm the browser console is clean while opening the memory inspector and using the memory cards.

### Runtime smoke

- In admin UI mode, run `dry-run compact`, `latest capsule`, `rollup 보기`, and `safe restore`, then confirm they return preview-only data without mutating append-only history.
- Restart the local runtime and confirm latest capsule, continuity, and pending preservation state remain available after restart.

### Release smoke

- Confirm `memoryCompactionEvidence` appears in the release manifest and that `Memory compaction release gate` status is reviewed before publish.
- Confirm the Memory Compaction task documents and this runbook use the same UI/Runtime/Release smoke split.

## Yeonjang Multi-instance Manual Smoke

Run these checks on the target OS after the automated release gate passes.

### macOS desktop_interactive

- Start with `bash scripts/start-yeonjang-macos.sh --restart`.
- After the first process is healthy, run the same start command once without `--restart`. It must not terminate or replace the existing process; the new binary must reject the duplicate through its fixed runtime lease, while the recorded PID remains unchanged.
- Confirm normal restart reports reuse of the verified app bundle and does not run the build

  script. Use `bash scripts/start-yeonjang-macos.sh --restart --build` only for an explicit
  source/package rebuild.
- For release signing, provide an existing `YEONJANG_CODESIGN_IDENTITY`; helper and app

  `codesign --verify --deep --strict` checks must pass before launch.
- Confirm tray-first startup: the app launches hidden, tray remains available, and the main window is not forced open.
- Open and close the window from the tray menu, then confirm the close button hides back to tray instead of quitting.
- Confirm the node appears in `/api/status` and `/api/doctor`.
- Run one `screen.capture`, one camera capture, and one input baseline check.

### Windows desktop_interactive

- Start with `scripts\\start-yeonjang-windows.bat --restart`.
- Verify a normal second start leaves the first process and its PID projection intact, then reports the new process's runtime-lease rejection. Use `--restart` only to stop the exact recorded PID before launch.
- Confirm the notify icon appears and double click or tray menu opens the main window.
- Confirm close-to-tray behavior and explicit quit behavior.
- Confirm the node appears in `/api/status` and `/api/doctor`.
- Run one `screen.capture`, one camera capture, and one input baseline check.

### Linux desktop_interactive

- Start with `bash scripts/start-yeonjang-linux.sh --restart`.
- Verify a normal second start preserves the first process and PID projection and surfaces the new process's fixed runtime-lease rejection. `--restart` alone may stop the recorded PID.
- Confirm tray fallback behavior for the current desktop environment.
- Confirm the node appears in `/api/status` and `/api/doctor`.
- Run one `screen.capture` and verify desktop capability baseline.

### Linux headless_managed

- Start with `bash scripts/start-yeonjang-linux-headless.sh --restart`.
- Verify a normal second start preserves the first process and PID projection and surfaces the new process's fixed runtime-lease rejection. `--restart` alone may stop the recorded PID.
- Do not require tray or window behavior.
- Confirm the node appears in `/api/status` and `/api/doctor` with `headless_managed` support profile.
- Verify diagnostics-only flow and headless capability baseline.

### Fleet Summary Checks

- `/api/status` must show total instance count, local/remote count, trusted/pending/revoked count, duplicate conflict count, and update required count.
- `/api/doctor` must expose the same fleet summary through the Yeonjang checks without leaking raw fingerprints.
- Release dry-run evidence must include `yeonjangMultiInstanceEvidence`, the multi-instance pipeline step, and the checklist item.

## Execution Decision Regression Gate

Before release, `pnpm run test:phase022` must pass. The gate is defined in `docs/execution-decision-regression.md` and covers prompt source loading, prompt bundles, no-keyword execution decisions, orchestration planner compatibility, topology execution, explicit target validation, multilingual executor selection, risk boundaries, WebUI simple run UX, and Runtime Inspector evidence.

This gate is intentionally separate from long-running smoke and soak gates. It should remain fast enough to run frequently in CI, while live channels, Yeonjang smoke, backup rehearsal, and package release checks remain release-only evidence.

## Phase 027 Topology Delegation Gate

Before release, `pnpm run test:phase027` must pass. The gate protects the current topology runtime rules: the main agent and every current agent select from accessible direct children, deleted entry-selection fallback concepts stay out of runtime source, model profile timeout/retry fields do not terminate sub-sessions, provider direct routing is not used when topology executors are available, child results wait for parent aggregation, and Runtime Inspector/WebUI show selected executor, pending result, aggregation, and redelegation states instead of internal numeric execution limits.

The phase gate is split into:

- `pnpm run test:phase027:static`: removed routing/model-limit concepts do not return to source.
- `pnpm run test:phase027:routing`: execution-decision-first routing, topology executor selection, provider-direct blocking, and redelegation after child failure.
- `pnpm run test:phase027:runtime`: slow sub-session handling, late result aggregation, and no direct child-channel delivery.
- `pnpm run test:phase027:webui`: runtime inspector and topology trace display.

Release smoke must also confirm that a fresh channel request records no deleted entry-selection route reason, does not use provider direct when a matching direct child exists, and does not produce a model-timeout sub-session failure.

## Architecture Cleanup Gate

Before release, `pnpm run test:architecture` must pass. This gate binds the cleanup plan to executable evidence across source boundaries, runtime behavior, WebUI defaults, prompt bundles, and generated compatibility artifacts.

The architecture gate is split into:

- `pnpm run test:architecture:static`: Clean Architecture boundaries, deleted routing concepts, direct-child execution contracts, and critical-decision audit coverage.
- `pnpm run test:architecture:runtime`: current-agent fallback, execution trace, child result aggregation, final validation, and no direct child-channel delivery.
- `pnpm run test:architecture:webui`: default topology UI stays sub-agent settings first and excludes EnterpriseTopology V1, internal work-order/manual run, compile preview, and raw internal ids from basic surfaces.
- `pnpm run test:architecture:prompts`: prompt source registry, prompt bundle assembly, AGENTS/prompt policy alignment, and no raw keyword/count-limit instruction regressions.
- `pnpm run test:architecture:generated`: TypeScript source and `packages/core/src` compatibility artifacts are synchronized.

Release checklist:

- No compiled default entry, first-node selection, or default-entry route is reintroduced.
- No ordinary request falls through to provider direct execution without an explicit provider target.
- No raw keyword or regex executor routing is introduced in code or prompts.
- Retry, attempt, delegation-turn, queue-retry, and timeout counts are not terminal business failure limits.
- EnterpriseTopology V1, internal work-order/manual run, compile preview, and advanced route controls are absent from the default topology UI.
- Child results return to the parent/requesting agent and are not delivered directly to the user channel.
- Runtime Inspector and persisted trace agree on selected executor, fallback, aggregation, and finalizer state.
- Prompt bundles and `AGENTS.md` express the same delegation, self-solve, recovery, and completion policy.
- DB migration dry-run and backup rehearsal remain release blockers before public publish.

## Dead Code Cleanup Gate

Before release, `.tasks/dead-code-candidates.md` must be current. Immediate-delete items may be removed only when source references, package exports, tests, dynamic/runtime entry points, and generated artifacts have been checked. Public API, DB schema, compatibility adapters, and legacy/admin diagnostic surfaces must be deprecated or migrated in separate tasks instead of being deleted as part of opportunistic cleanup.

The cleanup gate must preserve the current product direction:

- Sub-agent graph/Topology V2 remains the runtime source of truth.
- Deleted routing concepts such as compiled default entry, keyword executor selection, provider-direct fallback, legacy follow-up auto attach, and attempt-count failure limits must not re-enter runtime behavior.
- Tests-only production exports should move to test helpers before deletion when they are still needed by regression coverage.
- Generated artifacts under `packages/core/src` must be synchronized from TypeScript source changes with `pnpm run core:sync-src-artifacts` and verified by `tests/generated-artifact-consistency.test.ts`.

## Channel Release Gate

The channel release gate must prove that provider differences are represented as channel fallback evidence, not as orchestration failures.

Automated or semi-automated gates:

- WebUI dry-run must pass every scenario currently returned for WebUI by `getDefaultChannelSmokeScenarios()`.
- Telegram and Slack must pass dry-run in CI and must have at least one live or semi-automated smoke before public publish when credentials are available.
- WebUI and Telegram live traces must bind the latest `first_response_latency_ms` metric to the exact run and request group, record total terminal-response latency separately, and fail the performance gate when the first response exceeds its 30-second budget. Terminal duration is diagnostic evidence and is not a retry-count or timeout-count instruction to abandon the user goal.
- A conversational request may complete directly from a valid LLM intake receipt. In that flow, require the exact request-group binding and exactly one canonical final delivery; do not invent execution-stage receipts. Executed requests must still pass the full run-bound terminal evidence gate.
- For an executed request, the live receipt reader must join request-group-bound intake receipts with run-bound execution/review/final-response receipts only when they resolve to the same exact run/group. It must accept both the legacy split LLM cycle (`request_diagnosis -> solution_plan -> result_diagnosis -> final_response`) and the simplified cycle (`task_intake` as diagnosis plus plan, then `completion_review -> final_response`). Preserve receipt order and do not classify an intake-only conversational response as an executed cycle.
- The live observer may wait up to 240 seconds for terminal evidence so a slow provider review is not abandoned at the 30-second measurement boundary. On observer timeout, cancel only the root run created by that smoke request and retain the timeout as diagnostic evidence.
- Canonical web execution permits at most one discovery search per execution pass. A changed query is not a changed method. After search, the main LLM may answer from validated search evidence, select an observed direct URL with `web_fetch`, choose another authorized capability, or report an explicit evidence limitation. The harness must not discard a no-tool LLM answer merely to force `web_fetch`.
- The normal channel path validates web tool schemas and source linkage deterministically, but leaves semantic sufficiency and next-action selection to the canonical LLM completion review. Do not add per-source selection, chunk selection, compression, or separate web-review LLM calls to that path.
- Treat `preferred_methods` and `exclusive_methods` as user-level method constraints, not a complete list of internal execution steps. When one enabled catalog binding owns a constrained Tool, project only that binding's safe, available companion Tools so completion follow-up can use a required step such as `web_fetch`. Never expand into another bundle or through ambiguous, disabled, unsupported, unavailable, or unapproved bindings.
- When LLM intake sets `execution.needs_web=true` without an explicit method constraint, evaluate `web_search` through canonical policy and require only that initial method. Never copy every source-available Tool into the required-Tool list. Project `web_fetch` only through the same admitted web Skill binding.
- For root self-solve planning without an explicit method constraint, give the LLM only policy-admitted capability references plus bounded Tool description, risk, and effect-class metadata. Require it to distinguish read-only status/discovery from the capability that performs the requested effect and from later artifact delivery. Do not implement that choice with keywords, semantic similarity, or an adapter-side fallback, and do not expose targets, params, credentials, or runtime payloads in the planning catalog.
- Completion follow-up must carry a structured execution mode (`tool` or `response_only`), required Tool names for Tool mode, target refs when applicable, and evidence refs. Project the next-attempt Tool policy as `unconstrained`, `required`, or `forbidden`; an empty required-Tool list must not represent both unrestricted execution and Tool prohibition. Reject response-only follow-up while freshness, accuracy, existence, or target-match evidence remains unresolved.
- Identify a response-only follow-up by its full completion evidence revision, not by natural-language prompt, summary, or reason text. After one response-only correction on an unchanged evidence revision, reject wording-only variants into completion-review contract repair so the LLM must choose complete, blocked, ask_user, or a changed Tool/target transition. A newly recorded Tool result changes the evidence revision and permits another response-only correction.
- Keep completion-review output bounded to 4,096 tokens and the previous raw model text projected into repair bounded to 6,000 characters. Treat truncation or contract repair as review evidence; neither limit is a count-only terminal-failure rule.
- Keep the completion-review prompt and validator aligned: every applicable criterion and every expected condition in a complete result must cite at least one exact allowlisted evidence ref. A normal complete result that needs repair for this rule is a contract regression.
- If an admitted execution has a non-empty required-Tool list, reject a `complete` review when no trusted successful Tool evidence exists. Return the bounded contract reason to one LLM repair; do not promote an explanatory failure message or an attempt receipt into successful execution evidence.
- For camera capture, require non-empty stored bytes plus an allowlisted image MIME post-check before admitting successful Tool evidence. Keep the internal path in artifact metadata and project only a run/request-group-bound opaque artifact ref, MIME, and size to the model and channel chunk. Resolve the path only inside WebUI/Telegram delivery adapters, reject cross-scope refs, and keep capture success separate from the delivery receipt or delivery failure.
- A successful camera Tool must still run LLM completion review even when direct delivery already has a receipt. Transport acknowledgement, artifact persistence, and channel delivery are separate evidence and none alone proves the user goal.
- Treat camera extension/session/selector and requested device as the effect-relevant canonical operation. Ignore adapter-owned output/transfer fields and timeout representation for approval, duplicate suppression, and side-effect identity; those fields must not be exposed in the LLM-facing camera schema. Reject the same canonical camera operation before a second approval or remote dispatch, while a permission-status step or changed admitted target/device remains eligible. Record a typed pre-effect Yeonjang rejection as `EFFECT_REJECTED` without an effect receipt or post-check; reserve `MANUAL_INTERVENTION` for an effect that started but whose outcome cannot be proved. Return either terminal aggregate and its opaque prior receipt reference to LLM result review instead of recapturing or creating a terminal result from retry/timeout counts.
- Camera capture uses one validated operation budget from Core through Yeonjang and the platform

  helper. Adapter cleanup and transport timeouts may add only their documented bounded grace;
  they must not terminate before the operation deadline.
- Project Yeonjang recovery evidence with an opaque target hash, Tool/method identifiers, and bounded post-check reason codes only. Do not place raw target IDs, local paths, raw Tool output, image data, or provider payloads in recovery prompts, Product Logs, or normal channel output.
- Completion review runs before ordinary reply dispatch. When the LLM marks every applicable non-delivery criterion and every expected condition satisfied and leaves only the ordinary reply delivery criterion unresolved, normalize that structured `response_only` result to complete and let the finalizer deliver the existing answer. Do not apply this normalization to direct artifacts or explicitly requested external-channel delivery.
- Preserve failed web candidates as individual evidence, but mark the web research trace successful after validated search evidence or at least one fetched document passes schema and provenance verification. A failed candidate must not override verified evidence or force an unchanged recovery pass.
- The public document adapter remains bounded: accept at most 4 MB of response content, project at most 20,000 Markdown characters to the model, and retain the existing public-target, content-type, schema, provenance, and freshness checks.
- Carry verified web-evidence completion across execution passes. A structured `response_only` completion follow-up must bind the next attempt to the explicit `forbidden` Tool policy so the response-generation pass receives no Tool definitions and cannot dispatch another fetch. A structured Tool follow-up must bind `required` with its exact non-empty Tool list and may run its first changed-strategy `web_fetch` even when prior evidence is already verified.
- When a live web sample exceeds the terminal objective, inspect the exact-run `agent_round`, `completion_review`, `completion_review_repair`, `final_response`, Tool transport, and delivery durations before changing policy. Repeated review on an unchanged evidence revision is an internal convergence defect; a single slow bounded review after convergence is provider performance evidence. Do not export raw prompts, model responses, URLs, targets, or request text during this diagnosis.
- Intake permits one schema repair for a typed invalid contract class. If the repair returns the same class with different prose or payload fields, return `response_invalid` to the owning diagnosis boundary instead of starting a third intake LLM call. Never use raw model text as the retry identity or expose it in release evidence.
- Intake method constraints must contain stable capability identifiers that start with a lowercase letter and contain at most 128 lowercase letters, digits, dots, colons, underscores, or hyphens. Put prose in goal/context/constraints. Accept `target_instance: null` unless the latest user request names one exact target; never derive a target from a method or suggested runtime. Treat the 30-second first-response budget as measurement only and retain the separate 60-second intake provider safety ceiling.
- Model intake has only `direct_answer`, `task_intake`, `schedule_request`, and `clarification` categories, and its response-tool message modes exclude the internal `failed_receipt`. Do not normalize an invalid category or mode into another meaning. Project only allowlisted typed validation issues into one LLM repair, then require a valid contract or return `response_invalid`. Keep an actionable unsafe, unavailable, impossible, or unsupported request in `task_intake` so downstream policy, capability, execution, and completion diagnosis can prove the permitted alternative or canonical failure. Reserve `failed_receipt` for deterministic or provider failure delivery.
- Keep `ask_user` and execution `boundary_failure` distinct. Only a genuine missing-input decision may enter `awaiting_user`; route `fail_with_reason` evidence through the LLM execution and completion-review path so it can select a permitted alternative or a verified terminal report. The common failure smoke request must identify one explicit nonexistent stable method as a preference, not as an exclusive requirement, so the run proves alternative review and canonical exhaustion instead of stopping for input.
- Automated live acceptance must not grant its own approval. Record WebUI approval-required/artifact scenarios and Telegram external delivery as incomplete until their exact target, permission, and explicit approval exist; do not substitute a dry-run or another target.
- For an expected `failure_tool` scenario, do not rewrite execution failure as success. Accept it only when the exact run projects execution as `exhausted`, delivery as `delivered`, result review records `paths_exhausted`, and exactly one user report is delivered. Do not expose an unregistered Tool merely to manufacture an audit failure; when no adapter receipt exists, the smoke boundary may project its bounded unsupported-capability receipt only from that canonical exhausted outcome.
- A blocked or exhausted terminal report must preserve the canonical outcome, unresolved scope, verified reason facts, and next actions. Permit one structured final-response repair when the first rendering omits those fields, and include only the missing field keys plus their required public fragments in the repair envelope. Reject delivery after a second mismatch and close the run as an explicit finalization failure rather than leaving it active.
- Long text must respect each channel `maxMessageLength`: split when allowed, summarize-and-link when requested, or deliver as a safe artifact link.
- Artifacts must use native file delivery when supported and fall back to a download link when native upload is unavailable.
- Artifact delivery or its diagnostic fallback must not suppress or replace the canonical LLM-reviewed final answer. Verify artifact-before-final ordering, exactly one final text delivery, and duplicate suppression independently for WebUI and Telegram.
- Run camera acceptance as a separate opt-in observation set; do not add camera scenarios to the default channel smoke manifest. The deterministic macOS, Windows, and Linux fixtures share the same camera capability receipt schema, but fixture parity is not evidence of equal live platform support.
- Sensitive artifacts and Telegram external file delivery must require an explicit delivery-operation approval before delivery. A capture-only approval never authorizes delivery; `allow_run` reuse is valid only for the same tool operation and canonical authorization hash, including the bound target. Tools without an explicit canonical projector retain their exact raw-params hash behavior.
- Keep `channelLiveAcceptanceProduction` limited to basic-query capability admission. The release manifest's separate `conversationProcessEvidence` summary must cover all five current WebUI and all five current Telegram live scenarios for the same build, remain fresh, contain zero required skips or failures, and carry its own checksum. It may contain scenario IDs, bounded counts, timestamps, blocker reason codes, and opaque evidence hashes only; never raw traces, requests, responses, provider payloads, or target identifiers.

### Telegram basic-query live smoke

- Before Gateway startup, set `KNOWBEE_CHANNEL_SMOKE_LIVE=1`,

  `KNOWBEE_CHANNEL_SMOKE_TELEGRAM_CHAT_ID`, and
  `KNOWBEE_CHANNEL_SMOKE_TELEGRAM_USER_ID`. Set
  `KNOWBEE_CHANNEL_SMOKE_TELEGRAM_THREAD_ID` only for a forum topic.
- Restart the Gateway after changing these values. The runtime captures them once at startup and

  never re-reads them during a smoke run.
- The user ID and direct chat or group ID must already be present in the active Telegram

  connection allowlists. Use a dedicated smoke account and room; do not target a production room.
- Run `knowbee smoke channels --live --channel telegram`; the CLI calls the authenticated Gateway

  `/api/channel-smoke/runs` boundary and exits with failure unless every selected scenario passes. A pass
  requires the normal Telegram inbound handler, canonical root-run receipts, a provider send
  receipt, a same-run message reference for the configured chat/thread, and run-bound first/terminal
  response latency evidence.
- A fast acknowledgement, an uncorrelated `sent` status, or a message reference from another

  chat/thread is not completion evidence. Do not retain tokens, raw updates, chat IDs, or response
  text in the release evidence export.

### Slack basic-query live smoke

- Before Gateway startup, set `KNOWBEE_CHANNEL_SMOKE_LIVE=1`,

  `KNOWBEE_CHANNEL_SMOKE_SLACK_CHANNEL_ID`, and
  `KNOWBEE_CHANNEL_SMOKE_SLACK_USER_ID`. Set
  `KNOWBEE_CHANNEL_SMOKE_SLACK_THREAD_TS` only when the smoke must run in an existing thread.
- Restart the Gateway after changing these values. The runtime captures the target once and does

  not read environment values during scenario execution.
- The user and channel must both be present in the active Slack connection allowlists. Use an

  isolated app, workspace channel, and user; an empty allowlist is not sufficient for live smoke.
- Run `knowbee smoke channels --live --channel slack`; the request must enter the

  existing Socket Mode message handler. A pass requires canonical terminal receipts, a Slack
  provider send receipt, and an assistant message reference for the same run, channel, and thread.
- When no thread timestamp is configured, the synthetic inbound message timestamp becomes the

  thread identity and remains internal to the runtime evidence reader. A fast acknowledgement,
  cross-thread reference, or provider status without a message ID is not completion evidence.
- Do not retain Slack tokens, raw Socket Mode envelopes, channel/user/thread IDs, request text, or

  final response text in the release evidence export.

Fixture gates:

- Discord and Google Chat fixture smoke must cover basic query, approval/button UI, artifact delivery, and unsupported capability fallback.
- Fixture traces must reject cross-provider delivery tools, local path markdown, missing audit ids, and hidden approval controls.

Manual local bridge gates:

- iMessage and KakaoTalk are manual local bridge gates unless their local app, Yeonjang bridge, user session, automation permission, risk acknowledgement, and allowed targets are configured.
- Manual smoke evidence must include the selected bridge mode, target id type, manual confirmation setting, rate limit, and user-visible fallback text.
- Unsupported buttons, files, edits, deletes, threads, and typing indicators must be recorded as `unsupported_capability` receipt detail or a clear fallback notice.

Regression checklist:

- Duplicate delivery is blocked by idempotency keys and message ledger state.
- Continuation replies stay in the originating thread or explicit continuation context.
- Approval prompts are visible in the originating channel and do not silently downgrade into an invisible state.
- Artifact messages never expose local filesystem paths.
- Provider rate limits are recorded as retry/backoff receipts, not as lost runs.

## Sub-Agent Rollout Gate

Sub-agent orchestration must move through these release modes in order:

1. `flag_off`: `sub_agent_orchestration=off`, compatibility mode on, single main-agent only.
2. `dry_run_only`: shadow dry-run evidence only, no sub-agent final answer can become user-facing output.
3. `limited_beta`: limited operator beta with rollback smoke, benchmark thresholds, and restart-resume soak passing.
4. `full_enable`: public default only after limited beta evidence remains clean for the release window.

The release manifest must include `subAgentReleaseGate`. This evidence is the final sub-agent release blocker and must include:

- Release dry-run summary for orchestration mode, hot registry lookup, planner hot path, event stream recovery, final delivery dedupe, and migration rehearsal.
- Fallback gates for feature flag off, no sub-agent, and disabled sub-agent states.
- Delegation gates for one sub-agent, multiple parallel sub-agents, team composition, team target expansion, result review, nested delegation, and cascade stop.
- Isolation gates for memory scope, redacted data exchange, capability permission, approval, model/cost audit, and fallback reason audit.
- WebUI gates for React Flow topology validation, runtime projection, focus mode, templates, and import safety.
- Learning/history/restore append-only evidence with review-pending semantics.
- Benchmark thresholds: duplicate final answer count `0`, spawn ack p95 `<=300ms`, hot registry p95 `<=100ms`, planner hot path p95 `<=700ms`, first progress p95 `<=1.5s`, restart recovery p95 `<=3s`.
- Restart-resume soak evidence that verifies projection recovery, finalizer recovery, zero orphan sub-sessions, zero duplicate events, and zero duplicate final answers.

Do not proceed to full enablement when `subAgentReleaseGate.gateStatus` is `failed` or when `subAgentReleaseGate.blockingFailures` is non-empty.

MVP scope includes explicit sub-agent delegation, team target expansion, nested delegation within configured depth, memory/capability isolation, WebUI topology/runtime projection, benchmark evidence, and rollback by feature flag off. MVP excludes advanced automatic learning, complete external tool sandbox coverage, and cross-tree reference group UI.

## Enterprise Topology Rollout Gate

Enterprise Topology must ship behind an explicit staged flag matrix. The release manifest must include `enterpriseTopologyReleaseGate`, and public routing must not be enabled when this gate is failed.

Rollout stages:

1. `contracts_validator_only`: `enterprise_topology_validator=shadow`, `topology_runtime_enabled=off`. Contracts, relation rules, validator, and enterprise rule tests may run, but routing cannot change.
2. `dry_run_shadow`: registry, compiler, and declared/observed analysis may run in shadow or dual-write mode. Active topology selection and root-run routing remain off.
3. `gated_mode`: operators can validate activation, unified Workspace controls, sub-agent-first usability, runtime smoke, and rollback evidence. `topology_runtime_enabled` remains off.
4. `opt_in_routing`: registry, validator, compiler, and `topology_runtime_mvp` must be enforced before `topology_runtime_enabled=enforced` is allowed. Advanced recursive delegation, tool runtime, and exhaustion failure flags stay separately gated.

Required regression gates:

- Feature flag off path must fall back before topology registry lookup.
- Single main-agent fallback and existing sub-agent release gate must pass.
- Channel finalizer regression must preserve duplicate-final zero tolerance and late-result no-reply behavior.
- WebUI build gate must pass because the builder is GUI-first and should limit ordinary setup typing to sub-agent name, what the sub-agent does, and run input.
- Topology Workspace route gate must prove `/advanced/topology` is the only visible topology menu entry, `/advanced/enterprise-topology` redirects to `/advanced/topology?mode=build`, and the old Runtime Topology menu is removed.
- Topology Workspace layer gate must cover the visible Build, Run, Trace, and Improve layers. Runtime resource projection is internal evidence and must not be exposed as `/advanced/topology?mode=resources`.
- Sub-agent-first usability gate must pass the happy path: `+ 서브 에이전트 추가`, sub-agent name, what the sub-agent does, review of what the main agent understood, second sub-agent, Smart Connect recommendation chip, run input, Run, and history/improvement review.
- Default UX leak gate must prove Task/Decision/Approval/Tool/Data/Group palette labels, work template, Context, AgentConfig, SubSession, CompiledSnapshot, Node Contract, Runtime Resource Topology, and JSON/YAML are hidden from the default surface.
- Internal stability gate must prove the sub-agent graph compiles to EnterpriseTopology, sub-agent graph metadata remains projection-only, rule-based inference works without AI-assisted inference, feature flag off keeps single main-agent fallback, and the old Advanced/Developer topology surfaces are no longer exposed.
- Sub-agent observability gate must prove confirmed understanding version, inference evidence id, runtime profile snapshot id, inferred work template/context, trace event ids, and failure report evidence links can reconstruct `user description -> inference -> sub-agent definition -> work record -> failure report`.
- Topology runtime smoke must prove MVP execution with main-agent-owned final answer synthesis.
- Rollback smoke must restore the previous active topology and matching compiled snapshot without deleting runtime trace evidence.

Do not enable `topology_runtime_enabled` unless `enterpriseTopologyReleaseGate.gateStatus` is `passed`, the requested mode is `opt_in_routing`, and rollback evidence includes active topology plus compiled snapshot restore verification.

Workspace flag matrix meaning:

- `enterprise_topology_builder_ui`: controls the unified `/advanced/topology` Workspace. Off hides Workspace controls; the legacy enterprise builder URL still redirects to the canonical route and then follows the same feature gate.
- `declared_observed_topology_analysis`: controls Trace and Improve evidence that compares declared topology with observed runtime paths. Off must not delete trace tables.
- `topology_runtime_enabled`: controls Run layer root-run routing only. Off must preserve the existing single main-agent root-run path even when drafts, validation, or Workspace navigation are present.

Topology rollback checks:

- Simple mode rollback check: open the sub-agent settings surface, confirm Build/Run/Trace/Improve remain visible, confirm `+ 서브 에이전트 추가`, name, what it does, review of what the main agent understood, input, Run, history, and improvement points are available, and confirm runtime resources, execution preview, import/export data, raw trace IDs, feature flag status, internal work template, run context, and direct relation/schema controls are not in the default surface.
- Removed surface rollback check: open `/advanced/topology?mode=resources`, `/advanced/topology?ux=advanced`, and `/advanced/topology?ux=developer&mode=build`; each must stay on the simple sub-agent settings surface without runtime resources, execution preview, import/export data, developer tools, relation toolbar, start sub-agent picker, or advanced inspector settings.
- Rollback evidence must record which area failed: Simple UX regression, removed advanced surface regression, or runtime routing regression.
- Rollback evidence must also include `knowbee.executor_graph.rollback_projection`: restored topology id/version, sub-agent graph metadata presence, sub-agent ids, connection ids, confirmed understanding ids, and `sourceOfTruth=executor_topology_v2`.

Executor evidence audit checks:

- In Simple mode, raw evidence ids stay hidden in the default result screen. Users see 실패 위치, 메인 에이전트가 시도한 것, 다음 조치 first.
- Internal evidence audit may inspect sanitized developer logs outside the default topology surface, but the topology UI must not expose work-order id, node contract id, raw trace ids, or JSON/YAML controls by default.
- If an inference was confirmed by the user, `confirmedUnderstandingVersion` must be present in topology metadata and node-level `executorGraph.inferenceEvidence`.
- Failure investigations must be able to follow: userDescription, normalizedUnderstanding, inferenceRuleIds, node contract id, work-order id, traceEventIds, and failure report id.
- Rollback is incomplete if EnterpriseTopology version restores but sub-agent graph projection metadata is missing or no longer matches the restored topology.

## UI Mode Release Gate

The release manifest must include `uiModeEvidence`. This evidence is a release blocker, not a UI-only checklist.

Required checks:

- Beginner smoke matrix: first-run shell, AI connection save/test, one chat run, one approval action, and result visibility.
- Advanced smoke matrix: AI settings save, channel status, Yeonjang status, execution monitor, and doctor summary.
- Admin smoke matrix: explicit admin flag, timeline access, inspectors, and diagnostic export dry-run.
- Resolver evidence: beginner default, advanced preference, admin request denied without flag, and admin request allowed with flag.
- Redaction evidence: beginner, advanced, admin, and export surfaces must mask secrets, raw HTML/payloads, and local paths.
- Admin guard evidence: admin API stays closed by default and in production unless config and runtime flag are both enabled.
- Route redirect evidence: legacy advanced URLs must redirect into `/advanced/*`; beginner `/chat` must not be redirected.
- Regression blockers: AI connection save stability, beginner raw error redaction, admin disabled data blocking, final-answer dedupe, and run-state reversal guard.

Do not publish when `uiModeEvidence.gateStatus` is `failed` or when `uiModeEvidence.blockingFailures` is non-empty.

## Update Preflight

Before updating a running installation:

- Verify Node.js 22+, pnpm, Rust toolchain for Yeonjang build hosts, OS compatibility, and write permissions.
- Create a backup snapshot with DB, memory DB, prompt seed files, setup state, and prompt source registry metadata.
- Do not include raw secrets in portable backup snapshots. Re-enter provider, Telegram, Slack, and MQTT secrets after restore if needed.
- Verify snapshot manifest checksum and every copied file checksum.
- Run migration preflight and block update when backup is missing, DB lock exists, checksum fails, or write permission is denied.
- Confirm Yeonjang `protocolVersion` compatibility before replacing Gateway or Yeonjang binaries.

## Topology V2 Migration Gate

Before enabling topology execution for a user DB, preserve history and materialize only the active runtime read model.

1. Stop channel writers or put the instance in maintenance mode.
2. Create a verified backup snapshot that includes `enterprise_topologies`, `enterprise_topology_versions`, `enterprise_topology_history`, `compiled_topology_snapshots`, `topology_validation_snapshots`, `topology_runs`, `topology_node_runs`, `topology_work_orders`, `topology_result_reports`, `topology_failure_reports`, `topology_trace_events`, `decision_traces`, `root_runs`, `run_events`, `run_subsessions`, and `orchestration_events`.
3. Run `PRAGMA integrity_check` and confirm migration lock status is clear.
4. Run the V2 dry-run path through `previewExecutorTopologyV2RegistryMigration`. The preview must report the source topology version, validation result, stale issue count, and a materialized topology payload without `metadata.executorGraph.workspace`, missing tool/system hints, default-entry metadata, or node permission caches.
5. Only after the dry run is clean, run `materializeExecutorTopologyV2ReadModelInRegistry`. This appends a new topology version and activates it; old versions remain audit history.
6. Do not physically delete old topology versions or run history unless the user explicitly requests DB initialization or physical cleanup.
7. Run `pnpm run test:phase026:db` and confirm Runtime Inspector shows topology schema `v2` and a materialization source such as `executor_topology_v2_materialized_read_model`.
8. Restart the local stack and run WebUI save/reload plus channel smoke before live validation.

### Topology V2 Dry-Run Report Contract

`previewExecutorTopologyV2RegistryMigration` is the required dry-run boundary for V1 to V2 cleanup. It must not append, activate, delete, compact, or rewrite registry state. Treat the report as release evidence, not as a migration side effect.

The report must show:

- `writePlanned=false` and `destructiveChangesPlanned=false`.
- `backupRequired=true`, `rollbackSupported=true`, and `approvalRequiredForDestructiveChanges=true`.
- Removed fields: legacy enterprise extension fields, stale node caches, non-delegation relation fields, and projection-only metadata that will be omitted from the V2 source read model.
- Transformed fields: executor nodes and `delegates_to` relations that become V2 nodes and edges.
- Preserved fields: topology identity, node identity/definition, topology version/history tables, compiled/validation snapshots, root runs, sub-sessions, orchestration events, and topology trace tables.
- Warnings for invalid V2 validation or unrepairable migration issues.

Removed fields in this report mean “not written into the V2 source model.” They do not mean physical DB deletion. Physical deletion of old versions, trace evidence, run history, or legacy columns requires a separate explicit administrative cleanup task with a verified backup and user confirmation.

### Topology V2 Rollback Boundary

Rollback must prefer version activation over physical restore when the only change is a newly materialized topology version.

1. Stop writers.
2. Record current active topology id/version, compiled snapshot id, and validation snapshot id.
3. Restore the previous active version with `rollbackTopologyVersion(topologyId, targetVersion)`.
4. Confirm the compiled snapshot matches the restored version hash.
5. Keep old V1 rows and all runtime traces as audit evidence.
6. Use full backup restore only when registry rollback cannot recover the incident.
7. After rollback, run WebUI topology reload and a channel smoke request before enabling live traffic.

## Restore Rehearsal

Restore into a rehearsal directory first:

1. Copy files from the verified snapshot manifest.
2. Run SQLite `integrity_check`.
3. Confirm migration status is known and up to date or intentionally pending.
4. Load prompt source registry without `sys_prop.md` dependency.
5. Confirm memory DB is readable when present.
6. Only promote rehearsal files to operational paths after every check passes.

## Rollback Procedure

Stop all writers first:

- Gateway server.
- Telegram/Slack channel adapters.
- Scheduler execution loop.
- Yeonjang agents or any tool path that can write artifacts or DB state.

Rollback steps:

1. Verify target release manifest and target backup snapshot checksums.
2. Copy current runtime state aside as rollback-of-rollback evidence.
3. Set `sub_agent_orchestration=off` before restoring binaries or state when the incident involves delegation, channel finalization, memory isolation, WebUI projection, or nested delegation.
4. Set `topology_runtime_enabled=off` before restoring binaries, active topology state, or compiled snapshots when the incident involves Enterprise Topology routing, Builder activation, validator/compiler output, or topology finalization.
5. Set `enterprise_topology_builder_ui=off` when the incident involves `/advanced/topology`, operator activation controls, `/advanced/enterprise-topology` compatibility routing, or the removed Runtime Topology menu entry.
6. Set `declared_observed_topology_analysis=off` when the incident involves Trace, Improve, observed edges, or gap analysis. Keep trace tables as evidence.
7. Record current active topology id, active version, validation snapshot id, and compiled snapshot id as rollback-of-rollback evidence.
8. Restore the previous active topology through `rollbackTopologyVersion(topologyId, targetVersion)` or from the verified backup.
9. Restore the compiled snapshot that matches the target topology version and source hash.
10. Confirm the single main-agent path can create a run and produce one final answer without deleting data.
11. Confirm `/advanced/topology` no longer exposes activation controls and `/advanced/enterprise-topology` still redirects to `/advanced/topology?mode=build`.
12. Restore previous Gateway/CLI/Core bundle when feature flag rollback alone is not enough.
13. Restore previous WebUI static build.
14. Restore DB, memory DB, prompt seed files, setup state, and prompt registry from the verified snapshot only after rehearsal passes.
15. Restore config skeleton and re-enter secrets if the restored release requires them.
16. Restore Yeonjang binary and protocol/permission files compatible with the Gateway release.
17. Start Gateway and Yeonjang.
18. Confirm `/api/status`, prompt checksum, schedule list, memory search, Yeonjang capability status, active topology version, compiled snapshot hash, `/advanced/topology` simple surface, and channel smoke.

Do not retry rollback automatically when:

- Release or backup checksum verification fails.
- SQLite integrity check fails.
- Prompt source registry cannot load.
- Yeonjang protocol is incompatible with the rollback Gateway.
- Secret re-entry is required but not completed.

## Required Evidence

Store these files with every release candidate:

- `manifest.json` from `scripts/release-package.mjs`.
- `SHA256SUMS` from `scripts/release-package.mjs`.
- Backup snapshot `manifest.json`.
- Restore rehearsal report.
- UI mode release gate summary from `manifest.json` under `uiModeEvidence`.
- Sub-agent release readiness summary from `manifest.json` under `subAgentReleaseGate`.
- Enterprise Topology release readiness summary from `manifest.json` under `enterpriseTopologyReleaseGate`.
- Channel delivery release gate and channel smoke result, including live/manual gate notes for external channels.
- Checksummed `conversationProcessEvidence` from `manifest.json` when Telegram/WebUI conversation-process acceptance is required. A `blocked` summary or local `.tasks` evidence is not release acceptance.
- Yeonjang smoke result.
