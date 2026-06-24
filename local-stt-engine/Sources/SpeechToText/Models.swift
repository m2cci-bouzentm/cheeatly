import FluidAudio
import Foundation

enum ParakeetModel {
    static let defaultName = "parakeet-tdt-0.6b-v3"

    static func version(for modelName: String) -> AsrModelVersion {
        switch modelName {
        case "parakeet-tdt-0.6b-v2":
            .v2
        case "parakeet-tdt-0.6b-v3":
            .v3
        default:
            .v3
        }
    }

    static func languageHint(from languageCode: String?, modelName: String) -> Language? {
        guard version(for: modelName) == .v3,
              let languageCode,
              languageCode != "auto"
        else {
            return nil
        }

        return Language(rawValue: languageCode)
    }
}

struct CliOptions {
    let modelName: String
    let language: String?
    let samplePath: String?
    let chunkSeconds: Double

    static func parse(_ args: [String]) -> CliOptions {
        CliOptions(
            modelName: value("--model", in: args) ?? ParakeetModel.defaultName,
            language: value("--language", in: args) ?? "auto",
            samplePath: value("--sample", in: args),
            chunkSeconds: doubleValue("--chunk-seconds", in: args) ?? 0.25
        )
    }

    private static func value(_ name: String, in args: [String]) -> String? {
        guard let index = args.firstIndex(of: name), index + 1 < args.count else {
            return nil
        }

        return args[index + 1]
    }

    private static func doubleValue(_ name: String, in args: [String]) -> Double? {
        guard let value = value(name, in: args) else {
            return nil
        }

        return Double(value)
    }
}

enum CliError: LocalizedError {
    case missingSamplePath
    case invalidCommand(String)
    case invalidAudio(String)
    case invalidInput(String)

    var errorDescription: String? {
        switch self {
        case .missingSamplePath:
            "Missing --sample path."
        case .invalidCommand(let command):
            "Unknown command: \(command)."
        case .invalidAudio(let message):
            "Invalid audio: \(message)."
        case .invalidInput(let message):
            "Invalid input: \(message)."
        }
    }
}
