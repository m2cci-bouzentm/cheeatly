import Foundation

enum AudioSource: String, Codable {
    case mic
    case system
}

enum StreamingTranscriptionEvent {
    case sessionStarted
    case partial(text: String)
    case committed(text: String)
    case error(Error)
}

struct OutputLine: Encodable {
    let type: String
    let source: AudioSource?
    let text: String?
    let message: String?
    let startedAt: Int64?
    let endedAt: Int64?
    let timestampSeconds: Double

    init(
        type: String,
        source: AudioSource? = nil,
        text: String? = nil,
        message: String? = nil,
        startedAt: Int64? = nil,
        endedAt: Int64? = nil
    ) {
        self.type = type
        self.source = source
        self.text = text
        self.message = message
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.timestampSeconds = Date().timeIntervalSince1970
    }
}

actor JsonEventSink {
    private let encoder = JSONEncoder()
    private var committedParts: [String] = []
    private var lastPartial = ""
    private var source: AudioSource?
    private var startedAt: Int64?
    private var endedAt: Int64?

    func updateContext(source: AudioSource, startedAt: Int64? = nil, endedAt: Int64? = nil) {
        self.source = source
        self.startedAt = startedAt
        self.endedAt = endedAt
    }

    func handle(_ event: StreamingTranscriptionEvent) {
        switch event {
        case .sessionStarted:
            guard let source = sourceOrError() else { return }
            write(OutputLine(type: "session_started", source: source))
        case .partial(let text):
            guard let source = sourceOrError() else { return }
            lastPartial = text
            write(OutputLine(type: "partial", source: source, text: text, startedAt: startedAt, endedAt: endedAt))
        case .committed(let text):
            guard let source = sourceOrError() else { return }
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                committedParts.append(trimmed)
            }
            write(OutputLine(type: "committed", source: source, text: text, startedAt: startedAt, endedAt: endedAt))
        case .error(let error):
            write(OutputLine(type: "error", source: source, message: error.localizedDescription))
        }
    }

    func emitFinal() {
        guard let source = sourceOrError() else { return }
        let committed = committedParts.joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        var text = committed
        let partial = lastPartial.trimmingCharacters(in: .whitespacesAndNewlines)
        if !partial.isEmpty {
            if committed.isEmpty {
                text = partial
            } else if !committed.contains(partial) {
                text = committed + " " + partial
            }
        }
        write(OutputLine(type: "final", source: source, text: text, startedAt: startedAt, endedAt: endedAt))
    }

    func emitStatus(_ message: String) {
        write(OutputLine(type: "status", message: message))
    }

    func emitError(_ error: Error) {
        write(OutputLine(type: "error", message: error.localizedDescription))
    }

    private func sourceOrError() -> AudioSource? {
        guard let source else {
            write(OutputLine(type: "error", message: "audio source context missing"))
            return nil
        }

        return source
    }

    private func write(_ line: OutputLine) {
        do {
            let data = try encoder.encode(line)
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data("\n".utf8))
        } catch {
            FileHandle.standardError.write(Data("Failed to encode event: \(error)\n".utf8))
        }
    }
}
