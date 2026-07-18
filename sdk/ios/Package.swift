// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ABAPayWay",
    platforms: [
        .iOS(.v14)
    ],
    products: [
        .library(
            name: "ABAPayWay",
            targets: ["ABAPayWay"]
        )
    ],
    targets: [
        .target(
            name: "ABAPayWay",
            dependencies: [],
            path: "Sources/ABAPayWay"
        ),
        .testTarget(
            name: "ABAPayWayTests",
            dependencies: ["ABAPayWay"],
            path: "Tests/ABAPayWayTests"
        )
    ],
    swiftLanguageVersions: [.v5]
)