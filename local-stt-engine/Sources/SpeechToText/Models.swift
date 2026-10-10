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

    static func parse(_ args: [String]) -> CliOptions {
        CliOptions(
            modelName: value("--model", in: args) ?? ParakeetModel.defaultName
        )
    }

    private static func value(_ name: String, in args: [String]) -> String? {
        guard let index = args.firstIndex(of: name), index + 1 < args.count else {
            return nil
        }

        return args[index + 1]
    }
}

enum CliError: LocalizedError {
    case invalidCommand(String)
    case invalidInput(String)

    var errorDescription: String? {
        switch self {
        case .invalidCommand(let command):
            "Unknown command: \(command)."
        case .invalidInput(let message):
            "Invalid input: \(message)."
        }
    }
}
