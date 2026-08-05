use knowbee_yeonjang::artifact_lifecycle::{
    ArtifactBinding, ArtifactEvent, ArtifactLifecycle, ArtifactTransition, apply_artifact_event,
};
use knowbee_yeonjang::artifact_transfer::{
    ArtifactChunkConfig, ArtifactChunkError, build_artifact_chunks, decode_artifact_chunk_frame,
    encode_artifact_chunk_frame,
};
use serde_json::Value;
use sha2::{Digest, Sha256};

#[test]
fn binary_frame_round_trips_strict_header_and_raw_payload_without_debug_exposure() {
    let chunk = chunk();
    let frame = encode_artifact_chunk_frame(&chunk).expect("frame");
    assert_eq!(&frame[..4], b"YAC2");
    assert!(
        !header_bytes(&frame)
            .windows("camera-secret-marker".len())
            .any(|window| window == b"camera-secret-marker")
    );

    let decoded = decode_artifact_chunk_frame(&frame).expect("decode");
    assert_eq!(decoded, chunk);
    assert!(!format!("{decoded:?}").contains("camera-secret-marker"));
}

#[test]
fn malformed_unknown_header_and_payload_tamper_are_closed_rejections() {
    let chunk = chunk();
    let frame = encode_artifact_chunk_frame(&chunk).expect("frame");

    let mut bad_magic = frame.clone();
    bad_magic[0] = b'X';
    assert_eq!(
        decode_artifact_chunk_frame(&bad_magic),
        Err(ArtifactChunkError::InvalidFrame)
    );
    assert_eq!(
        decode_artifact_chunk_frame(&frame[..7]),
        Err(ArtifactChunkError::InvalidFrame)
    );

    let mut tampered = frame.clone();
    *tampered.last_mut().expect("payload") ^= 1;
    assert_eq!(
        decode_artifact_chunk_frame(&tampered),
        Err(ArtifactChunkError::PayloadDigestMismatch)
    );

    let mut header: Value = serde_json::from_slice(header_bytes(&frame)).expect("header JSON");
    header["semantic_hint"] = Value::String("latest photo".to_string());
    let unknown_header = rebuild_frame(&header, payload_bytes(&frame));
    assert_eq!(
        decode_artifact_chunk_frame(&unknown_header),
        Err(ArtifactChunkError::InvalidHeader)
    );
}

fn chunk() -> knowbee_yeonjang::artifact_transfer::ArtifactChunk {
    let bytes = b"camera-secret-marker".to_vec();
    let binding = ArtifactBinding::new(
        "capture:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "brad",
        "request-camera",
        "operation-camera",
        digest(&bytes),
        bytes.len() as u64,
        1_000,
        601_000,
    )
    .expect("binding");
    let lifecycle = ArtifactLifecycle::new(binding).expect("lifecycle");
    let ArtifactTransition::Applied { lifecycle, .. } = apply_artifact_event(
        &lifecycle,
        &ArtifactEvent::BeginFetch {
            requester_id: "brad".to_string(),
            request_id: "request-camera".to_string(),
            operation_id: "operation-camera".to_string(),
            transfer_id: "transfer-a".to_string(),
            chunk_count: 1,
            now_ms: 2_000,
        },
    ) else {
        panic!("fetching")
    };
    build_artifact_chunks(
        &lifecycle,
        &bytes,
        2_000,
        ArtifactChunkConfig::new(262_144).expect("config"),
    )
    .expect("chunks")
    .remove(0)
}

fn header_bytes(frame: &[u8]) -> &[u8] {
    let length = u32::from_be_bytes(frame[4..8].try_into().expect("header length")) as usize;
    &frame[8..8 + length]
}

fn payload_bytes(frame: &[u8]) -> &[u8] {
    let length = u32::from_be_bytes(frame[4..8].try_into().expect("header length")) as usize;
    &frame[8 + length..]
}

fn rebuild_frame(header: &Value, payload: &[u8]) -> Vec<u8> {
    let header = serde_json::to_vec(header).expect("header");
    let mut frame = b"YAC2".to_vec();
    frame.extend_from_slice(&(header.len() as u32).to_be_bytes());
    frame.extend_from_slice(&header);
    frame.extend_from_slice(payload);
    frame
}

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}
