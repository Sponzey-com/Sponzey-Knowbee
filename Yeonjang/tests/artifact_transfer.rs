use sha2::{Digest, Sha256};

use knowbee_yeonjang::artifact_lifecycle::{
    ArtifactBinding, ArtifactEvent, ArtifactLifecycle, ArtifactTransition, apply_artifact_event,
};
use knowbee_yeonjang::artifact_transfer::{
    ArtifactChunk, ArtifactChunkAssembler, ArtifactChunkConfig, ArtifactChunkError,
    ArtifactChunkReceive, build_artifact_chunks,
};

#[test]
fn builder_emits_bounded_exact_headers_and_reference_consumer_reassembles_out_of_order() {
    let bytes = (0..600_000)
        .map(|index| (index % 251) as u8)
        .collect::<Vec<_>>();
    let binding = binding(&bytes);
    let lifecycle = fetching(binding.clone(), 3);
    let chunks = build_artifact_chunks(
        &lifecycle,
        &bytes,
        2_000,
        ArtifactChunkConfig::new(256 * 1024).expect("config"),
    )
    .expect("chunks");
    assert_eq!(chunks.len(), 3);
    assert_eq!(chunks[0].header().index(), 0);
    assert_eq!(chunks[0].header().offset(), 0);
    assert_eq!(chunks[0].payload().len(), 256 * 1024);
    assert_eq!(chunks[1].header().offset(), (256 * 1024) as u64);
    assert_eq!(chunks[2].header().count(), 3);
    assert_eq!(chunks[2].header().total_size(), bytes.len() as u64);
    assert_eq!(chunks[2].header().full_digest(), binding.full_digest());

    let mut assembler = ArtifactChunkAssembler::new(binding, "transfer-a", 3).expect("assembler");
    assert!(matches!(
        assembler.accept(chunks[2].clone(), 2_100),
        ArtifactChunkReceive::Accepted { received: 1 }
    ));
    assert!(matches!(
        assembler.accept(chunks[2].clone(), 2_100),
        ArtifactChunkReceive::Duplicate { received: 1 }
    ));
    assert!(matches!(
        assembler.accept(chunks[0].clone(), 2_100),
        ArtifactChunkReceive::Accepted { received: 2 }
    ));
    let ArtifactChunkReceive::Complete { bytes: reassembled } =
        assembler.accept(chunks[1].clone(), 2_100)
    else {
        panic!("complete reassembly")
    };
    assert_eq!(reassembled, bytes);
}

#[test]
fn tampered_payload_missing_chunk_wrong_source_and_expiry_never_complete() {
    let bytes = vec![7_u8; 300_000];
    let binding = binding(&bytes);
    let lifecycle = fetching(binding.clone(), 2);
    let chunks = build_artifact_chunks(
        &lifecycle,
        &bytes,
        2_000,
        ArtifactChunkConfig::new(256 * 1024).expect("config"),
    )
    .expect("chunks");

    let (header, mut payload) = chunks[0].clone().into_parts();
    payload[0] ^= 1;
    assert_eq!(
        ArtifactChunk::from_untrusted(header, payload),
        Err(ArtifactChunkError::PayloadDigestMismatch)
    );

    let mut assembler =
        ArtifactChunkAssembler::new(binding.clone(), "transfer-a", 2).expect("assembler");
    assert!(matches!(
        assembler.accept(chunks[0].clone(), 2_100),
        ArtifactChunkReceive::Accepted { received: 1 }
    ));
    assert_eq!(
        assembler.finish(2_200),
        Err(ArtifactChunkError::MissingChunks)
    );
    assert_eq!(
        assembler.accept(chunks[1].clone(), binding.expires_at_ms()),
        ArtifactChunkReceive::Rejected {
            reason: ArtifactChunkError::Expired
        }
    );

    let wrong_bytes = vec![8_u8; bytes.len()];
    assert_eq!(
        build_artifact_chunks(
            &lifecycle,
            &wrong_bytes,
            2_000,
            ArtifactChunkConfig::new(256 * 1024).expect("config"),
        ),
        Err(ArtifactChunkError::FullDigestMismatch)
    );
}

fn binding(bytes: &[u8]) -> ArtifactBinding {
    ArtifactBinding::new(
        "capture:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "requester-a",
        "request-a",
        "operation-a",
        digest(bytes),
        bytes.len() as u64,
        1_000,
        601_000,
    )
    .expect("binding")
}

fn fetching(binding: ArtifactBinding, chunk_count: u32) -> ArtifactLifecycle {
    let lifecycle = ArtifactLifecycle::new(binding).expect("lifecycle");
    let ArtifactTransition::Applied { lifecycle, .. } = apply_artifact_event(
        &lifecycle,
        &ArtifactEvent::BeginFetch {
            requester_id: "requester-a".to_string(),
            request_id: "request-a".to_string(),
            operation_id: "operation-a".to_string(),
            transfer_id: "transfer-a".to_string(),
            chunk_count,
            now_ms: 2_000,
        },
    ) else {
        panic!("fetching")
    };
    lifecycle
}

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}
