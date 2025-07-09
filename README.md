# DOT Projector - Palm Biometric Scanner Simulation

A sophisticated web-based palm biometric scanner simulation featuring real-time hand tracking, 3D DOT projection visualization, simultaneous IR vein pattern capture, and multi-camera support.

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![WebGL](https://img.shields.io/badge/WebGL-2.0-red.svg)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Hands-orange.svg)

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Customization](#customization)
- [Integration Guide](#integration-guide)
- [Camera Configuration](#camera-configuration)
- [Capture Modes](#capture-modes)
- [Technical Details](#technical-details)

## Overview

The DOT Projector simulates a professional biometric palm scanner using:
- **MediaPipe Hands** for real-time hand tracking
- **Three.js** for 3D visualization
- **WebGL** for performance optimization
- **Dual capture modes** (RGB and IR simulation)

## Features

### Core Capabilities
- ✅ Real-time palm tracking with 21 3D landmarks
- ✅ 3D DOT grid projection with distance-based interaction
- ✅ Automatic palm capture with position validation
- ✅ Simultaneous IR + RGB capture mode
- ✅ Procedural vein pattern generation
- ✅ Multi-camera support with separate IR camera selection
- ✅ Local storage gallery with capture history
- ✅ WebGL-optimized rendering with instanced dots
- ✅ Hand stabilization for reduced jitter
- ✅ Dynamic hand color coding (red/yellow/green)

### Hand Position Validation
- Distance checking based on palm screen area
- Palm orientation detection (front/back)
- Hand rotation guidance with visual indicators
- Finger extension validation (4+ fingers required)
- Flatness detection with Z-axis analysis
- Center alignment with edge margin detection
- Re-validation before capture to prevent closed fist captures

## Architecture

```
dot_projector/
├── index.html          # Main HTML structure
├── style.css           # Styling and animations
├── app.js              # Core application logic
└── README.md           # This documentation
```

### Main Components

1. **DotProjector Class** - Central controller
2. **Hand Tracking System** - MediaPipe integration
3. **3D Visualization** - Three.js scene management
4. **Capture System** - Image processing and storage
5. **Camera Manager** - Multi-device support
6. **UI Feedback System** - Real-time guidance

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/dot_projector.git

# Navigate to project directory
cd dot_projector

# Open index.html in a modern web browser
# No build process required - runs directly in browser

# For local development, use a simple HTTP server:
python -m http.server 8000
# or
npx http-server
```

### Requirements
- Modern web browser with WebGL support
- Camera/webcam access
- HTTPS connection (for camera access)

## Usage

### Basic Operation

```javascript
// The app initializes automatically
const dotProjector = new DotProjector();

// Start scanning programmatically
dotProjector.startScanning();

// Stop scanning
dotProjector.stopScanning();

// Capture manually
dotProjector.capture();
```

### UI Controls
- **Start Scanning** - Begins camera and hand detection
- **IR Mode Toggle** - Enables simultaneous IR + RGB capture
- **View Gallery** - Browse captured images with metadata
- **Settings** - Configure RGB and IR camera selection
- **Capture** - Manual capture button (auto-capture also available)

## API Reference

### DotProjector Class

#### Constructor
```javascript
constructor() {
    // Initializes all systems
    // Sets up Three.js scene
    // Configures MediaPipe
    // Loads saved captures
}
```

#### Core Methods

##### Camera Control
```javascript
async startScanning()
// Starts camera and hand detection
// Automatically enables IR mode
// Shows initialization feedback

stopScanning()
// Stops camera stream
// Cleans up resources
// Resets UI state

async detectCameras()
// Enumerates available cameras
// Identifies IR cameras by name
// Returns array of camera devices

async switchToCamera(deviceId)
// Switches to specific camera
// Used during dual capture mode
// Maintains stream stability
```

##### Capture Methods
```javascript
capture()
// Main capture method
// Routes to single or dual capture
// Handles auto-capture flow

async captureDualMode()
// IR + RGB capture sequence
// Switches cameras if needed
// Captures both modes in order

showEnhancedCaptureFeedback()
// Shows capture animation
// Plays shutter sound
// Visual feedback overlay
```

##### Hand Detection
```javascript
onHandResults(results)
// MediaPipe callback
// Updates hand visualization
// Triggers validation checks

updateHandVisualization(landmarks)
// Updates 3D hand skeleton
// Manages point sizes by distance
// Shows rotation indicators

updatePalmVisualization(landmarks)
// Updates DOT grid interaction
// Calculates palm influence
// Manages auto-capture logic
```

##### Validation Methods
```javascript
checkHandFlatness(landmarks)
// Ensures palm is open (not fist)
// Checks finger distances from palm
// Returns boolean

checkPalmOrientation(landmarks)
// Verifies palm faces camera
// Uses normal vector calculation
// Works for both hands

checkHandRotation(landmarks)
// Detects hand rotation angle
// Shows rotation guidance
// Returns degrees of rotation

checkFingerExtension(landmarks)
// Validates finger positions
// Ensures fingers aren't curled
// Requires 3+ extended fingers

calculateAlignment(landmarks)
// Checks hand centering
// Validates frame boundaries
// Returns 0-1 alignment score

calculateDistance(palmCenter)
// Converts Z-coordinate to cm
// Range: 8-45cm
// Used for proximity validation
```

##### Visualization
```javascript
createDotPattern()
// Creates instanced DOT grid
// 45x45 unit grid
// ~320 dots total

updateRotationIndicator(rotation)
// Shows/hides rotation arrows
// Updates based on angle
// Visual guidance for users

drawBiometricOverlay(ctx, landmarks, w, h)
// Adds biometric markers
// Labels key points
// Shows scan metadata

drawVeinPattern(ctx, landmarks, w, h)
// Generates IR vein patterns
// Procedural generation
// Realistic branching
```

### Hand Landmark Reference

MediaPipe provides 21 landmarks:
```
0: Wrist
1-4: Thumb (base to tip)
5-8: Index finger
9-12: Middle finger
13-16: Ring finger
17-20: Pinky finger
```

## Customization

### Distance Settings
```javascript
// In updatePalmVisualization()
if (distance < 8) {  // Minimum distance (cm)
if (distance > 45) { // Maximum distance (cm)

// In calculateDistance()
return Math.round(20 + normalizedZ * 100); // Base + scale
```

### Validation Thresholds
```javascript
// Hand flatness
tipToPalmDist > 0.18      // Finger distance from palm
openFingers >= 4          // Required open fingers
maxZDeviation < 0.12      // Z-axis flatness

// Alignment
alignment >= 0.3          // 30% minimum centering
margin = 0.03            // 3% edge margin

// Rotation
Math.abs(rotation) > 30   // Maximum rotation degrees
```

### Visual Customization
```javascript
// DOT grid
const gridSize = 45;      // Grid dimensions
const spacing = 2.5;      // DOT spacing

// Colors (regular mode)
handLines: 0x00ff88       // Green
instancedDots: 0x00b366   // Dark green

// Colors (IR mode)
handLines: 0xff00ff       // Purple
instancedDots: 0xff00ff   // Purple
```

## Integration Guide

### Embedding in Your Application

```javascript
// 1. Include dependencies
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>

// 2. Create container
<div id="scanner-container">
    <canvas id="dotCanvas"></canvas>
    <video id="inputVideo" style="display: none;"></video>
</div>

// 3. Initialize
const scanner = new DotProjector();

// 4. Listen for captures
scanner.captures = []; // Access capture array

// 5. Custom capture handling
const originalCapture = scanner.capture.bind(scanner);
scanner.capture = function() {
    originalCapture();
    // Your custom logic here
    onPalmCaptured(this.captures[0]);
};
```

### Event Handling

```javascript
// Add custom validation
scanner.validateCustomRequirements = function(landmarks) {
    // Your validation logic
    return true; // or false
};

// Intercept status updates
const originalUpdateStatus = scanner.updateStatus.bind(scanner);
scanner.updateStatus = function(text, type) {
    originalUpdateStatus(text, type);
    // Your status handling
    myApp.showStatus(text, type);
};
```

### Data Access

```javascript
// Get current palm data
const palmData = scanner.palmData; // 21 landmarks

// Access metrics
const metrics = {
    distance: scanner.calculateDistance(palmCenter),
    alignment: scanner.calculateAlignment(palmData),
    rotation: scanner.checkHandRotation(palmData)
};

// Get captures
const captures = JSON.parse(localStorage.getItem('palmCaptures') || '[]');
```

## Camera Configuration

### Multi-Camera Setup

```javascript
// Cameras are detected automatically
// IR cameras identified by name matching:
- "ir"
- "infrared"  
- "depth"
- "windows hello"

// Manual camera selection
scanner.selectedCameraId = "device-id-here";      // RGB camera
scanner.selectedIRCameraId = "ir-device-id-here"; // IR camera
```

### Capture Flow (IR Mode)

**Version 1.1.0 - Simultaneous Capture**
- Both IR and RGB images are captured from the same video frame
- No camera switching delay
- Perfect synchronization between captures
- Uses separate canvases for parallel processing

**Legacy Sequential Mode (if different cameras)**
1. Switch to IR camera
2. Capture IR image with vein patterns
3. Switch to RGB camera  
4. Capture regular image
5. Return to original camera

## Capture Modes

### Regular Capture
- Single RGB image
- Portrait blur background effect
- Biometric overlay
- Clean background removal

### IR Mode Capture
- Dual capture (IR + RGB)
- Simulated vein patterns
- Temperature readings
- Heat signature visualization

### Image Processing

```javascript
createRegularCapture(ctx, w, h)
// Applies portrait blur
// Adds biometric overlay
// Clean background

createIRVeinCapture(ctx, w, h)
// Dark IR-style background
// Procedural vein generation
// Heat map visualization
// Temperature overlay
```

## Technical Details

### Performance Optimizations

1. **Instanced Rendering**
   - Single draw call for all dots
   - GPU-based transformations
   - Dynamic LOD based on distance

2. **WebGL Hand Visualization**
   - Direct GPU rendering
   - Shader-based point sizing
   - Efficient line rendering

3. **Smart Camera Switching**
   - Only switches if cameras differ
   - Minimal delay (100ms stabilization)
   - Maintains preview performance

### Browser Compatibility

- Chrome 91+ (recommended)
- Firefox 89+
- Safari 14.1+
- Edge 91+

Requires:
- WebGL 2.0
- MediaDevices API
- WebRTC support

### Security Considerations

- All processing client-side
- No data transmitted
- LocalStorage for persistence
- Camera permissions required

## Troubleshooting

### Common Issues

1. **Hand not detected**
   - Ensure good lighting
   - Hand fully in frame
   - Clean camera lens
   - Check console for MediaPipe errors

2. **Slow performance**
   - Check WebGL support
   - Reduce grid size in createDotPattern()
   - Close other tabs
   - Disable debug mode

3. **Camera not found**
   - Check browser permissions
   - Ensure HTTPS connection
   - Try different browser
   - Check camera is not in use by another app

4. **Captures not showing in gallery**
   - Check browser console for errors
   - Verify localStorage is not full
   - Check image data URLs are valid
   - Clear browser cache and reload

5. **Hand color stays green/red**
   - Ensure palm is flat and open
   - Check distance (8-45cm range)
   - Face palm directly to camera
   - Verify good lighting conditions

### Debug Mode

```javascript
// Enable debug logging
scanner.debug = true;

// Log hand data
console.log(scanner.palmData);

// Check validation
console.log({
    flat: scanner.checkHandFlatness(scanner.palmData),
    oriented: scanner.checkPalmOrientation(scanner.palmData),
    rotation: scanner.checkHandRotation(scanner.palmData)
});
```

## Recent Updates (v1.1.0)

- **Simultaneous Capture**: IR and RGB images now captured from same frame
- **Null Safety**: Fixed async palm data references preventing crashes
- **Capture Validation**: Re-validates hand state before capture
- **Hand Stabilization**: Reduced jitter with frame averaging
- **Distance Calculation**: Now based on palm screen area for better accuracy
- **Color Feedback**: Dynamic hand coloring (red/yellow/green)
- **Gallery Fixes**: Improved capture storage and display reliability

## Known Limitations

- Maximum 10 captures stored (localStorage quota)
- Single hand tracking only
- IR simulation (not real IR imaging)
- No server-side storage
- No biometric matching algorithms

## Production Deployment

### Quick Start

1. **Static Hosting** - Simply upload all files to any static web server (Apache, Nginx, etc.)
2. **HTTPS Required** - Camera access requires HTTPS in production
3. **No Build Process** - Files can be served directly

### CDN Setup

For better performance, consider using a CDN for dependencies:

```html
<!-- In index.html -->
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/hands.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
```

### Environment Configuration

Set distance and validation thresholds in `app.js`:

```javascript
// Distance settings (lines 864-868)
distance < 5    // Minimum distance (cm)
distance > 45   // Maximum distance (cm)

// Alignment threshold (line 877)
alignment < 0.3 // Minimum alignment score

// Palm validation (line 1277)
passedChecks >= 3 // Required orientation checks
```

### Performance Optimization

For production deployment:

1. **Enable gzip compression** on your web server
2. **Set appropriate cache headers** for static assets
3. **Consider minifying** JavaScript and CSS files
4. **Use HTTP/2** for parallel asset loading

### Security Considerations

1. **HTTPS is mandatory** for camera access
2. **No data is transmitted** - all processing is client-side
3. **Images are stored locally** in browser localStorage
4. **Consider adding CSP headers** for additional security

## License

MIT License - see [LICENSE](LICENSE) file for details

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Maintain the existing code style
- Test on multiple devices and browsers
- Ensure both left and right hands work equally well
- Keep the UI clean and intuitive
- Document any new features or changes

## Support

For questions, issues, or contributions:
- Open an issue on GitHub
- Check existing issues before creating new ones
- Include browser and device information in bug reports

---

Built with ❤️ using MediaPipe, Three.js, and modern web technologies.