import Foundation
import Vision
import ImageIO
import UniformTypeIdentifiers
import CryptoKit

// OCR is entirely local. Input is the actual downloaded share image, not a screenshot.
guard CommandLine.arguments.count == 4 else {
    fputs("Usage: ocr image-file output-json tile-directory\n", stderr); exit(2)
}
let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let tileURL = URL(fileURLWithPath: CommandLine.arguments[3], isDirectory: true)
let sourceHash = SHA256.hash(data: try Data(contentsOf: imageURL)).map { String(format: "%02x", $0) }.joined()
guard let source = CGImageSourceCreateWithURL(imageURL as CFURL, nil),
      let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = props[kCGImagePropertyPixelWidth] as? Int,
      let height = props[kCGImagePropertyPixelHeight] as? Int,
      width > 0, height > 0, width <= 12000, height <= 50000, width * height <= 60000000,
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    fputs("Cannot decode input image.\n", stderr); exit(2)
}
try FileManager.default.createDirectory(at: tileURL, withIntermediateDirectories: true)
var rows: [[String: Any]] = []
var tiles: [[String: Any]] = []
let tileHeight = 2000
let overlap = 180
var offset = 0
var number = 0
while offset < image.height {
    let height = min(tileHeight, image.height - offset)
    guard let tile = image.cropping(to: CGRect(x: 0, y: offset, width: image.width, height: height)) else { break }
    let file = String(format: "tile-%02d.png", number + 1)
    let target = tileURL.appendingPathComponent(file)
    if let destination = CGImageDestinationCreateWithURL(target as CFURL, UTType.png.identifier as CFString, 1, nil) {
        CGImageDestinationAddImage(destination, tile, nil)
        CGImageDestinationFinalize(destination)
    }
    tiles.append(["file": file, "y": offset, "height": height])
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.005
    do {
        try VNImageRequestHandler(cgImage: tile, options: [:]).perform([request])
    } catch {
        fputs("Local Apple Vision OCR failed; input image retained.\n", stderr); exit(2)
    }
    for observation in request.results ?? [] {
        guard let top = observation.topCandidates(1).first else { continue }
        let box = observation.boundingBox
        let rect: [Double] = [Double(box.minX) * Double(image.width),
                             Double(offset) + (1.0 - Double(box.maxY)) * Double(height),
                             Double(box.width) * Double(image.width),
                             Double(box.height) * Double(height)]
        rows.append(["text": top.string, "confidence": Double(top.confidence),
                     "bbox": rect, "tile": file])
    }
    if offset + height >= image.height { break }
    offset += tileHeight - overlap
    number += 1
}
let result: [String: Any] = ["engine": "Apple Vision VNRecognizeTextRequest", "recognitionLevel": "accurate",
                             "source_image_sha256": sourceHash, "vision_revision": VNRecognizeTextRequest.defaultRevision,
                             "os_version": ProcessInfo.processInfo.operatingSystemVersionString,
                             "languages": ["zh-Hans", "en-US"], "width": image.width, "height": image.height,
                             "coordinate_system": "pixels, original image top-left", "tile_overlap": overlap,
                             "tiles": tiles, "observations": rows]
let bytes = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
try bytes.write(to: outputURL, options: .atomic)
print("OCR complete: \(image.width)x\(image.height), \(tiles.count) tiles, \(rows.count) raw observations.")
