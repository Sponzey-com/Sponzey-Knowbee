# Native installer verifier

`knowbee-installer-verify` is a Rust 2024, network-free command-line boundary used before an
installer extracts a release bundle. It validates only the closed unsigned v2 manifest contract,
computes its SHA-256 identity, and selects one exact supported target. That identity detects
candidate drift but does not authenticate the publisher.

Its stdout contract is deliberately bounded: either a verified artifact receipt or a rejected
reason code. File paths and manifest content are never emitted.

With paired `--artifact` and `--stage` arguments it also verifies the archive from one opened
handle and extracts only ASCII relative regular files/directories into a newly created stage.
Traversal, links, devices, duplicate/case-colliding paths, excessive entry counts/expanded size,
and a missing or non-regular signed entrypoint fail closed; a failed stage is removed.
