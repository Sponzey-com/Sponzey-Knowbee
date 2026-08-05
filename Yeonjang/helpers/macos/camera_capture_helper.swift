import Foundation
import AVFoundation

final class PhotoDelegate: NSObject, AVCapturePhotoCaptureDelegate {
    let destination: URL
    var captureError: Error?
    var completed = false

    init(destination: URL) {
        self.destination = destination
    }

    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        if let error = error {
            self.captureError = error
            return
        }

        guard let data = photo.fileDataRepresentation() else {
            self.captureError = NSError(
                domain: "YeonjangCamera",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "No file data representation"]
            )
            return
        }

        do {
            try data.write(to: destination)
        } catch {
            self.captureError = error
        }
    }

    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
        error: Error?
    ) {
        if let error = error {
            self.captureError = error
        }
        completed = true
    }
}

func normalizedMatchToken(_ value: String) -> String {
    value
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
        .replacingOccurrences(of: "camera", with: "")
        .replacingOccurrences(of: "카메라", with: "")
        .replacingOccurrences(of: "내장", with: "")
        .replacingOccurrences(of: "built-in", with: "")
        .replacingOccurrences(of: "builtin", with: "")
        .replacingOccurrences(of: " ", with: "")
}

func scoreDevice(_ device: AVCaptureDevice, requestedId: String?) -> Int {
    let name = normalizedMatchToken(device.localizedName)
    let uniqueID = normalizedMatchToken(device.uniqueID)

    if let requestedId {
        let requested = normalizedMatchToken(requestedId)
        if requested.isEmpty {
            return 0
        }
        if requested == uniqueID {
            return 10_000
        }
        if requested == name {
            return 9_000
        }
        if name.contains(requested) || requested.contains(name) {
            return 8_000
        }
        return 0
    }

    var score = 0
    if device.position == .front {
        score += 200
    }
    if name.contains("facetime") || name.contains("hd") {
        score += 150
    }
    if name.contains("iphone") {
        score -= 200
    }
    if device.deviceType == .builtInWideAngleCamera {
        score += 100
    }
    if device.deviceType == .external {
        score -= 50
    }
    return score
}

func waitForCaptureCompletion(delegate: PhotoDelegate, timeoutSeconds: TimeInterval) -> Bool {
    let deadline = Date().addingTimeInterval(timeoutSeconds)
    while !delegate.completed && Date() < deadline {
        if !RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1)) {
            Thread.sleep(forTimeInterval: 0.05)
        }
    }
    return delegate.completed
}

let args = Array(CommandLine.arguments.dropFirst())
if args == ["--permission-status"] {
    let authorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)
    let status: String
    let reason: String
    let canAttemptCapture: Bool
    let requiresUserAction: Bool

    switch authorizationStatus {
    case .authorized:
        status = "authorized"
        reason = "camera_permission_authorized"
        canAttemptCapture = true
        requiresUserAction = false
    case .notDetermined:
        status = "not_determined"
        reason = "camera_permission_not_determined"
        canAttemptCapture = true
        requiresUserAction = true
    case .denied:
        status = "denied"
        reason = "camera_permission_denied"
        canAttemptCapture = false
        requiresUserAction = true
    case .restricted:
        status = "restricted"
        reason = "camera_permission_restricted"
        canAttemptCapture = false
        requiresUserAction = true
    @unknown default:
        status = "unavailable"
        reason = "camera_permission_status_unavailable"
        canAttemptCapture = false
        requiresUserAction = false
    }

    let permissionPayload: [String: Any] = [
        "status": status,
        "reason": reason,
        "platform": "macos",
        "canAttemptCapture": canAttemptCapture,
        "requiresUserAction": requiresUserAction,
    ]
    let permissionData = try JSONSerialization.data(withJSONObject: permissionPayload, options: [])
    FileHandle.standardOutput.write(permissionData)
    exit(0)
}

guard let outputPath = args.first, !outputPath.isEmpty else {
    fputs("output path argument is required\n", stderr)
    exit(2)
}

