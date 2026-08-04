use knowbee_yeonjang::capture_artifact_postcheck::{
    CaptureArtifactKind, CaptureImageFormat, CapturePostCheckError, post_check_capture_bytes,
};

#[test]
fn camera_jpeg_and_screen_png_produce_typed_immutable_metadata() {
    let jpeg = structural_jpeg(3, 2);
    let camera =
        post_check_capture_bytes(CaptureArtifactKind::CameraJpeg, &jpeg).expect("camera metadata");
    assert_eq!(camera.kind(), CaptureArtifactKind::CameraJpeg);
    assert_eq!(camera.format(), CaptureImageFormat::Jpeg);
    assert_eq!(camera.width(), 3);
    assert_eq!(camera.height(), 2);
    assert_eq!(camera.size_bytes(), jpeg.len() as u64);
    assert!(camera.sha256_digest().starts_with("sha256:"));
    assert_eq!(camera.sha256_digest().len(), 71);

    let png = one_pixel_png();
    let screen =
        post_check_capture_bytes(CaptureArtifactKind::ScreenPng, png).expect("screen metadata");
    assert_eq!(screen.kind(), CaptureArtifactKind::ScreenPng);
    assert_eq!(screen.format(), CaptureImageFormat::Png);
    assert_eq!((screen.width(), screen.height()), (1, 1));
}

#[test]
fn wrong_kind_truncated_zero_and_oversized_images_fail_closed() {
    assert_eq!(
        post_check_capture_bytes(CaptureArtifactKind::CameraJpeg, one_pixel_png()),
        Err(CapturePostCheckError::WrongFormat)
    );
    assert_eq!(
        post_check_capture_bytes(CaptureArtifactKind::ScreenPng, &structural_jpeg(1, 1)),
        Err(CapturePostCheckError::WrongFormat)
    );
    assert_eq!(
        post_check_capture_bytes(CaptureArtifactKind::CameraJpeg, &[0xff, 0xd8, 0xff]),
        Err(CapturePostCheckError::Truncated)
    );
    assert_eq!(
        post_check_capture_bytes(CaptureArtifactKind::ScreenPng, &[]),
        Err(CapturePostCheckError::Empty)
    );
    assert_eq!(
        post_check_capture_bytes(
            CaptureArtifactKind::ScreenPng,
            &vec![0_u8; 64 * 1024 * 1024 + 1],
        ),
        Err(CapturePostCheckError::TooLarge)
    );
}

fn structural_jpeg(width: u16, height: u16) -> Vec<u8> {
    let [height_hi, height_lo] = height.to_be_bytes();
    let [width_hi, width_lo] = width.to_be_bytes();
    vec![
        0xff, 0xd8, // SOI
        0xff, 0xc0, 0x00, 0x11, // baseline SOF, 17-byte segment
        0x08, height_hi, height_lo, width_hi, width_lo, 0x03, // dimensions/components
        0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, // component descriptors
        0xff, 0xd9, // EOI
    ]
}

fn one_pixel_png() -> &'static [u8] {
    &[
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8,
        0xcf, 0xc0, 0xf0, 0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99, 0x3d, 0x1d, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]
}
