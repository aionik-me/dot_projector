# Changelog

All notable changes to the DOT Projector project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2024-01-09

### Added
- Simultaneous IR and RGB capture from the same video frame
- Hand stabilization using frame averaging (5 frames)
- Dynamic hand color coding (red for too far/close, yellow for adjustment needed, green for perfect)
- Re-validation before capture to prevent closed fist captures
- Null safety checks in async operations
- Optional palmData parameter in capture methods
- Comprehensive debug logging for troubleshooting
- Settings modal for camera configuration

### Changed
- Distance calculation now based on palm screen area instead of Z-coordinate
- IR and RGB captures now use separate canvases for parallel processing
- Improved alignment thresholds for better hand detection
- Enhanced error handling in capture methods
- Updated palm orientation detection for both left and right hands

### Fixed
- TypeError when palmData becomes null during async capture operations
- Gallery display issues with captured images
- Closed fist being captured after validation passed
- Hand jitter in tracking visualization
- Distance calculation accuracy issues
- Left/right hand detection differences

### Performance
- Reduced capture processing time with parallel blob conversion
- Optimized hand landmark calculations
- Improved WebGL rendering efficiency

## [1.0.0] - 2024-01-01

### Added
- Initial release
- Real-time palm tracking with MediaPipe Hands
- 3D DOT projection visualization
- WebGL-optimized rendering with instanced dots
- Auto-capture functionality
- IR vein pattern simulation
- Multi-camera support
- Local storage gallery
- Portrait blur background removal
- Biometric overlay visualization
- Hand position validation
- Rotation guidance
- Distance and alignment metrics

### Features
- 21 3D landmark tracking
- Procedural vein pattern generation
- Camera hot-swapping
- Capture cooldown system
- Hand skeleton visualization
- Feature detection metrics
- Status indicators
- Responsive UI design

[1.1.0]: https://github.com/yourusername/dot_projector/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/yourusername/dot_projector/releases/tag/v1.0.0