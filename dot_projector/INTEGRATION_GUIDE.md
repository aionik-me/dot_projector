# DOT Projector - Quick Integration Guide

## Quick Start

### 1. Basic HTML Setup
```html
<!DOCTYPE html>
<html>
<head>
    <title>Palm Scanner Integration</title>
    <!-- Required Dependencies -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
</head>
<body>
    <!-- Scanner Container -->
    <div id="scanner-container">
        <canvas id="dotCanvas"></canvas>
        <video id="inputVideo" style="display: none;"></video>
        <canvas id="captureCanvas" style="display: none;"></canvas>
        
        <!-- Control Buttons -->
        <div class="controls">
            <button id="startBtn">Start Scanning</button>
            <button id="captureBtn" disabled>Capture</button>
            <button id="irModeBtn">IR Mode: OFF</button>
            <button id="galleryBtn">View Gallery</button>
        </div>
    </div>
    
    <!-- Include the scanner files -->
    <link rel="stylesheet" href="style.css">
    <script src="app.js"></script>
</body>
</html>
```

### 2. Basic Integration
```javascript
// Initialize scanner
const scanner = new DotProjector();

// Listen for captures
scanner.capture = function() {
    // Call original capture
    DotProjector.prototype.capture.call(this);
    
    // Your custom logic
    console.log('Palm captured!', this.captures[0]);
};

// Start scanning
document.getElementById('customStartBtn').addEventListener('click', () => {
    scanner.startScanning();
});
```

## Common Integration Patterns

### 1. Custom Validation
```javascript
// Add minimum palm size requirement
scanner.validatePalmSize = function(landmarks) {
    const bounds = this.getPalmBounds(landmarks, 100, 100, 0);
    const area = bounds.width * bounds.height;
    return area > 0.1; // Minimum 10% of frame
};

// Integrate into validation flow
const originalValidation = scanner.updatePalmVisualization;
scanner.updatePalmVisualization = function(landmarks) {
    if (!this.validatePalmSize(landmarks)) {
        this.updateStatus('Palm too small', 'warning');
        return;
    }
    originalValidation.call(this, landmarks);
};
```

### 2. Server Integration
```javascript
// Override capture storage
scanner.saveCapture = async function(captureData) {
    try {
        const response = await fetch('/api/biometric/capture', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                image: captureData.image,
                type: captureData.type,
                metrics: captureData.metrics,
                timestamp: captureData.timestamp
            })
        });
        
        const result = await response.json();
        console.log('Capture saved:', result.id);
        
        // Still save locally as backup
        this.captures.unshift(captureData);
        localStorage.setItem('palmCaptures', JSON.stringify(this.captures));
        
    } catch (error) {
        console.error('Failed to save capture:', error);
        this.updateStatus('Save failed', 'error');
    }
};
```

### 3. React Integration
```jsx
import React, { useEffect, useRef } from 'react';

const PalmScanner = ({ onCapture }) => {
    const scannerRef = useRef(null);
    
    useEffect(() => {
        // Initialize scanner
        scannerRef.current = new DotProjector();
        
        // Override capture method
        const originalCapture = scannerRef.current.capture;
        scannerRef.current.capture = function() {
            originalCapture.call(this);
            
            // Notify parent component
            const latestCapture = this.captures[0];
            if (latestCapture && onCapture) {
                onCapture(latestCapture);
            }
        };
        
        return () => {
            // Cleanup
            if (scannerRef.current?.isScanning) {
                scannerRef.current.stopScanning();
            }
        };
    }, [onCapture]);
    
    const handleStart = () => {
        scannerRef.current?.startScanning();
    };
    
    return (
        <div>
            <canvas id="dotCanvas" />
            <video id="inputVideo" style={{ display: 'none' }} />
            <button onClick={handleStart}>Start Scanning</button>
        </div>
    );
};
```

### 4. Vue Integration
```vue
<template>
  <div class="palm-scanner">
    <canvas id="dotCanvas"></canvas>
    <video id="inputVideo" style="display: none"></video>
    <button @click="startScanning">Start Scanning</button>
  </div>
</template>

<script>
export default {
  data() {
    return {
      scanner: null
    };
  },
  
  mounted() {
    this.initializeScanner();
  },
  
  beforeDestroy() {
    if (this.scanner?.isScanning) {
      this.scanner.stopScanning();
    }
  },
  
  methods: {
    initializeScanner() {
      this.scanner = new DotProjector();
      
      // Override capture
      const originalCapture = this.scanner.capture;
      this.scanner.capture = function() {
        originalCapture.call(this);
        this.$emit('capture', this.captures[0]);
      }.bind(this);
    },
    
    startScanning() {
      this.scanner?.startScanning();
    }
  }
};
</script>
```

## Configuration Options

