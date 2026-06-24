// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SpeechToText",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "speech-to-text", targets: ["SpeechToText"])
    ],
    dependencies: [
        .package(
            url: "https://github.com/FluidInference/FluidAudio.git",
            revision: "50aa07193e84b9cf192d8f36041c24a9a4867cd6"
        )
    ],
    targets: [
        .executableTarget(
            name: "SpeechToText",
            dependencies: [
                .product(name: "FluidAudio", package: "FluidAudio")
            ]
        )
    ],
    cxxLanguageStandard: .cxx17
)
