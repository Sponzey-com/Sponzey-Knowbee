# Installer source index

| Path | Responsibility |
| --- | --- |
| `install.sh` | Release-rendered POSIX bootstrap template: host gate, one confirmation, bounded HTTPS and pinned native verifier handoff. |
| `install.ps1` | Release-rendered PowerShell 5.1/7 bootstrap: Windows 11 native-architecture gate, one confirmation, bounded TLS downloads and pinned verifier handoff. |
| `verifier/` | Clean-machine native verification of unsigned v2 installer metadata and artifact digests before extraction. |

The installer bootstrap boundary must not require a system Node.js/OpenSSL installation. Platform
scripts pin the bundled verifier SHA-256 and consume only its bounded JSON receipt; the receipt
labels this delivery as unsigned rather than publisher-authenticated.

Neither bootstrap is published with unresolved `@@...@@` values. The release composition root
must render exact verifier digests and reject every unresolved placeholder before the script
becomes a GitHub Release asset.

After manifest selection, the bootstrap downloads the unsigned artifact with its declared byte
limit, asks the verifier to stage it, and invokes only the returned relative entrypoint beneath
that stage using an absolute path and argv. The entrypoint owns the durable install transaction;
the bootstrap owns temporary download/stage cleanup and signal termination.

Both bootstraps expose the same closed profile semantics for exact version, offline evidence,
dry-run/JSON automation, PATH/service/start/browser effects and optional Yeonjang. Offline mode
copies bounded regular local evidence and never calls the network adapter; it still invokes the
same pinned native verifier twice. Dry-run exits before confirmation, temporary directory,
download or application handoff. Mutation JSON requires non-interactive mode.

The canonical unsigned release metadata filename is `installer-manifest.json` for both online and
offline verification. A prerelease rehearsal may also carry
`installer-rehearsal-gate.json`; stable admission requires the separately generated
`installer-release-gate.json` and `installer-finalized-assets.json` inventory.
