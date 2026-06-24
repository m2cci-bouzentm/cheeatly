import FluidAudio
import Foundation

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

    func makeManager(for modelName: String) async throws -> AsrManager {
        let models = try await getOrLoadModels(for: ParakeetModel.version(for: modelName))
        let manager = AsrManager(config: .default)
        try await manager.loadModels(models)
        return manager
    }

    func transcribe(samples: [Float], modelName: String, language: String?) async throws -> String {
        let manager = try await makeManager(for: modelName)
        defer {
            Task {
                await manager.cleanup()
            }
        }

        let audio = paddedForPunctuation(samples)
        let languageHint = ParakeetModel.languageHint(from: language, modelName: modelName)
        var decoderState = TdtDecoderState.make(decoderLayers: await manager.decoderLayerCount)
        let result = try await manager.transcribe(audio, decoderState: &decoderState, language: languageHint)
        return TextNormalizer.shared.normalizeSentence(result.text)
    }

    private func paddedForPunctuation(_ samples: [Float]) -> [Float] {
        let trailingSilenceSamples = 16_000
        let maxSingleChunkSamples = 240_000

        guard samples.count + trailingSilenceSamples <= maxSingleChunkSamples else {
            return samples
        }

        return samples + [Float](repeating: 0, count: trailingSilenceSamples)
    }
}
