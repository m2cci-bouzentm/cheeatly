import Foundation

enum Pcm16 {
    static func decode(_ data: Data) -> [Float] {
        let sampleCount = data.count / 2
        var samples = [Float](repeating: 0, count: sampleCount)

        data.withUnsafeBytes { rawBuffer in
            let int16Buffer = rawBuffer.bindMemory(to: Int16.self)
            for i in 0..<sampleCount {
                let value = Int16(littleEndian: int16Buffer[i])
                samples[i] = max(-1.0, min(Float(value) / 32767.0, 1.0))
            }
        }

        return samples
    }
}
