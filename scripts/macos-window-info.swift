import AppKit
import CoreGraphics
import Foundation

func serializedField(_ value: String) -> String {
    value
        .replacingOccurrences(of: "\t", with: " ")
        .replacingOccurrences(of: "\n", with: " ")
        .replacingOccurrences(of: "\r", with: " ")
}

struct WindowRow {
    let processId: pid_t
    let processName: String
    let title: String
    let x: Int
    let y: Int
    let width: Int
    let height: Int

    var serialized: String {
        [
            processName,
            title,
            String(x),
            String(y),
            String(width),
            String(height),
            String(processId),
        ]
            .map(serializedField)
            .joined(separator: "\t")
    }
}

struct RunningApplicationRow {
    let processId: pid_t
    let bundleIdentifier: String
    let bundlePath: String
    let executablePath: String
    let processName: String

    var serialized: String {
        [
            String(processId),
            bundleIdentifier,
            bundlePath,
            executablePath,
            processName,
        ]
            .map(serializedField)
            .joined(separator: "\t")
    }
}

struct ScreenRow {
    let x: Int
    let y: Int
    let width: Int
    let height: Int

    var serialized: String {
        [String(x), String(y), String(width), String(height)].joined(separator: "\t")
    }
}

func mainScreenRow() -> ScreenRow {
    let bounds = CGDisplayBounds(CGMainDisplayID())
    return ScreenRow(
        x: Int(bounds.origin.x.rounded()),
        y: Int(bounds.origin.y.rounded()),
        width: Int(bounds.width.rounded()),
        height: Int(bounds.height.rounded())
    )
}

func windowRows() -> [WindowRow] {
    let rawRows = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID)
        as? [[String: Any]] ?? []
    return rawRows.compactMap { raw in
        guard
            let processId = raw[kCGWindowOwnerPID as String] as? pid_t,
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
            processId: processId,
            processName: processName,
            title: raw[kCGWindowName as String] as? String ?? "",
            x: Int(x.rounded()),
            y: Int(y.rounded()),
            width: Int(width.rounded()),
            height: Int(height.rounded())
        )
    }
}

func runningApplicationRows() -> [RunningApplicationRow] {
    NSWorkspace.shared.runningApplications.compactMap { application in
        guard
            !application.isTerminated,
            application.processIdentifier > 0,
            let bundleIdentifier = application.bundleIdentifier,
            let bundleURL = application.bundleURL,
            let executableURL = application.executableURL
        else {
            return nil
        }
        return RunningApplicationRow(
            processId: application.processIdentifier,
            bundleIdentifier: bundleIdentifier,
            bundlePath: bundleURL.resolvingSymlinksInPath().path,
            executablePath: executableURL.resolvingSymlinksInPath().path,
            processName: application.localizedName ?? executableURL.lastPathComponent
        )
    }
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard let command = arguments.first else {
    FileHandle.standardError.write(
        Data("Expected list, running-apps, or main-screen.\n".utf8)
    )
    exit(2)
}
switch command {
case "list":
    for row in windowRows() {
        print(row.serialized)
    }
case "running-apps":
    for row in runningApplicationRows() {
        print(row.serialized)
    }
case "main-screen":
    print(mainScreenRow().serialized)
default:
    FileHandle.standardError.write(Data("Unknown command \(command).\n".utf8))
    exit(2)
}
