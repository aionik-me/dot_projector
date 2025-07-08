# DOT Projector - Complete API Documentation

## Table of Contents
1. [Class Overview](#class-overview)
2. [Properties](#properties)
3. [Methods - Complete Reference](#methods---complete-reference)
4. [Events & Callbacks](#events--callbacks)
5. [Data Structures](#data-structures)
6. [Integration Examples](#integration-examples)
7. [Advanced Customization](#advanced-customization)

## Class Overview

```javascript
class DotProjector {
    constructor()
    // Main class that manages the entire palm scanning system
}
```

## Properties

### Canvas & Rendering
```javascript
this.canvas              // THREE.js canvas element
this.scene              // THREE.Scene instance
this.camera             // THREE.PerspectiveCamera
this.renderer           // THREE.WebGLRenderer
this.animationFrame     // Current animation frame counter
```

### Hand Tracking
```javascript
this.hands              // MediaPipe Hands instance
this.palmData           // Current hand landmarks (21 points)
this.videoElement       // Video element for camera feed
this.isScanning         // Boolean: scanning state
```

### Capture System
```javascript
this.captureCanvas      // Canvas for image capture
this.captureCtx         // 2D context for capture
this.captures           // Array of saved captures
this.isAutoCapturing    // Boolean: auto-capture state
this.perfectAlignmentTime // Timestamp of alignment start
this.lastCaptureTime    // Last capture timestamp
this.captureCooldown    // Milliseconds between captures (3000)
```

### Camera Management
```javascript
this.availableCameras   // Array of available cameras
this.selectedCameraId   // Current RGB camera device ID
this.selectedIRCameraId // Current IR camera device ID
this.hasIRCamera        // Boolean: IR camera detected
```

### Visualization
```javascript
this.instancedDots      // THREE.InstancedMesh for dots
this.dotPositions       // Array of dot positions
this.dotPhases          // Array of dot animation phases
this.handLines          // THREE.LineSegments for skeleton
this.handPoints         // THREE.Points for landmarks
this.handConnections    // Array of landmark connections
```

### Modes & Settings
```javascript
this.irMode             // Boolean: IR mode active
this.veinPattern        // Generated vein pattern cache
this.debug              // Boolean: debug mode
```

## Methods - Complete Reference

### Initialization Methods

#### `init()`
```javascript
init()
// Sets up the entire system
// Called automatically by constructor
// Initializes Three.js, MediaPipe, event listeners
```

#### `setupEventListeners()`
```javascript
setupEventListeners()
// Attaches all UI event handlers
// Handles window resize
// Sets up button clicks
```

### Camera Methods

#### `detectCameras()`
```javascript
async detectCameras()
// Returns: Promise<Array<MediaDeviceInfo>>
// Detects all available cameras
// Identifies IR cameras by name
// Creates camera selectors if multiple found

// Example:
const cameras = await scanner.detectCameras();
// [{deviceId: "abc123", label: "HD Webcam"}, ...]
```

#### `addCameraSelector()`
```javascript
addCameraSelector()
// Creates dropdown UI for camera selection
// Adds both regular and IR camera selectors
// Auto-detects IR cameras by label
```

#### `switchToCamera(deviceId)`
```javascript
async switchToCamera(deviceId)
// Parameters:
//   deviceId: string - Camera device ID
// Switches active camera stream
// Maintains video element state
// Used during capture sequences
```

### Scanning Methods

#### `startScanning()`
```javascript
async startScanning()
// Starts camera and hand detection
// Enables IR mode by default
// Shows initialization feedback
// Updates UI state
```

#### `stopScanning()`
```javascript
stopScanning()
// Stops camera stream
// Releases media tracks
// Resets UI to initial state
// Clears hand visualization
```

#### `detectHand()`
```javascript
async detectHand()
// Internal method - continuous loop
// Sends video frames to MediaPipe
// Runs via requestAnimationFrame
```

### Hand Analysis Methods

#### `onHandResults(results)`
```javascript
onHandResults(results)
// Parameters:
//   results: MediaPipe results object
// Callback from MediaPipe
// Updates visualizations
// Triggers validation checks
```

#### `checkHandFlatness(landmarks)`
```javascript
checkHandFlatness(landmarks)
// Parameters:
//   landmarks: Array of 21 3D points
// Returns: boolean
// Checks if palm is open (not fist)
// Validates finger positions
// Ensures 4+ fingers extended

// Thresholds:
// - Tip to palm distance: > 0.18
// - Tip to mid distance: > 0.07
// - Required open fingers: >= 4
// - Max Z deviation: < 0.12
```

#### `checkPalmOrientation(landmarks)`
```javascript
checkPalmOrientation(landmarks)
// Parameters:
//   landmarks: Array of 21 3D points
// Returns: boolean
// Verifies palm faces camera
// Uses normal vector calculation
// Works for both left and right hands

// Threshold: |normal.z| > 0.5
```

#### `checkHandRotation(landmarks)`
```javascript
checkHandRotation(landmarks)
// Parameters:
//   landmarks: Array of 21 3D points  
// Returns: number (degrees)
// Detects hand rotation angle
// Positive = needs clockwise rotation
// Handles left/right hand differences

// Threshold: |rotation| < 30 degrees
```

#### `checkFingerExtension(landmarks)`
```javascript
checkFingerExtension(landmarks)
// Parameters:
//   landmarks: Array of 21 3D points
// Returns: boolean
// Validates fingers aren't curled
// Checks finger segment alignment
// Requires 3+ extended fingers

// Threshold: alignment > 0.6
```

#### `calculatePalmCenter(landmarks)`
```javascript
calculatePalmCenter(landmarks)
// Parameters:
//   landmarks: Array of 21 3D points
// Returns: {x, y, z} coordinates
// Calculates center between wrist and middle base
// Used for distance and alignment
```

#### `calculateDistance(palmCenter)`
```javascript
calculateDistance(palmCenter)
// Parameters:
//   palmCenter: {x, y, z} object
// Returns: number (cm)
// Converts Z-coordinate to distance
// Range: 8-45cm
// Formula: 20 + normalizedZ * 100
```

#### `calculateAlignment(landmarks)`
```javascript
calculateAlignment(landmarks)
// Parameters:
//   landmarks: Array of 21 3D points
// Returns: number (0-1)
// Checks hand centering in frame
// Validates critical landmarks
// Considers palm area

// Thresholds:
// - Edge margin: 3%
// - Critical points: wrist + fingertips
// - Min palm area: 0.02
```

#### `calculatePalmNormal(landmarks)`
```javascript
calculatePalmNormal(landmarks)
// Parameters:
//   landmarks: Array of 21 3D points
// Returns: {x, y, z} normalized vector
// Calculates palm surface normal
// Auto-detects left/right hand
// Used for orientation check
```

### Visualization Methods

#### `createDotPattern()`
```javascript
createDotPattern()
// Creates instanced mesh for dots
// Grid size: 45x45 units
// Spacing: 2.5 units
// ~324 total dots
// Enables per-instance colors
```

#### `createHandVisualization()`
```javascript
createHandVisualization()
// Creates hand skeleton visualization
// Line segments for connections
// Points for landmarks
// Custom shaders for sizing
```

#### `updateHandVisualization(landmarks)`
```javascript
updateHandVisualization(landmarks)
// Parameters:
//   landmarks: Array of 21 3D points
// Updates 3D hand skeleton
// Scales points by distance
// Shows rotation indicator
// Updates line positions
```

#### `updatePalmVisualization(landmarks)`
```javascript
updatePalmVisualization(landmarks)
// Parameters:
//   landmarks: Array of 21 3D points
// Updates DOT grid interaction
// Calculates per-dot influence
// Creates ripple effects
// Handles auto-capture logic
```

#### `updateRotationIndicator(rotation)`
```javascript
updateRotationIndicator(rotation)
// Parameters:
//   rotation: number (degrees)
// Shows/hides rotation UI
// Updates arrow direction
// Displays rotation text
```

### Capture Methods

#### `capture()`
```javascript
capture()
// Main capture method
// Routes to appropriate capture mode
// Handles feedback and storage
// Updates capture history
```

#### `captureDualMode()`
```javascript
async captureDualMode()
// Captures both IR and RGB images
// Sequence:
//   1. Switch to IR camera (if different)
//   2. Capture IR with vein patterns
//   3. Switch to RGB camera
//   4. Capture regular image
//   5. Return to original camera
// Stores both images with metadata
```

#### `createRegularCapture(ctx, w, h)`
```javascript
createRegularCapture(ctx, w, h)
// Parameters:
//   ctx: Canvas 2D context
//   w: Canvas width
//   h: Canvas height
// Creates RGB capture with:
// - Portrait blur effect
// - Biometric overlay
// - Clean background
// - Scan metadata
```

#### `createIRVeinCapture(ctx, w, h)`
```javascript
createIRVeinCapture(ctx, w, h)
// Parameters:
//   ctx: Canvas 2D context
//   w: Canvas width  
//   h: Canvas height
// Creates IR capture with:
// - Dark background
// - Procedural vein patterns
// - Heat signatures
// - Temperature readings
```

#### `showEnhancedCaptureFeedback()`
```javascript
showEnhancedCaptureFeedback()
// Shows capture animation
// Plays shutter sound
// Displays "CAPTURING" overlay
// Ring animation effect
```

### UI Methods

#### `updateMetrics(landmarks)`
```javascript
updateMetrics(landmarks)
// Parameters:
//   landmarks: Array of 21 3D points
// Updates metric bars
// Shows distance/alignment/features
// Updates percentage displays
```

#### `updateStatus(text, type)`
```javascript
updateStatus(text, type)
// Parameters:
//   text: string - Status message
//   type: string - 'success'|'warning'|'error'|'scanning'
// Updates status indicator
// Changes status light color
// Shows user guidance
```

#### `showGallery()`
```javascript
showGallery()
// Displays capture gallery
// Shows all saved images
// Includes capture metadata
// Allows deletion
```

### Utility Methods

#### `detectFeatures(landmarks)`
```javascript
detectFeatures(landmarks)
// Parameters:
//   landmarks: Array of 21 3D points
// Returns: number (0-100)
// Calculates finger spread
// Used for feature metric
// Based on finger distances
```

#### `getPalmBounds(landmarks, w, h, padding)`
```javascript
getPalmBounds(landmarks, w, h, padding)
// Parameters:
//   landmarks: Array of 21 3D points
//   w: Canvas width
//   h: Canvas height
//   padding: number - Extra space
// Returns: bounds object
// Calculates bounding box
// Used for zooming/centering
```

#### `drawBiometricOverlay(ctx, landmarks, w, h)`
```javascript
drawBiometricOverlay(ctx, landmarks, w, h)
// Adds biometric visualization
// Labels key points (T,I,M,R,P,W)
// Shows feature regions
// Adds scan metadata
```

#### `drawVeinPattern(ctx, landmarks, w, h)`
```javascript
drawVeinPattern(ctx, landmarks, w, h)
// Generates procedural veins
// Creates branching patterns
// Adds cross-connections
// Simulates IR imaging
```

## Events & Callbacks

### MediaPipe Events
```javascript
// Hand detection results
this.hands.onResults(results => {
    // results.multiHandLandmarks - array of hands
    // results.multiHandedness - left/right classification
});
```

### Animation Loop
```javascript
animate()
// Continuous render loop
// Updates dot animations
// Renders Three.js scene
// Handles idle animations
```

## Data Structures

### Hand Landmarks
```javascript
// Each landmark has x, y, z coordinates
// Normalized 0-1 for x,y
// Z is relative depth
{
    x: 0.5,      // Horizontal (0=left, 1=right)
    y: 0.3,      // Vertical (0=top, 1=bottom)  
    z: -0.1      // Depth (negative=closer)
}
```

### Capture Object
```javascript
{
    id: 1234567890,              // Timestamp
    image: "data:image/png;...", // Base64 image
    type: "regular" | "ir",      // Capture type
    timestamp: "2023-...",       // ISO timestamp
    metrics: {
        distance: 25,            // cm
        alignment: 85            // percentage
    },
    pairedWith: 1234567889      // For dual captures
}
```

### Camera Device
```javascript
{
    deviceId: "abc123...",       // Unique ID
    kind: "videoinput",         
    label: "HD Webcam (IR)",     // Device name
    groupId: "xyz789..."         // Physical device
}
```

## Integration Examples

### Custom Validation
```javascript
// Add your own validation step
const originalUpdate = scanner.updatePalmVisualization;
scanner.updatePalmVisualization = function(landmarks) {
    originalUpdate.call(this, landmarks);
    
    // Custom validation
    if (myCustomCheck(landmarks)) {
        this.updateStatus('Custom requirement met', 'success');
    }
};
```

### Capture Interception
```javascript
// Process captures before storage
const originalCapture = scanner.capture;
scanner.capture = function() {
    // Pre-capture logic
    if (myApp.canCapture()) {
        originalCapture.call(this);
        
        // Post-capture logic
        const latestCapture = this.captures[0];
        myApp.processCapture(latestCapture);
    }
};
```

### Real-time Data Access
```javascript
// Access hand data continuously
const trackingLoop = setInterval(() => {
    if (scanner.palmData) {
        const metrics = {
            distance: scanner.calculateDistance(
                scanner.calculatePalmCenter(scanner.palmData)
            ),
            rotation: scanner.checkHandRotation(scanner.palmData),
            flatness: scanner.checkHandFlatness(scanner.palmData)
        };
        
        myApp.updateMetrics(metrics);
    }
}, 100);
```

### Custom Rendering
```javascript
// Add custom objects to scene
const customMesh = new THREE.Mesh(
    new THREE.BoxGeometry(10, 10, 10),
    new THREE.MeshBasicMaterial({color: 0xff0000})
);
scanner.scene.add(customMesh);

// Update in animation loop
const originalAnimate = scanner.animate;
scanner.animate = function() {
    originalAnimate.call(this);
    
    // Custom animations
    customMesh.rotation.y += 0.01;
};
```

## Advanced Customization

### Modify Thresholds
```javascript
// Create wrapper methods
scanner.setDistanceRange = function(min, max) {
    this.minDistance = min;  // Default: 8
    this.maxDistance = max;  // Default: 45
};

scanner.setAlignmentThreshold = function(threshold) {
    this.alignmentThreshold = threshold; // Default: 0.3
};
```

### Custom Capture Processing
```javascript
// Override capture creation
scanner.createRegularCapture = function(ctx, w, h) {
    // Your custom capture logic
    ctx.fillStyle = '#custom';
    ctx.fillRect(0, 0, w, h);
    
    // Draw hand data
    if (this.palmData) {
        myCustomDrawing(ctx, this.palmData, w, h);
    }
};
```

### Event System
```javascript
// Add event emitter functionality
scanner.listeners = {};

scanner.on = function(event, callback) {
    if (!this.listeners[event]) {
        this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
};

scanner.emit = function(event, data) {
    if (this.listeners[event]) {
        this.listeners[event].forEach(cb => cb(data));
    }
};

// Emit events in key methods
const originalCapture = scanner.capture;
scanner.capture = function() {
    this.emit('beforeCapture', this.palmData);
    originalCapture.call(this);
    this.emit('afterCapture', this.captures[0]);
};
```

### Performance Tuning
```javascript
// Reduce dot count for performance
scanner.createDotPattern = function() {
    const gridSize = 20;  // Reduced from 45
    const spacing = 5;    // Increased from 2.5
    // ... rest of implementation
};

// Adjust hand tracking settings
scanner.hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,  // Reduced from 1
    minDetectionConfidence: 0.5,  // Reduced from 0.7
    minTrackingConfidence: 0.3    // Reduced from 0.5
});
```

### Storage Backend
```javascript
// Replace localStorage with custom backend
scanner.saveCapture = async function(captureData) {
    // Send to server
    const response = await fetch('/api/captures', {
        method: 'POST',
        body: JSON.stringify(captureData),
        headers: {'Content-Type': 'application/json'}
    });
    
    return response.json();
};

scanner.loadCaptures = async function() {
    const response = await fetch('/api/captures');
    this.captures = await response.json();
    return this.captures;
};
```

## Best Practices

1. **Performance**
   - Limit capture frequency with cooldown
   - Use instanced rendering for many objects
   - Minimize DOM updates

2. **User Experience**
   - Provide clear visual feedback
   - Show status messages
   - Guide hand positioning

3. **Integration**
   - Use event system for loose coupling
   - Override methods carefully
   - Maintain original functionality

4. **Security**
   - Validate captures server-side
   - Sanitize stored data
   - Use HTTPS for camera access

---

For more examples and updates, visit the project repository.