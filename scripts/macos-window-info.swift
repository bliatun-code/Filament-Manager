import AppKit
import CoreGraphics
import Darwin
import Foundation

func serializedField(_ value: String) -> String {
    value
        .replacingOccurrences(of: "\t", with: " ")
        .replacingOccurrences(of: "\n", with: " ")
        .replacingOccurrences(of: "\r", with: " ")
}

struct WindowRow {
    let processId: pid_t
    let windowId: CGWindowID
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
            String(windowId),
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

struct RunningProcessRow {
    let processId: pid_t
    let executablePath: String

    var serialized: String {
        [String(processId), executablePath]
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

func windowRows(onscreenOnly: Bool) -> [WindowRow] {
    let rawRows = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID)
        as? [[String: Any]] ?? []
    return rawRows.compactMap { raw in
        guard
            let processId = raw[kCGWindowOwnerPID as String] as? pid_t,
            let windowIdNumber = raw[kCGWindowNumber as String] as? NSNumber,
            let processName = raw[kCGWindowOwnerName as String] as? String,
            let bounds = raw[kCGWindowBounds as String] as? [String: Any],
            let x = bounds["X"] as? Double,
            let y = bounds["Y"] as? Double,
            let width = bounds["Width"] as? Double,
            let height = bounds["Height"] as? Double,
            width > 0,
            height > 0,
            windowIdNumber.uint32Value > 0,
            (!onscreenOnly || (raw[kCGWindowIsOnscreen as String] as? Bool) == true),
            (raw[kCGWindowLayer as String] as? Int ?? 0) == 0
        else {
            return nil
        }
        return WindowRow(
            processId: processId,
            windowId: CGWindowID(windowIdNumber.uint32Value),
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

enum ProcessEnumerationError: Error {
    case unavailable
}

func runningProcessRows() throws -> [RunningProcessRow] {
    let initialCount = proc_listallpids(nil, 0)
    guard initialCount >= 0 else {
        throw ProcessEnumerationError.unavailable
    }

    var capacity = max(Int(initialCount) + 256, 1_024)
    for _ in 0 ..< 4 {
        var processIds = [pid_t](repeating: 0, count: capacity)
        let bufferBytes = processIds.count * MemoryLayout<pid_t>.size
        guard bufferBytes <= Int(Int32.max) else {
            throw ProcessEnumerationError.unavailable
        }
        let processCount = proc_listallpids(&processIds, Int32(bufferBytes))
        guard processCount >= 0 else {
            throw ProcessEnumerationError.unavailable
        }
        if Int(processCount) >= capacity {
            capacity *= 2
            continue
        }

        return processIds.prefix(Int(processCount)).compactMap { processId in
            guard processId > 0 else {
                return nil
            }
            var executablePathBuffer = [CChar](repeating: 0, count: 4_096)
            let pathLength = proc_pidpath(
                processId,
                &executablePathBuffer,
                UInt32(executablePathBuffer.count)
            )
            guard pathLength > 0 else {
                return nil
            }
            let executablePath = String(cString: executablePathBuffer)
            guard !executablePath.isEmpty else {
                return nil
            }
            return RunningProcessRow(
                processId: processId,
                executablePath: URL(fileURLWithPath: executablePath)
                    .resolvingSymlinksInPath()
                    .standardizedFileURL
                    .path
            )
        }
    }

    throw ProcessEnumerationError.unavailable
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard let command = arguments.first else {
    FileHandle.standardError.write(
        Data("Expected list, list-all, running-apps, running-processes, or main-screen.\n".utf8)
    )
    exit(2)
}
switch command {
case "list":
    for row in windowRows(onscreenOnly: true) {
        print(row.serialized)
    }
case "list-all":
    for row in windowRows(onscreenOnly: false) {
        print(row.serialized)
    }
case "running-apps":
    for row in runningApplicationRows() {
        print(row.serialized)
    }
case "running-processes":
    do {
        for row in try runningProcessRows() {
            print(row.serialized)
        }
    } catch {
        FileHandle.standardError.write(
            Data("Could not enumerate operating-system processes.\n".utf8)
        )
        exit(2)
    }
case "main-screen":
    print(mainScreenRow().serialized)
default:
    FileHandle.standardError.write(Data("Unknown command \(command).\n".utf8))
    exit(2)
}