### Distance Settings
```javascript
// Modify distance range
scanner.MIN_DISTANCE = 5;   // cm (default: 8)
scanner.MAX_DISTANCE = 50;  // cm (default: 45)

// Override distance calculation
scanner.calculateDistance = function(palmCenter) {
    const normalizedZ = Math.max(-0.3, Math.min(0.3, palmCenter.z));
    return Math.round(15 + normalizedZ * 120); // Custom formula
};
```

### Visual Customization
```javascript
// Change colors
scanner.updateVisualizationColors = function() {
    if (this.irMode) {
        this.handLines.material.color.setHex(0xff0000); // Red for IR
        this.instancedDots.material.color.setHex(0xff0000);
    } else {
        this.handLines.material.color.setHex(0x0000ff); // Blue for regular
        this.instancedDots.material.color.setHex(0x0000ff);
    }
};
```

### Validation Thresholds
```javascript
// Make validation stricter
scanner.FLATNESS_THRESHOLD = 0.1;      // Max Z deviation (default: 0.12)
scanner.ROTATION_THRESHOLD = 20;       // Max rotation degrees (default: 30)
scanner.ALIGNMENT_THRESHOLD = 0.5;     // Min alignment (default: 0.3)
scanner.REQUIRED_OPEN_FINGERS = 5;    // All fingers (default: 4)
```

## Event Handling

### Add Event System
```javascript
// Add event emitter
scanner.events = {};

scanner.on = function(event, callback) {
    if (!this.events[event]) {
        this.events[event] = [];
    }
    this.events[event].push(callback);
};

scanner.emit = function(event, data) {
    if (this.events[event]) {
        this.events[event].forEach(cb => cb(data));
    }
};

// Emit events in key places
const originalOnHandResults = scanner.onHandResults;
scanner.onHandResults = function(results) {
    originalOnHandResults.call(this, results);
    
    if (this.palmData) {
        this.emit('handDetected', {
            landmarks: this.palmData,
            distance: this.calculateDistance(this.calculatePalmCenter(this.palmData)),
            rotation: this.checkHandRotation(this.palmData)
        });
    }
};

// Listen for events
scanner.on('handDetected', (data) => {
    console.log('Hand detected at', data.distance, 'cm');
});

scanner.on('capture', (captureData) => {
    console.log('Image captured:', captureData.type);
});
```

## Performance Optimization

### Reduce Quality for Lower-End Devices
```javascript
// Detect device capabilities
const isLowEndDevice = navigator.hardwareConcurrency <= 4;

if (isLowEndDevice) {
    // Reduce hand tracking complexity
    scanner.hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,        // Lite model
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.3
    });
    
    // Reduce dot count
    scanner.createDotPattern = function() {
        const gridSize = 20;       // Reduced from 45
        const spacing = 5;         // Increased from 2.5
        // ... implementation
    };
}
```

### Throttle Updates
```javascript
// Limit visualization updates
let lastUpdate = 0;
const UPDATE_INTERVAL = 50; // ms

scanner.updatePalmVisualization = function(landmarks) {
    const now = Date.now();
    if (now - lastUpdate < UPDATE_INTERVAL) return;
    lastUpdate = now;
    
    // Original implementation
    DotProjector.prototype.updatePalmVisualization.call(this, landmarks);
};
```

## Troubleshooting

### Common Issues

1. **Camera not starting**
```javascript
scanner.startScanning = async function() {
    try {
        // Original implementation
        await DotProjector.prototype.startScanning.call(this);
    } catch (error) {
        console.error('Camera error:', error);
        
        // Fallback to any available camera
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' }
            });
            this.videoElement.srcObject = stream;
            // ... continue setup
        } catch (fallbackError) {
            alert('Camera access denied. Please check permissions.');
        }
    }
};
```

2. **Performance issues**
```javascript
// Add FPS counter
let frameCount = 0;
let lastFpsUpdate = Date.now();

scanner.animate = function() {
    // FPS tracking
    frameCount++;
    const now = Date.now();
    if (now - lastFpsUpdate >= 1000) {
        console.log('FPS:', frameCount);
        frameCount = 0;
        lastFpsUpdate = now;
    }
    
    // Original animation
    DotProjector.prototype.animate.call(this);
};
```

## Security Considerations

### Sanitize Captures
```javascript
// Remove EXIF data before storage
scanner.sanitizeImage = async function(base64Image) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            // Return sanitized image
            resolve(canvas.toDataURL('image/png'));
        };
        img.src = base64Image;
    });
};
```

### Validate on Server
```javascript
// Never trust client-side validation alone
async function serverValidation(captureData) {
    // Verify image dimensions
    // Check file size
    // Validate timestamp
    // Verify metrics are reasonable
    return true;
}
```

---

For complete API documentation, see `API_DOCUMENTATION.md`