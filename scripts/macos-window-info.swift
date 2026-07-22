import CoreGraphics
import Foundation

struct WindowRow {
    let processName: String
    let title: String
    let x: Int
    let y: Int
    let width: Int
    let height: Int

    var serialized: String {
        [processName, title, String(x), String(y), String(width), String(height)]
            .map { $0.replacingOccurrences(of: "\t", with: " ").replacingOccurrences(of: "\n", with: " ") }
            .joined(separator: "\t")
    }
}

func windowRows() -> [WindowRow] {
    let rawRows = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID)
        as? [[String: Any]] ?? []
    return rawRows.compactMap { raw in
        guard
            let processName = raw[kCGWindowOwnerName as String] as? String,
            let bounds = raw[kCGWindowBounds as String] as? [String: Any],
            let x = bounds["X"] as? Double,
            let y = bounds["Y"] as? Double,
            let width = bounds["Width"] as? Double,
            let height = bounds["Height"] as? Double,
            width > 0,
            height > 0,
            (raw[kCGWindowLayer as String] as? Int ?? 0) == 0
        else {
            return nil
        }
        return WindowRow(
            processName: processName,
            title: raw[kCGWindowName as String] as? String ?? "",
            x: Int(x.rounded()),
            y: Int(y.rounded()),
            width: Int(width.rounded()),
            height: Int(height.rounded())
        )
    }
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard let command = arguments.first else {
    FileHandle.standardError.write(Data("Expected list.\n".utf8))
    exit(2)
}
let rows = windowRows()

switch command {
case "list":
    for row in rows {
        print(row.serialized)
    }
default:
    FileHandle.standardError.write(Data("Unknown command \(command).\n".utf8))
    exit(2)
}
