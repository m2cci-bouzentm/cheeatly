import FluidAudio

// Adapted from VoiceInk/Transcription/FluidAudio/FluidAudioTranscriptionService.swift.

final class FluidAudioTranscriptionService {
    private var cachedModels: AsrModels?
    private var loadingTask: (version: AsrModelVersion, task: Task<AsrModels, Error>)?

    func getOrLoadModels(for version: AsrModelVersion) async throws -> AsrModels {
        if let cachedModels, cachedModels.version == version {
            return cachedModels
        }

        if let loadingTask, loadingTask.version == version {
            return try await loadingTask.task.value
        }

        let task = Task {
            try await AsrModels.downloadAndLoad(configuration: nil, version: version)
        }
        loadingTask = (version, task)

        do {
            let models = try await task.value
            cachedModels = models
            if loadingTask?.version == version {
                loadingTask = nil
            }
            return models
        } catch {
            if loadingTask?.version == version {
                loadingTask = nil
            }
            throw error
        }
    }
}