let operationStartedAt = Date()
var includeBase64 = false
var requestedId: String?
var captureTimeoutMilliseconds: Double = 60_000
var index = 1
while index < args.count {
    switch args[index] {
    case "--inline-base64":
        includeBase64 = true
        index += 1
    case "--device-id":
        guard index + 1 < args.count else {
            fputs("device id value is required\n", stderr)
            exit(2)
        }
        requestedId = args[index + 1]
        index += 2
    case "--capture-timeout-ms":
        guard
            index + 1 < args.count,
            let parsed = Double(args[index + 1]),
            parsed >= 1_000,
            parsed <= 60_000
        else {
            fputs("capture timeout must be between 1000 and 60000 milliseconds\n", stderr)
            exit(2)
        }
        captureTimeoutMilliseconds = parsed
        index += 2
    default:
        if requestedId == nil {
            requestedId = args[index]
            index += 1
        } else {
            fputs("unknown argument: \(args[index])\n", stderr)
            exit(2)
        }
    }
}

switch AVCaptureDevice.authorizationStatus(for: .video) {
case .authorized:
    break
case .notDetermined:
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false
    AVCaptureDevice.requestAccess(for: .video) { allowed in
        granted = allowed
        semaphore.signal()
    }
    semaphore.wait()
    if !granted {
        fputs("Camera permission was not granted\n", stderr)
        exit(10)
    }
default:
    fputs("Camera permission was not granted\n", stderr)
    exit(10)
}

let discovery = AVCaptureDevice.DiscoverySession(
    deviceTypes: [.builtInWideAngleCamera, .external],
    mediaType: .video,
    position: .unspecified
)

guard !discovery.devices.isEmpty else {
    fputs("No camera devices available\n", stderr)
    exit(3)
}

let sortedDevices = discovery.devices.sorted { lhs, rhs in
    scoreDevice(lhs, requestedId: requestedId) > scoreDevice(rhs, requestedId: requestedId)
}

let device: AVCaptureDevice
if let requestedId {
    guard let matched = sortedDevices.first(where: { scoreDevice($0, requestedId: requestedId) > 0 }) else {
        fputs("Requested camera device was not found\n", stderr)
        exit(4)
    }
    device = matched
} else {
    device = sortedDevices[0]
}

let session = AVCaptureSession()
session.beginConfiguration()
session.sessionPreset = .photo

let input: AVCaptureDeviceInput
do {
    input = try AVCaptureDeviceInput(device: device)
} catch {
    fputs("Failed to create camera input: \(error)\n", stderr)
    exit(5)
}

guard session.canAddInput(input) else {
    fputs("Camera input cannot be added to the session\n", stderr)
    exit(6)
}
session.addInput(input)

let photoOutput = AVCapturePhotoOutput()
guard session.canAddOutput(photoOutput) else {
    fputs("Camera output cannot be added to the session\n", stderr)
    exit(7)
}
session.addOutput(photoOutput)
session.commitConfiguration()
session.startRunning()
Thread.sleep(forTimeInterval: 0.5)

let destinationURL = URL(fileURLWithPath: outputPath)
let destinationDirectory = destinationURL.deletingLastPathComponent()
if !destinationDirectory.path.isEmpty {
    try FileManager.default.createDirectory(
        at: destinationDirectory,
        withIntermediateDirectories: true
    )
}

let delegate = PhotoDelegate(destination: destinationURL)
photoOutput.capturePhoto(with: AVCapturePhotoSettings(), delegate: delegate)

let elapsedMilliseconds = Date().timeIntervalSince(operationStartedAt) * 1_000
let remainingSeconds = max(0, captureTimeoutMilliseconds - elapsedMilliseconds) / 1_000
if remainingSeconds <= 0 || !waitForCaptureCompletion(delegate: delegate, timeoutSeconds: remainingSeconds) {
    session.stopRunning()
    fputs("Timed out while waiting for camera capture\n", stderr)
    exit(8)
}

session.stopRunning()

if let error = delegate.captureError {
    fputs("Camera capture failed: \(error)\n", stderr)
    exit(9)
}

var payload: [String: Any] = [
    "deviceId": device.uniqueID,
    "deviceName": device.localizedName,
    "outputPath": outputPath,
    "mimeType": "image/jpeg",
]

if includeBase64 {
    payload["base64Data"] = try Data(contentsOf: URL(fileURLWithPath: outputPath)).base64EncodedString()
}

let data = try JSONSerialization.data(withJSONObject: payload, options: [])
FileHandle.standardOutput.write(data)
