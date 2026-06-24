import FluidAudio
import Foundation

@main
struct SpeechToTextMain {
    static func main() async {
        do {
            try await run()
        } catch {
            let sink = JsonEventSink()
            await sink.emitError(error)
            exit(1)
        }
    }

    private static func run() async throws {
        let args = Array(CommandLine.arguments.dropFirst())
        let command = args.first ?? "help"
        let options = CliOptions.parse(args)

        switch command {
        case "download-model":
            try await downloadModel(options: options)
        case "list-models":
            listModels()
        case "delete-model":
            try deleteModel(options: options)
        case "stdio":
            try await runStdio()
        case "help", "--help", "-h":
            printHelp()
        default:
            throw CliError.invalidCommand(command)
        }
    }

    private static func downloadModel(options: CliOptions) async throws {
        let sink = JsonEventSink()
        await sink.emitStatus("loading \(options.modelName)")
        let service = FluidAudioTranscriptionService()
        _ = try await service.getOrLoadModels(for: ParakeetModel.version(for: options.modelName))
        await sink.emitStatus("ready \(options.modelName)")
    }

    private static func listModels() {
        let v2Dir = AsrModels.defaultCacheDirectory(for: .v2)
        let v3Dir = AsrModels.defaultCacheDirectory(for: .v3)

        let models: [[String: Any]] = [
            [
                "id": "parakeet-tdt-0.6b-v2",
                "name": "Parakeet V2",
                "size": "474 MB",
                "languages": ["en"],
                "streaming": true,
                "cached": AsrModels.modelsExist(at: v2Dir, version: .v2)
            ],
            [
                "id": "parakeet-tdt-0.6b-v3",
                "name": "Parakeet V3",
                "size": "494 MB",
                "languages": ["en", "es", "fr", "de", "it", "pt", "ro", "pl", "cs", "sk", "sl", "hr", "bs", "ru", "uk", "be", "bg", "sr"],
                "streaming": true,
                "cached": AsrModels.modelsExist(at: v3Dir, version: .v3)
            ]
        ]

        do {
            let data = try JSONSerialization.data(withJSONObject: models)
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data("\n".utf8))
        } catch {
            FileHandle.standardError.write(Data("Failed to encode models: \(error)\n".utf8))
        }
    }

    private static func deleteModel(options: CliOptions) throws {
        let version = ParakeetModel.version(for: options.modelName)
        let cacheDir = AsrModels.defaultCacheDirectory(for: version)
        let fm = FileManager.default

        guard fm.fileExists(atPath: cacheDir.path) else {
            let sink = JsonEventSink()
            Task { await sink.emitStatus("not-found \(options.modelName)") }
            return
        }

        try fm.removeItem(at: cacheDir)
        let sink = JsonEventSink()
        Task { await sink.emitStatus("deleted \(options.modelName)") }
    }

    private static func runStdio() async throws {
        let sink = JsonEventSink()
        var session: StdioStreamingSession?

        while let line = readLine() {
            guard !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                continue
            }

            let command = try StdioCommand.decode(line)
            switch command {
            case .start(let model, let language, let source):
                let modelName = model ?? ParakeetModel.defaultName
                session = StdioStreamingSession(sink: sink)
                try await session?.start(
                    modelName: modelName,
                    language: language ?? "auto",
                    source: source
                )
            case .audio(let source, let pcm16, let startedAt, let endedAt):
                guard let session else {
                    throw CliError.invalidInput("audio received before start")
                }
                guard let data = Data(base64Encoded: pcm16) else {
                    throw CliError.invalidInput("audio command requires base64 pcm16")
                }
                try await session.sendAudioChunk(
                    data,
                    source: source,
                    startedAt: startedAt,
                    endedAt: endedAt
                )
            case .stop:
                guard let activeSession = session else {
                    continue
                }
                try await activeSession.stop()
                session = nil
            }
        }

        if let session {
            try await session.stop()
        }
    }

    private static func printHelp() {
        FileHandle.standardOutput.write(Data("""
        Usage:
          speech-to-text download-model [--model parakeet-tdt-0.6b-v3]
          speech-to-text list-models
          speech-to-text delete-model --model parakeet-tdt-0.6b-v3
          speech-to-text stdio
          speech-to-text help

        Stdio mode accepts newline-delimited JSON on stdin:
          {"type":"start","model":"parakeet-tdt-0.6b-v3","language":"auto","source":"mic"}
          {"type":"audio","source":"mic","pcm16":"<base64 16kHz mono Int16LE>"}
          {"type":"stop"}

        """.utf8))
    }
}

private enum StdioCommand {
    case start(model: String?, language: String?, source: AudioSource)
    case audio(source: AudioSource, pcm16: String, startedAt: Int64?, endedAt: Int64?)
    case stop

    static func decode(_ line: String) throws -> StdioCommand {
        guard let data = line.data(using: .utf8) else {
            throw CliError.invalidInput("line is not utf8")
        }

        let decoder = JSONDecoder()
        let envelope = try decoder.decode(StdioCommandEnvelope.self, from: data)

        switch envelope.type {
        case "start":
            let command = try decoder.decode(StdioStartCommand.self, from: data)
            return .start(
                model: command.model,
                language: command.language,
                source: command.source
            )
        case "audio":
            let command = try decoder.decode(StdioAudioCommand.self, from: data)
            return .audio(
                source: command.source,
                pcm16: command.pcm16,
                startedAt: command.startedAt,
                endedAt: command.endedAt
            )
        case "stop":
            return .stop
        default:
            throw CliError.invalidInput("unknown stdio command: \(envelope.type)")
        }
    }
}

private struct StdioCommandEnvelope: Decodable {
    let type: String
}

private struct StdioStartCommand: Decodable {
    let model: String?
    let language: String?
    let source: AudioSource
}

private struct StdioAudioCommand: Decodable {
    let source: AudioSource
    let pcm16: String
    let startedAt: Int64?
    let endedAt: Int64?
}

private final class StdioStreamingSession {
    private let sink: JsonEventSink
    private let service = FluidAudioStreamingService(fluidAudioService: FluidAudioTranscriptionService())
    private var eventTask: Task<Void, Never>?
    private var source: AudioSource?

    init(sink: JsonEventSink) {
        self.sink = sink
    }

    func start(modelName: String, language: String?, source: AudioSource) async throws {
        self.source = source
        await sink.updateContext(source: source)
        eventTask = Task { [service, sink] in
            for await event in service.transcriptionEvents {
                await sink.handle(event)
            }
        }

        try await service.connect(modelName: modelName, language: language)
    }

    func sendAudioChunk(
        _ data: Data,
        source: AudioSource,
        startedAt: Int64?,
        endedAt: Int64?
    ) async throws {
        guard let sessionSource = self.source else {
            throw CliError.invalidInput("audio received before source was initialized")
        }

        guard source == sessionSource else {
            throw CliError.invalidInput("audio source \(source.rawValue) does not match active session source \(sessionSource.rawValue)")
        }

        await sink.updateContext(source: source, startedAt: startedAt, endedAt: endedAt)
        try await service.sendAudioChunk(data)
    }

    func stop() async throws {
        try await service.commit()
        try await Task.sleep(nanoseconds: 100_000_000)
        await service.disconnect()
        await sink.emitFinal()
        eventTask?.cancel()
        eventTask = nil
    }
}
