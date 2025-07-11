/**
 * DOT Projector - Palm Biometric Scanner Simulation
 * 
 * A sophisticated web-based palm scanner featuring real-time hand tracking,
 * 3D visualization, and dual-mode capture (RGB + IR simulation).
 * 
 * @class DotProjector
 * @author [Your Name]
 * @version 1.0.0
 * 
 * CAPTURE MODES:
 * 1. Regular Mode: Single RGB capture from main camera
 * 2. IR Mode ON: Dual capture sequence (IR → RGB)
 * 
 * CAPTURE SEQUENCE (IR Mode):
 * 1. Switch to IR camera
 * 2. Capture IR image with vein patterns
 * 3. Switch to RGB camera
 * 4. Capture regular RGB image
 * 5. Return to original camera
 * 
 * CUSTOMIZATION:
 * - Camera switching delay: Adjust delay in captureDualMode() (default: 100ms)
 * - Capture distance: Modify distance thresholds in updatePalmVisualization()
 * - Grid size: Change gridSize in createDotPattern() (default: 45)
 * - Alignment sensitivity: Adjust margin in calculateAlignment() (default: 0.03)
 * 
 * CAMERA CONFIGURATION:
 * - Regular camera: Selected via top dropdown
 * - IR camera: Selected via second dropdown (appears when IR mode is ON)
 * - Auto-detection: Looks for 'ir', 'infrared', 'depth', or 'windows hello' in camera names
 * 
 * @example
 * // Basic usage
 * const scanner = new DotProjector();
 * scanner.startScanning();
 * 
 * @example  
 * // Custom validation
 * scanner.minDistance = 10; // cm
 * scanner.maxDistance = 50; // cm
 */
class DotProjector {
    /**
     * Creates a new DotProjector instance
     * Initializes all subsystems and starts the render loop
     * 
     * @constructor
     */
    constructor() {
        this.canvas = document.getElementById('dotCanvas');
        
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
        
        this.instancedDots = null;
        this.dotPositions = [];
        this.dotPhases = [];
        this.palmData = null;
        this.isScanning = false;
        this.isProcessingStart = false; // Prevent double-click on start button
        this.animationFrame = 0;
        
        this.hands = null;
        this.handedness = null; // Store left/right hand info
        this.videoElement = document.getElementById('inputVideo');
        this.captureCanvas = document.getElementById('captureCanvas');
        this.captureCtx = this.captureCanvas.getContext('2d');
        
        // Hand stabilization
        this.landmarkHistory = [];
        this.historySize = 5; // Number of frames to average
        
        // Hand visualization properties
        this.handConnections = [
            [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
            [0, 5], [5, 6], [6, 7], [7, 8], // Index
            [5, 9], [9, 10], [10, 11], [11, 12], // Middle
            [9, 13], [13, 14], [14, 15], [15, 16], // Ring
            [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
            [0, 17] // Palm base
        ];
        
        // WebGL hand visualization
        this.handMesh = null;
        this.handLines = null;
        this.handPoints = null;
        
        // Capture properties
        this.captures = JSON.parse(localStorage.getItem('palmCaptures') || '[]');
        this.isAutoCapturing = false;
        this.perfectAlignmentTime = 0;
        this.lastCaptureTime = 0;
        this.captureCooldown = 3000; // 3 seconds between captures
        
        // Debug mode
        this.debug = false; // Set to true for debugging
        
        // IR mode
        this.irMode = false;
        this.veinPattern = null;
        
        // Camera management
        this.availableCameras = [];
        this.selectedCameraId = null;
        this.selectedIRCameraId = null;
        this.hasIRCamera = false;
        
        this.init();
    }
    
    /**
     * Initializes the 3D scene, camera, renderer, and all visual elements
     * Sets up lighting, creates dot pattern, and starts animation loop
     * 
     * @private
     */
    init() {
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        
        this.camera.position.z = 50;
        
        const ambientLight = new THREE.AmbientLight(0x404040);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0x0088ff, 0.5);
        directionalLight.position.set(0, 1, 1);
        this.scene.add(directionalLight);
        
        this.createDotPattern();
        this.createHandVisualization();
        this.setupHandTracking();
        this.setupEventListeners();
        
        this.animate();
    }
    
    /**
     * Creates the 3D dot grid pattern using instanced rendering
     * Generates ~324 dots in a 45x45 unit grid for performance
     * 
     * @private
     */
    createDotPattern() {
        const dotGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const dotMaterial = new THREE.MeshPhongMaterial({
            color: new THREE.Color(0, 0.7, 0.35),
            emissive: new THREE.Color(0, 0.35, 0.2),
            emissiveIntensity: 0.5
        });
        
        // Expanded grid size for wider capture area
        const gridSize = 45;
        const spacing = 2.5;
        let count = 0;
        
        // Calculate total number of dots
        for (let x = -gridSize/2; x <= gridSize/2; x += spacing) {
            for (let y = -gridSize/2; y <= gridSize/2; y += spacing) {
                count++;
            }
        }
        
        // Create instanced mesh
        this.instancedDots = new THREE.InstancedMesh(dotGeometry, dotMaterial, count);
        this.instancedDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        
        // Add color attribute for per-instance colors
        const colors = new Float32Array(count * 3);
        this.instancedDots.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
        this.instancedDots.instanceColor.setUsage(THREE.DynamicDrawUsage);
        dotGeometry.setAttribute('instanceColor', this.instancedDots.instanceColor);
        
        // Enable vertex colors in material
        dotMaterial.vertexColors = true;
        
        // Initialize positions and phases
        const matrix = new THREE.Matrix4();
        const color = new THREE.Color();
        let index = 0;
        
        for (let x = -gridSize/2; x <= gridSize/2; x += spacing) {
            for (let y = -gridSize/2; y <= gridSize/2; y += spacing) {
                // Set initial position
                matrix.setPosition(x, y, 0);
                this.instancedDots.setMatrixAt(index, matrix);
                
                // Set initial color
                const intensity = Math.random() * 0.5 + 0.5;
                color.setRGB(0, intensity, intensity * 0.5);
                this.instancedDots.setColorAt(index, color);
                
                // Store position for animation
                this.dotPositions.push({ x, y, z: 0 });
                this.dotPhases.push(Math.random() * Math.PI * 2);
                
                index++;
            }
        }
        
        this.instancedDots.instanceMatrix.needsUpdate = true;
        this.instancedDots.instanceColor.needsUpdate = true;
        
        this.scene.add(this.instancedDots);
    }
    
    createHandVisualization() {
        // Create line geometry for hand skeleton
        const lineGeometry = new THREE.BufferGeometry();
        const linePositions = new Float32Array(this.handConnections.length * 2 * 3); // 2 points per connection, 3 coords per point
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
        
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff88,
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });
        
        this.handLines = new THREE.LineSegments(lineGeometry, lineMaterial);
        this.handLines.visible = false;
        this.scene.add(this.handLines);
        
        // Create points for landmarks
        const pointGeometry = new THREE.BufferGeometry();
        const pointPositions = new Float32Array(21 * 3); // 21 landmarks, 3 coords each
        const pointSizes = new Float32Array(21); // Size for each point
        pointGeometry.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
        pointGeometry.setAttribute('size', new THREE.BufferAttribute(pointSizes, 1));
        
        const pointMaterial = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(0x00ff88) }
            },
            vertexShader: `
                attribute float size;
                uniform vec3 color;
                varying vec3 vColor;
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    // Better distance-based scaling
                    float distance = length(mvPosition.xyz);
                    gl_PointSize = size * (200.0 / distance);
                    // Clamp size to prevent overly large points
                    gl_PointSize = min(gl_PointSize, 20.0);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                void main() {
                    vec2 xy = gl_PointCoord.xy - vec2(0.5);
                    float r = dot(xy, xy);
                    if (r > 0.25) discard;
                    
                    // Sharper edge for cleaner appearance
                    float intensity = smoothstep(0.25, 0.15, r);
                    gl_FragColor = vec4(vColor * intensity, intensity * 0.9);
                }
            `,
            transparent: true,
            depthTest: false
        });
        
        this.handPoints = new THREE.Points(pointGeometry, pointMaterial);
        this.handPoints.visible = false;
        this.scene.add(this.handPoints);
    }
    
    /**
     * Initializes MediaPipe Hands for real-time hand tracking
     * Configures detection parameters and sets up result callbacks
     * 
     * @private
     */
    setupHandTracking() {
        // MediaPipe exports to window object in browser
        const Hands = window.Hands;
        
        if (!Hands) {
            console.error('MediaPipe Hands not loaded. Please ensure all scripts are loaded.');
            this.updateStatus('Error: Hand tracking library not loaded', 'error');
            return;
        }
        
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });
        
        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        this.hands.onResults(this.onHandResults.bind(this));
    }
    
    setupEventListeners() {
        document.getElementById('startBtn').addEventListener('click', () => this.startScanning());
        document.getElementById('captureBtn').addEventListener('click', () => this.capture());
        document.getElementById('galleryBtn').addEventListener('click', () => this.showGallery());
        document.getElementById('closeGalleryBtn').addEventListener('click', () => this.hideGallery());
        document.getElementById('clearAllBtn').addEventListener('click', () => this.clearAllCaptures());
        
        // Show IR mode button
        const irModeBtn = document.getElementById('irModeBtn');
        irModeBtn.style.display = 'inline-block';
        irModeBtn.addEventListener('click', () => this.toggleIRMode());
        
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());
        document.getElementById('closeSettingsBtn').addEventListener('click', () => this.hideSettings());
        
        window.addEventListener('resize', () => {
            this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        });
    }
    
    /**
     * Detects all available cameras and identifies IR cameras
     * Creates camera selection UI if multiple cameras found
     * 
     * @async
     * @returns {Promise<Array>} Array of available camera devices
     */
    async detectCameras() {
        try {
            // First enumerate devices to see what's available
            let devices = await navigator.mediaDevices.enumerateDevices();
            let cameras = devices.filter(device => device.kind === 'videoinput');
            
            // If camera labels are empty (permissions not granted yet), request permission
            if (cameras.length === 0 || (cameras[0].label === '' && cameras[0].deviceId !== '')) {
                console.log('Requesting camera permissions...');
                // Request camera access to get proper labels
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: true,
                    audio: false 
                });
                
                // Stop the stream immediately
                stream.getTracks().forEach(track => track.stop());
                
                // Re-enumerate devices now that we have permissions
                devices = await navigator.mediaDevices.enumerateDevices();
                cameras = devices.filter(device => device.kind === 'videoinput');
            }
            
            this.availableCameras = cameras;
            console.log('Detected cameras:', this.availableCameras);
            
            // Check for IR camera (common labels)
            this.hasIRCamera = this.availableCameras.some(camera => {
                const label = (camera.label || '').toLowerCase();
                return label.includes('ir') || label.includes('infrared') || 
                       label.includes('depth') || label.includes('windows hello');
            });
            
            // If multiple cameras, add camera selector
            if (this.availableCameras.length > 1) {
                this.addCameraSelector();
            } else if (this.availableCameras.length === 1) {
                // Set the single camera as default only if not already set
                if (!this.selectedCameraId) {
                    this.selectedCameraId = this.availableCameras[0].deviceId;
                }
                if (!this.selectedIRCameraId) {
                    this.selectedIRCameraId = this.availableCameras[0].deviceId;
                }
            }
            
            // Always show IR mode button for simulated IR capture
            const irModeBtn = document.getElementById('irModeBtn');
            if (irModeBtn) {
                irModeBtn.style.display = 'inline-block';
            }
            
            return this.availableCameras;
        } catch (error) {
            console.error('Error detecting cameras:', error);
            // Show user-friendly error message
            this.updateStatus('Camera access denied or not available', 'error');
            return [];
        }
    }
    
    addCameraSelector() {
        // Check if selector already exists
        if (document.getElementById('cameraSelector')) return;
        
        // Create regular camera selector
        const selector = document.createElement('select');
        selector.id = 'cameraSelector';
        selector.className = 'camera-selector';
        
        this.availableCameras.forEach((camera, index) => {
            const option = document.createElement('option');
            option.value = camera.deviceId;
            option.textContent = camera.label || `Camera ${index + 1}`;
            selector.appendChild(option);
        });
        
        selector.addEventListener('change', (e) => {
            this.selectedCameraId = e.target.value;
            if (this.isScanning && !this.irMode) {
                // Restart with new camera only if not in IR mode
                this.stopScanning();
                setTimeout(() => this.startScanning(), 500);
            }
        });
        
        // Create IR camera selector
        const irSelector = document.createElement('select');
        irSelector.id = 'irCameraSelector';
        irSelector.className = 'camera-selector';
        
        // Add same cameras to IR selector
        this.availableCameras.forEach((camera, index) => {
            const option = document.createElement('option');
            option.value = camera.deviceId;
            option.textContent = camera.label || `Camera ${index + 1}`;
            
            // Mark likely IR cameras
            const label = (camera.label || '').toLowerCase();
            if (label && (label.includes('ir') || label.includes('infrared') || 
                label.includes('depth') || label.includes('windows hello'))) {
                option.textContent += ' (IR)';
                // Set as default IR camera if found
                if (!this.selectedIRCameraId) {
                    this.selectedIRCameraId = camera.deviceId;
                }
            }
            
            irSelector.appendChild(option);
        });
        
        irSelector.addEventListener('change', (e) => {
            this.selectedIRCameraId = e.target.value;
            if (this.isScanning && this.irMode) {
                // Restart with new IR camera
                this.stopScanning();
                setTimeout(() => this.startScanning(), 500);
            }
        });
        
        // Add to controls
        const controls = document.querySelector('.controls');
        
        // Regular camera selector
        const selectorWrapper = document.createElement('div');
        selectorWrapper.className = 'camera-selector-wrapper';
        selectorWrapper.innerHTML = '<label>Camera: </label>';
        selectorWrapper.appendChild(selector);
        controls.insertBefore(selectorWrapper, controls.firstChild);
        
        // IR camera selector (initially hidden)
        const irSelectorWrapper = document.createElement('div');
        irSelectorWrapper.id = 'irCameraSelectorWrapper';
        irSelectorWrapper.className = 'camera-selector-wrapper';
        irSelectorWrapper.style.display = 'none';
        irSelectorWrapper.innerHTML = '<label>IR Camera: </label>';
        irSelectorWrapper.appendChild(irSelector);
        controls.insertBefore(irSelectorWrapper, selectorWrapper.nextSibling);
        
        // Set defaults only if cameras are available
        if (this.availableCameras.length > 0) {
            // Set default camera if not already set
            if (!this.selectedCameraId) {
                this.selectedCameraId = this.availableCameras[0].deviceId;
            }
            if (!this.selectedIRCameraId) {
                this.selectedIRCameraId = this.availableCameras[0].deviceId;
            }
            
            // Set selector values to match current selection
            selector.value = this.selectedCameraId;
            irSelector.value = this.selectedIRCameraId;
        }
    }
    
    /**
     * Starts the scanning process
     * Initializes camera, enables IR mode by default, begins hand detection
     * 
     * @async
     * @public
     */
    async startScanning() {
        // Early return if already processing
        if (this.isProcessingStart) return;
        
        if (this.isScanning) {
            this.stopScanning();
            return;
        }
        
        // Prevent double clicks
        this.isProcessingStart = true;
        
        try {
            // Detect cameras on first scan
            if (this.availableCameras.length === 0) {
                await this.detectCameras();
                
                // Check if still no cameras after detection
                if (this.availableCameras.length === 0) {
                    this.updateStatus('No cameras found', 'error');
                    this.isScanning = false;
                    return;
                }
            }
            this.isScanning = true;
            document.getElementById('startBtn').textContent = 'Stop Scanning';
            document.getElementById('startBtn').classList.remove('primary');
            document.getElementById('startBtn').classList.add('secondary');
            document.getElementById('captureBtn').disabled = false;
            
            // Show loading status immediately
            this.updateStatus('Starting camera...', 'scanning');
            document.getElementById('guidanceOverlay').style.opacity = '0.8';
            
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            
            // Use IR camera if in IR mode, otherwise use regular camera
            const cameraId = this.irMode ? this.selectedIRCameraId : this.selectedCameraId;
            if (cameraId) {
                constraints.video.deviceId = { exact: cameraId };
            }
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = stream;
            
            // Ensure video element is ready
            await new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    resolve();
                };
            });
            
            // Play the video
            await this.videoElement.play();
            
            // Enable IR mode after camera starts (prevents delay)
            // Removed automatic IR mode toggle to prevent errors
            
            this.updateStatus('Detecting hands...', 'scanning');
            this.detectHand();
            
            // Guidance is already shown above
        } catch (error) {
            console.error('Camera access error:', error);
            this.updateStatus('Camera access denied', 'error');
            this.stopScanning();
        } finally {
            // Reset processing flag
            this.isProcessingStart = false;
        }
    }
    
    stopScanning() {
        this.isScanning = false;
        document.getElementById('startBtn').textContent = 'Start Scanning';
        document.getElementById('startBtn').classList.add('primary');
        document.getElementById('startBtn').classList.remove('secondary');
        document.getElementById('captureBtn').disabled = true;
        
        if (this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(track => track.stop());
            this.videoElement.srcObject = null;
        }
        
        this.updateStatus('Ready to Scan', '');
        document.getElementById('guidanceOverlay').style.opacity = '0';
    }
    
    async detectHand() {
        if (!this.isScanning || !this.hands) return;
        
        if (this.videoElement.readyState === 4) {
            await this.hands.send({ image: this.videoElement });
        }
        
        requestAnimationFrame(() => this.detectHand());
    }
    
    /**
     * Processes hand detection results from MediaPipe
     * Updates visualizations and triggers validation checks
     * 
     * @param {Object} results - MediaPipe detection results
     * @param {Array} results.multiHandLandmarks - Array of detected hands (21 landmarks each)
     * @param {Array} results.multiHandedness - Handedness info (left/right)
     * @private
     */
    onHandResults(results) {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const rawLandmarks = results.multiHandLandmarks[0];
            
            // Add to history for stabilization
            this.landmarkHistory.push(rawLandmarks);
            if (this.landmarkHistory.length > this.historySize) {
                this.landmarkHistory.shift();
            }
            
            // Apply stabilization by averaging recent frames
            this.palmData = this.stabilizeLandmarks(this.landmarkHistory);
            
            // Store handedness info if available
            if (results.multiHandedness && results.multiHandedness.length > 0) {
                this.handedness = results.multiHandedness[0].label;
            }
            this.updateHandVisualization(this.palmData);
            this.updatePalmVisualization(this.palmData);
            this.updateMetrics(this.palmData);
            
            // Hide guide overlay when hand is detected
            document.getElementById('guidanceOverlay').style.opacity = '0.2';
        } else {
            this.palmData = null;
            this.handedness = null;
            this.landmarkHistory = []; // Clear history when hand is lost
            this.updateStatus('Place your palm in view', 'warning');
            // Show guide overlay when no hand is detected
            document.getElementById('guidanceOverlay').style.opacity = '1';
            
            // Hide hand visualization
            this.handLines.visible = false;
            this.handPoints.visible = false;
            
            // Reset dot field when hand is removed
            this.resetDotField();
        }
    }
    
    /**
     * Stabilize landmarks by averaging recent frames
     * Reduces jitter and provides smoother tracking
     */
    stabilizeLandmarks(history) {
        if (history.length === 0) return null;
        if (history.length === 1) return history[0];
        
        // Create averaged landmarks
        const stabilized = [];
        for (let i = 0; i < 21; i++) {
            let x = 0, y = 0, z = 0;
            let weight = 0;
            
            // Weighted average - recent frames have more weight
            history.forEach((frame, frameIdx) => {
                const w = (frameIdx + 1) / history.length; // Linear weight
                x += frame[i].x * w;
                y += frame[i].y * w;
                z += frame[i].z * w;
                weight += w;
            });
            
            stabilized.push({
                x: x / weight,
                y: y / weight,
                z: z / weight
            });
        }
        
        return stabilized;
    }
    
    updateHandVisualization(landmarks) {
        // Convert landmarks to 3D coordinates
        const scale = 60; // Match the dot grid scale
        
        // Show rotation indicator if needed
        const rotation = this.checkHandRotation(landmarks);
        this.updateRotationIndicator(rotation);
        
        // Calculate validation status for color coding
        const palmCenter = this.calculatePalmCenter(landmarks);
        const distance = this.calculateDistance(palmCenter);
        const alignment = this.calculateAlignment(landmarks);
        const isPalmOriented = this.checkPalmOrientation(landmarks);
        const isFlatEnough = this.checkHandFlatness(landmarks);
        const fingersExtended = this.checkFingerExtension(landmarks);
        
        // Determine hand color based on status
        let handColor;
        if (distance > 45) {
            handColor = 0xff0000; // Red - too far
        } else if (distance < 8) {
            handColor = 0xff0000; // Red - too close
        } else if (distance >= 8 && distance <= 45 && alignment >= 0.3 && 
                   isPalmOriented && isFlatEnough && 
                   Math.abs(rotation) <= 30) {
            handColor = 0x00ff00; // Bright green - perfect position
        } else {
            handColor = 0xffff00; // Yellow - needs adjustment
        }
        
        // Log status for debugging
        if (this.debug) {
            console.log('Hand status:', {
                distance,
                alignment,
                isPalmOriented,
                isFlatEnough,
                fingersExtended,
                rotation: Math.abs(rotation),
                color: handColor.toString(16)
            });
        }
        
        // Update line color
        this.handLines.material.color.setHex(handColor);
        // Update point color using uniforms for shader material
        this.handPoints.material.uniforms.color.value.setHex(handColor);
        
        // Update line positions
        const linePositions = this.handLines.geometry.attributes.position.array;
        let lineIndex = 0;
        
        this.handConnections.forEach(([start, end]) => {
            // Start point
            linePositions[lineIndex++] = (landmarks[start].x - 0.5) * scale;
            linePositions[lineIndex++] = -(landmarks[start].y - 0.5) * scale;
            linePositions[lineIndex++] = -landmarks[start].z * 100;
            
            // End point
            linePositions[lineIndex++] = (landmarks[end].x - 0.5) * scale;
            linePositions[lineIndex++] = -(landmarks[end].y - 0.5) * scale;
            linePositions[lineIndex++] = -landmarks[end].z * 100;
        });
        
        this.handLines.geometry.attributes.position.needsUpdate = true;
        this.handLines.visible = true;
        
        // Update point positions and sizes
        const pointPositions = this.handPoints.geometry.attributes.position.array;
        const pointSizes = this.handPoints.geometry.attributes.size.array;
        
        landmarks.forEach((landmark, idx) => {
            const i = idx * 3;
            pointPositions[i] = (landmark.x - 0.5) * scale;
            pointPositions[i + 1] = -(landmark.y - 0.5) * scale;
            pointPositions[i + 2] = -landmark.z * 100;
            
            // Size based on importance and distance
            const distance = Math.abs(landmark.z * 100);
            const distanceScale = Math.max(0.5, Math.min(1.5, 1.0 - distance / 50));
            
            if ([4, 8, 12, 16, 20].includes(idx)) {
                pointSizes[idx] = 4 * distanceScale; // Fingertips
            } else if (idx === 0) {
                pointSizes[idx] = 5 * distanceScale; // Wrist
            } else {
                pointSizes[idx] = 3 * distanceScale; // Other points
            }
        });
        
        this.handPoints.geometry.attributes.position.needsUpdate = true;
        this.handPoints.geometry.attributes.size.needsUpdate = true;
        this.handPoints.visible = true;
    }
    
    updateRotationIndicator(rotation) {
        // Show visual rotation guide
        let indicator = document.getElementById('rotationIndicator');
        
        if (Math.abs(rotation) > 30) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'rotationIndicator';
                indicator.className = 'rotation-indicator';
                document.querySelector('.overlay-ui').appendChild(indicator);
            }
            
            // Update rotation arrow and text
            if (rotation > 0) {
                indicator.innerHTML = `
                    <svg width="60" height="60" viewBox="0 0 60 60">
                        <path d="M30 10 Q45 15 50 30 Q45 45 30 50 Q15 45 10 30 Q15 15 30 10" 
                              fill="none" stroke="#ffaa00" stroke-width="2" opacity="0.5"/>
                        <path d="M45 20 L50 30 L40 28" fill="#ffaa00"/>
                    </svg>
                    <span>Rotate CCW</span>
                `;
            } else {
                indicator.innerHTML = `
                    <svg width="60" height="60" viewBox="0 0 60 60">
                        <path d="M30 10 Q15 15 10 30 Q15 45 30 50 Q45 45 50 30 Q45 15 30 10" 
                              fill="none" stroke="#ffaa00" stroke-width="2" opacity="0.5"/>
                        <path d="M15 20 L10 30 L20 28" fill="#ffaa00"/>
                    </svg>
                    <span>Rotate CW</span>
                `;
            }
            
            indicator.style.display = 'flex';
        } else if (indicator) {
            indicator.style.display = 'none';
        }
    }
    
    drawFeatureExtraction(landmarks, ctx, w, h) {
        // Draw feature regions with labels
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#00ff88';
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        
        // Palm region
        const palmRegion = [
            { x: landmarks[0].x * w, y: landmarks[0].y * h },
            { x: landmarks[5].x * w, y: landmarks[5].y * h },
            { x: landmarks[13].x * w, y: landmarks[13].y * h },
            { x: landmarks[17].x * w, y: landmarks[17].y * h }
        ];
        
        ctx.beginPath();
        palmRegion.forEach((point, idx) => {
            if (idx === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        ctx.stroke();
        
        // Label palm center
        const palmCenter = this.calculatePalmCenter(landmarks);
        ctx.fillText('PALM CENTER', palmCenter.x * w, palmCenter.y * h);
        
        // Draw distance indicator - properly scaled
        const avgZ = landmarks.reduce((sum, pt) => sum + pt.z, 0) / landmarks.length;
        // Convert z to approximate cm (negative z means closer)
        const distance = Math.round(30 + avgZ * 200); // Approximate conversion
        ctx.fillStyle = distance < 20 ? '#ff6b6b' : distance > 40 ? '#4169e1' : '#00ff88';
        ctx.font = '14px Arial';
        ctx.fillText(`${distance}cm`, palmCenter.x * w, palmCenter.y * h + 20);
        
        ctx.restore();
    }
    
    drawEdgeWarnings(landmarks, ctx, w, h) {
        ctx.save();
        const margin = 0.05; // Match the new margin
        const warningSize = 20;
        
        // Check each edge
        landmarks.forEach(landmark => {
            if (landmark.x < margin || landmark.x > 1 - margin ||
                landmark.y < margin || landmark.y > 1 - margin) {
                
                // Draw warning indicator at edge
                ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
                ctx.strokeStyle = 'rgba(255, 0, 0, 1)';
                ctx.lineWidth = 2;
                
                // Determine which edge
                if (landmark.x < margin) {
                    // Left edge
                    ctx.beginPath();
                    ctx.moveTo(0, landmark.y * h);
                    ctx.lineTo(warningSize, landmark.y * h - warningSize/2);
                    ctx.lineTo(warningSize, landmark.y * h + warningSize/2);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                } else if (landmark.x > 1 - margin) {
                    // Right edge
                    ctx.beginPath();
                    ctx.moveTo(w, landmark.y * h);
                    ctx.lineTo(w - warningSize, landmark.y * h - warningSize/2);
                    ctx.lineTo(w - warningSize, landmark.y * h + warningSize/2);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                }
                
                if (landmark.y < margin) {
                    // Top edge
                    ctx.beginPath();
                    ctx.moveTo(landmark.x * w, 0);
                    ctx.lineTo(landmark.x * w - warningSize/2, warningSize);
                    ctx.lineTo(landmark.x * w + warningSize/2, warningSize);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                } else if (landmark.y > 1 - margin) {
                    // Bottom edge
                    ctx.beginPath();
                    ctx.moveTo(landmark.x * w, h);
                    ctx.lineTo(landmark.x * w - warningSize/2, h - warningSize);
                    ctx.lineTo(landmark.x * w + warningSize/2, h - warningSize);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                }
            }
        });
        
        ctx.restore();
    }
    
    updatePalmVisualization(landmarks) {
        const palmCenter = this.calculatePalmCenter(landmarks);
        const distance = this.calculateDistance(palmCenter);
        const alignment = this.calculateAlignment(landmarks);
        
        // Detect if this is a left hand early
        const indexMcp = landmarks[5];
        const pinkyMcp = landmarks[17];
        const isLeftHand = indexMcp.x > pinkyMcp.x;
        
        // Convert palm coordinates to 3D space
        const palm3D = {
            x: (palmCenter.x - 0.5) * 60,
            y: -(palmCenter.y - 0.5) * 60,
            z: -palmCenter.z * 100
        };
        
        // Update instanced dots
        const matrix = new THREE.Matrix4();
        const rotation = new THREE.Euler();
        const scale = new THREE.Vector3();
        const color = new THREE.Color();
        
        this.dotPositions.forEach((dotPos, index) => {
            // Calculate distance to palm center in 3D
            const distToPalm = Math.sqrt(
                Math.pow(dotPos.x - palm3D.x, 2) + 
                Math.pow(dotPos.y - palm3D.y, 2)
            );
            
            // Calculate influence based on hand landmarks with enhanced finger interaction
            let maxInfluence = 0;
            let closestLandmarkIdx = -1;
            let minDistance = Infinity;
            
            landmarks.forEach((landmark, idx) => {
                const landmarkX = (landmark.x - 0.5) * 60;
                const landmarkY = -(landmark.y - 0.5) * 60;
                const landmarkZ = -landmark.z * 50;
                
                // 3D distance for better depth perception
                const dist = Math.sqrt(
                    Math.pow(dotPos.x - landmarkX, 2) + 
                    Math.pow(dotPos.y - landmarkY, 2) +
                    Math.pow(dotPos.z - landmarkZ, 2) * 0.2
                );
                
                // Different influence ranges for different landmarks
                let influenceRadius = 15;
                if ([4, 8, 12, 16, 20].includes(idx)) {
                    // Fingertips have stronger influence
                    influenceRadius = 18;
                } else if (idx === 0 || idx === 9) {
                    // Wrist and palm center
                    influenceRadius = 20;
                }
                
                const influence = Math.max(0, 1 - dist / influenceRadius);
                if (influence > maxInfluence) {
                    maxInfluence = influence;
                    closestLandmarkIdx = idx;
                    minDistance = dist;
                }
            });
            
            // Fast and dynamic interaction
            let finalX = dotPos.x;
            let finalY = dotPos.y;
            let finalZ = dotPos.z;
            
            if (maxInfluence > 0) {
                // Immediate response - dots push away from hand
                const pushForce = maxInfluence * 8;
                const angle = Math.atan2(dotPos.y - palm3D.y, dotPos.x - palm3D.x);
                
                // Quick displacement
                const displacementX = Math.cos(angle) * pushForce * maxInfluence;
                const displacementY = Math.sin(angle) * pushForce * maxInfluence;
                
                finalX = dotPos.x + displacementX;
                finalY = dotPos.y + displacementY;
                finalZ = dotPos.z + maxInfluence * 10; // Push forward
                
                // Fast scale response
                const scaleValue = 1 + maxInfluence * 2;
                scale.set(scaleValue, scaleValue, scaleValue);
            } else {
                // Return to original position
                scale.set(1, 1, 1);
            }
            
            // Compose matrix with final position
            rotation.set(0, 0, 0); // No rotation for clean look
            matrix.compose(
                new THREE.Vector3(finalX, finalY, finalZ),
                new THREE.Quaternion().setFromEuler(rotation),
                scale
            );
            this.instancedDots.setMatrixAt(index, matrix);
            
            // Color based on distance, hand features, and mode
            if (this.irMode) {
                // IR mode colors - purple/magenta spectrum
                const intensity = 0.3 + maxInfluence * 0.7;
                const redness = intensity * (0.8 + alignment * 0.2);
                const blueness = intensity * (0.6 + distance / 50);
                color.setRGB(redness, 0, blueness);
            } else {
                // Regular mode colors - green/cyan spectrum
                const hue = (120 - distance * 2 + maxInfluence * 60) / 360;
                const saturation = alignment * (0.5 + maxInfluence * 0.5);
                const lightness = 0.3 + maxInfluence * 0.6;
                color.setHSL(hue, saturation, lightness);
            }
            this.instancedDots.setColorAt(index, color);
        });
        
        this.instancedDots.instanceMatrix.needsUpdate = true;
        this.instancedDots.instanceColor.needsUpdate = true;
        
        // Check if hand is fully visible
        const margin = 0.05; // Match alignment calculation
        let fullyVisible = true;
        landmarks.forEach(landmark => {
            if (landmark.x < margin || landmark.x > 1 - margin ||
                landmark.y < margin || landmark.y > 1 - margin) {
                fullyVisible = false;
            }
        });
        
        const fingersExtended = this.checkFingerExtension(landmarks);
        
        if (!fullyVisible) {
            this.updateStatus('Show entire hand in frame', 'error');
            this.perfectAlignmentTime = 0;
            this.isAutoCapturing = false;
        } else if (!fingersExtended) {
            this.updateStatus('Extend your fingers', 'warning');
            this.perfectAlignmentTime = 0;
            this.isAutoCapturing = false;
        } else if (distance < 5) {
            this.updateStatus('Move hand back slightly', 'warning');
            this.perfectAlignmentTime = 0;
            this.isAutoCapturing = false;
        } else if (distance > 45) {
            this.updateStatus('Move hand closer', 'warning');
            this.perfectAlignmentTime = 0;
            this.isAutoCapturing = false;
        } else if (alignment < 0.3) { // Same threshold for both hands
            this.updateStatus('Center your palm', 'warning');
            this.perfectAlignmentTime = 0;
            this.isAutoCapturing = false;
        } else if (distance >= 5 && distance <= 45 && alignment >= 0.3 && fingersExtended) {
            // Additional validation for proper hand position (with lenient thresholds)
            const isHandFlat = this.checkHandFlatness(landmarks);
            
            // Check palm orientation
            const isPalmFacingCamera = this.checkPalmOrientation(landmarks);
            
            // Check for hand rotation
            const rotation = this.checkHandRotation(landmarks);
            
            if (!isPalmFacingCamera) {
                this.updateStatus('Close your palm a bit', 'warning');
                this.perfectAlignmentTime = 0;
                this.isAutoCapturing = false;
                console.log('Failed palm facing camera check', { isPalmFacingCamera });
            } else if (Math.abs(rotation) > 30) {
                // Hand is rotated too much
                if (rotation > 0) {
                    this.updateStatus('Rotate hand counter-clockwise ↺', 'warning');
                } else {
                    this.updateStatus('Rotate hand clockwise ↻', 'warning');
                }
                this.perfectAlignmentTime = 0;
                this.isAutoCapturing = false;
                console.log('Failed rotation check', { rotation });
            } else if (!isHandFlat) {
                // Hand must be open for proper palm capture
                this.updateStatus('Open your palm fully', 'warning');
                this.perfectAlignmentTime = 0;
                this.isAutoCapturing = false;
            } else {
                this.updateStatus('Perfect! Hold steady', 'success');
                this.handlePerfectAlignment();
            }
        }
    }
    
    calculatePalmCenter(landmarks) {
        const wrist = landmarks[0];
        const middleBase = landmarks[9];
        return {
            x: (wrist.x + middleBase.x) / 2,
            y: (wrist.y + middleBase.y) / 2,
            z: (wrist.z + middleBase.z) / 2
        };
    }
    
    /**
     * Converts palm Z-coordinate to distance in centimeters
     * Used for proximity validation and user feedback
     * 
     * @param {Object} palmCenter - Palm center coordinates {x, y, z}
     * @returns {number} Distance in centimeters (8-45cm range)
     */
    calculateDistance(palmCenter) {
        // Calculate distance based on palm size on screen
        // When hand is close, it takes up more screen space
        const palmArea = this.calculatePalmArea(this.palmData);
        
        
        // Map palm area to distance:
        // Large palm area (>0.05) = very close (<20cm)
        // Medium palm area (0.01-0.05) = good distance (20-45cm)
        // Small palm area (<0.01) = too far (>45cm)
        
        let distance;
        if (palmArea > 0.08) {
            distance = 5; // Very close
        } else if (palmArea > 0.05) {
            distance = Math.round(5 + (0.08 - palmArea) * 500); // 5-20cm
        } else if (palmArea > 0.01) {
            distance = Math.round(20 + (0.05 - palmArea) * 625); // 20-45cm
        } else {
            // Small palm area - far away
            distance = Math.round(45 + (0.01 - palmArea) * 4000); // 45-85cm
        }
        
        return distance;
    }
    
    calculateAlignment(landmarks) {
        // Check if all landmarks are within frame bounds
        const margin = 0.03; // 3% margin from edges - even more lenient
        let allVisible = true;
        
        // Check critical landmarks only
        const criticalPoints = [0, 4, 8, 12, 16, 20]; // Wrist and fingertips
        criticalPoints.forEach(idx => {
            const landmark = landmarks[idx];
            if (landmark.x < margin || landmark.x > 1 - margin ||
                landmark.y < margin || landmark.y > 1 - margin) {
                allVisible = false;
            }
        });
        
        if (!allVisible) return 0;
        
        // Calculate palm area to ensure hand is properly sized
        const palmArea = this.calculatePalmArea(landmarks);
        const minArea = 0.01; // Even more lenient minimum for very close hands
        const maxArea = 0.4; // Allow very large hands when close
        const areaScore = palmArea < minArea ? palmArea / minArea : 
                         palmArea > maxArea ? 0.8 : 1;
        
        // Check palm is facing camera (more lenient)
        const palmNormal = this.calculatePalmNormal(landmarks);
        const orientationScore = Math.max(0, Math.min(1, palmNormal.z * 1.5));
        
        // Check finger spread (more lenient)
        const fingerSpread = this.calculateFingerSpread(landmarks);
        const spreadScore = Math.min(1, fingerSpread / 0.1); // Lower requirement
        
        // Calculate center position (much more lenient)
        const palmCenter = this.calculatePalmCenter(landmarks);
        const centerDistance = Math.sqrt(
            Math.pow(palmCenter.x - 0.5, 2) + 
            Math.pow(palmCenter.y - 0.5, 2)
        );
        const centerScore = Math.max(0.5, 1 - centerDistance); // More forgiving
        
        // Combine factors with adjusted weights
        const alignment = allVisible ? 
            (areaScore * 0.25 + orientationScore * 0.35 + spreadScore * 0.15 + centerScore * 0.25) : 
            0;
        
        return Math.max(0, Math.min(1, alignment));
    }
    
    calculatePalmArea(landmarks) {
        // Calculate area of palm polygon using shoelace formula
        const palmPoints = [0, 5, 9, 13, 17]; // Wrist and finger bases
        let area = 0;
        
        for (let i = 0; i < palmPoints.length; i++) {
            const j = (i + 1) % palmPoints.length;
            const p1 = landmarks[palmPoints[i]];
            const p2 = landmarks[palmPoints[j]];
            area += p1.x * p2.y - p2.x * p1.y;
        }
        
        return Math.abs(area / 2);
    }
    
    calculateFingerSpread(landmarks) {
        // Calculate average distance between adjacent fingertips
        const fingertips = [4, 8, 12, 16, 20];
        let totalSpread = 0;
        
        for (let i = 0; i < fingertips.length - 1; i++) {
            const p1 = landmarks[fingertips[i]];
            const p2 = landmarks[fingertips[i + 1]];
            const distance = Math.sqrt(
                Math.pow(p1.x - p2.x, 2) + 
                Math.pow(p1.y - p2.y, 2)
            );
            totalSpread += distance;
        }
        
        return totalSpread / (fingertips.length - 1);
    }
    
    checkFingerExtension(landmarks) {
        // This now checks for reasonable finger extension (not fully spread, but not closed)
        // Combined with checkHandFlatness for complete palm validation
        const fingerGroups = [
            [5, 6, 7, 8], // Index
            [9, 10, 11, 12], // Middle
            [13, 14, 15, 16], // Ring
            [17, 18, 19, 20] // Pinky
        ];
        
        let extendedCount = 0;
        
        fingerGroups.forEach(finger => {
            const base = landmarks[finger[0]];
            const middle = landmarks[finger[2]];
            const tip = landmarks[finger[3]];
            
            // Calculate angle between base->middle and middle->tip
            const v1 = {
                x: middle.x - base.x,
                y: middle.y - base.y
            };
            const v2 = {
                x: tip.x - middle.x,
                y: tip.y - middle.y
            };
            
            // Dot product to check alignment (straighter = higher value)
            const dot = v1.x * v2.x + v1.y * v2.y;
            const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
            const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
            const alignment = dot / (mag1 * mag2);
            
            // Finger is extended if alignment is good (relaxed threshold)
            // 0.5 allows more natural, relaxed finger positions
            if (alignment > 0.5) {
                extendedCount++;
            }
        });
        
        // Require at least 3 fingers to be reasonably extended
        return extendedCount >= 3;
    }
    
    /**
     * Validates that the hand is open and flat (not a fist)
     * Ensures palm is visible for proper biometric capture
     * 
     * @param {Array} landmarks - 21 hand landmarks from MediaPipe
     * @returns {boolean} True if hand is sufficiently flat and open
     */
    checkHandFlatness(landmarks) {
        // Check if palm is open (not a fist) and reasonably flat
        // We need to ensure palm is visible for biometric capture
        
        // 1. Check if fingers are not curled into palm (fist detection)
        const palmCenter = this.calculatePalmCenter(landmarks);
        const fingerTips = [4, 8, 12, 16, 20];
        const fingerMids = [3, 6, 10, 14, 18];
        
        let openFingers = 0;
        fingerTips.forEach((tipIdx, i) => {
            const tip = landmarks[tipIdx];
            const mid = landmarks[fingerMids[i]];
            
            // Check if fingertip is reasonably far from palm center
            const tipToPalmDist = Math.sqrt(
                Math.pow(tip.x - palmCenter.x, 2) + 
                Math.pow(tip.y - palmCenter.y, 2)
            );
            
            // Check if finger is not severely bent
            const tipToMidDist = Math.sqrt(
                Math.pow(tip.x - mid.x, 2) + 
                Math.pow(tip.y - mid.y, 2)
            );
            
            // Finger is open if tip is far from palm and reasonably straight
            // Relaxed thresholds to allow slightly closed fingers
            if (tipToPalmDist > 0.15 && tipToMidDist > 0.05) {
                openFingers++;
            }
        });
        
        // 2. Check Z-coordinate flatness (but more lenient)
        const palmBase = landmarks[0].z;
        let maxZDeviation = 0;
        fingerTips.forEach(idx => {
            const deviation = Math.abs(landmarks[idx].z - palmBase);
            maxZDeviation = Math.max(maxZDeviation, deviation);
        });
        
        // Require at least 3 fingers open and reasonable flatness
        // This allows for a slightly closed palm while still ensuring it's not a fist
        return openFingers >= 3 && maxZDeviation < 0.15;
    }
    
    /**
     * Verifies palm is facing the camera using landmark analysis
     * Works equally for both left and right hands
     * 
     * @param {Array} landmarks - 21 hand landmarks from MediaPipe
     * @returns {boolean} True if palm is oriented toward camera
     */
    checkPalmOrientation(landmarks) {
        // MediaPipe can track hands from both sides, so we use multiple checks
        // to ensure we're seeing the palm side, not the back of the hand
        
        const wrist = landmarks[0];
        const thumbCmc = landmarks[1];
        const thumbMcp = landmarks[2];
        const thumbIp = landmarks[3];
        const thumbTip = landmarks[4];
        const indexMcp = landmarks[5];
        const middleMcp = landmarks[9];
        const ringMcp = landmarks[13];
        const pinkyMcp = landmarks[17];
        
        // Use MediaPipe's handedness info if available
        const isLeftHand = this.handedness === 'Left';
        
        // Method 1: Z-depth based check
        // In palm view, fingertips are closer to camera (more negative z) than knuckles
        // In back view, knuckles are closer to camera than fingertips
        const fingertips = [landmarks[4], landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
        const avgFingertipZ = fingertips.reduce((sum, tip) => sum + tip.z, 0) / 5;
        const avgMcpZ = (indexMcp.z + middleMcp.z + ringMcp.z + pinkyMcp.z) / 4;
        
        // For palm view, fingertips should be closer (more negative Z) than MCPs
        // Add a small tolerance for close distances where depth differences are minimal
        const depthCheck = avgFingertipZ < avgMcpZ + 0.01;
        
        // Method 2: Thumb position relative to palm
        // Calculate palm normal using cross product
        const v1 = {
            x: indexMcp.x - wrist.x,
            y: indexMcp.y - wrist.y,
            z: indexMcp.z - wrist.z
        };
        
        const v2 = {
            x: pinkyMcp.x - wrist.x,
            y: pinkyMcp.y - wrist.y,
            z: pinkyMcp.z - wrist.z
        };
        
        // Cross product for normal
        const normal = {
            x: v1.y * v2.z - v1.z * v2.y,
            y: v1.z * v2.x - v1.x * v2.z,
            z: v1.x * v2.y - v1.y * v2.x
        };
        
        // For left hand, the normal should point toward camera (negative z)
        // For right hand, the normal should point toward camera (positive z) when showing palm
        const normalCheck = isLeftHand ? normal.z < 0 : normal.z > 0;
        
        // Simplified approach: use depth and normal checks which are most reliable
        if (this.debug) {
            console.log('Palm orientation:', {
                hand: isLeftHand ? 'LEFT' : 'RIGHT',
                depthCheck,
                normalCheck,
                handedness: this.handedness
            });
        }
        
        // Both checks must pass for palm detection
        return depthCheck && normalCheck;
    }
    
    /**
     * Calculate angle between three points in degrees
     */
    calculateAngle(p1, p2, p3) {
        const v1 = {
            x: p1.x - p2.x,
            y: p1.y - p2.y,
            z: p1.z - p2.z
        };
        
        const v2 = {
            x: p3.x - p2.x,
            y: p3.y - p2.y,
            z: p3.z - p2.z
        };
        
        const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
        const len1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
        const len2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2);
        
        const angle = Math.acos(Math.max(-1, Math.min(1, dot / (len1 * len2))));
        return angle * 180 / Math.PI;
    }
    
    /**
     * Calculate a simple palm normal for thumb orientation check
     */
    calculateSimplePalmNormal(landmarks) {
        const wrist = landmarks[0];
        const indexMcp = landmarks[5];
        const pinkyMcp = landmarks[17];
        
        // Two vectors in palm plane
        const v1 = {
            x: indexMcp.x - wrist.x,
            y: indexMcp.y - wrist.y,
            z: indexMcp.z - wrist.z
        };
        
        const v2 = {
            x: pinkyMcp.x - wrist.x,
            y: pinkyMcp.y - wrist.y,
            z: pinkyMcp.z - wrist.z
        };
        
        // Cross product
        const normal = {
            x: v1.y * v2.z - v1.z * v2.y,
            y: v1.z * v2.x - v1.x * v2.z,
            z: v1.x * v2.y - v1.y * v2.x
        };
        
        // Normalize
        const length = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
        
        return {
            x: normal.x / length,
            y: normal.y / length,
            z: normal.z / length
        };
    }
    
    /**
     * Detects hand rotation angle for alignment guidance
     * Handles differences between left and right hands
     * 
     * @param {Array} landmarks - 21 hand landmarks from MediaPipe
     * @returns {number} Rotation angle in degrees (positive = needs clockwise)
     */
    checkHandRotation(landmarks) {
        // Check hand rotation by comparing middle finger to wrist alignment
        const wrist = landmarks[0];
        const middleBase = landmarks[9];
        const index = landmarks[5];
        const pinky = landmarks[17];
        
        // Detect if this is a left or right hand
        const isLeftHand = index.x > pinky.x;
        
        // Vector from wrist to middle finger base
        const baseVector = {
            x: middleBase.x - wrist.x,
            y: middleBase.y - wrist.y
        };
        
        // Expected vertical vector (straight up)
        const verticalVector = { x: 0, y: -1 };
        
        // Calculate angle between vectors
        const dot = baseVector.x * verticalVector.x + baseVector.y * verticalVector.y;
        const det = baseVector.x * verticalVector.y - baseVector.y * verticalVector.x;
        let angle = Math.atan2(det, dot) * (180 / Math.PI);
        
        // For left hands, we need to adjust what's considered "straight"
        // Left hands naturally have middle finger pointing slightly left when straight
        if (isLeftHand) {
            // Adjust the expected angle for left hands
            angle = -angle; // Flip the angle for left hands
        }
        
        return angle; // Returns rotation in degrees (positive = needs clockwise rotation)
    }
    
    /**
     * Calculates full hand orientation (pitch, roll, yaw)
     * Returns euler angles for complete 3D orientation
     * 
     * @param {Array} landmarks - 21 hand landmarks
     * @returns {Object} {pitch, roll, yaw} in degrees
     */
    calculateHandOrientation(landmarks) {
        const wrist = landmarks[0];
        const middleBase = landmarks[9];
        const indexBase = landmarks[5];
        const pinkyBase = landmarks[17];
        
        // Calculate hand coordinate system
        // X-axis: from pinky to index (across palm)
        const xAxis = {
            x: indexBase.x - pinkyBase.x,
            y: indexBase.y - pinkyBase.y,
            z: indexBase.z - pinkyBase.z
        };
        
        // Y-axis: from wrist to middle finger (along palm)
        const yAxis = {
            x: middleBase.x - wrist.x,
            y: middleBase.y - wrist.y,
            z: middleBase.z - wrist.z
        };
        
        // Normalize axes
        const xLength = Math.sqrt(xAxis.x**2 + xAxis.y**2 + xAxis.z**2);
        const yLength = Math.sqrt(yAxis.x**2 + yAxis.y**2 + yAxis.z**2);
        
        xAxis.x /= xLength; xAxis.y /= xLength; xAxis.z /= xLength;
        yAxis.x /= yLength; yAxis.y /= yLength; yAxis.z /= yLength;
        
        // Z-axis: cross product (palm normal)
        const zAxis = {
            x: xAxis.y * yAxis.z - xAxis.z * yAxis.y,
            y: xAxis.z * yAxis.x - xAxis.x * yAxis.z,
            z: xAxis.x * yAxis.y - xAxis.y * yAxis.x
        };
        
        // Extract euler angles
        // Pitch: rotation around X-axis (tilt forward/back)
        const pitch = Math.atan2(-zAxis.y, Math.sqrt(zAxis.x**2 + zAxis.z**2)) * 180 / Math.PI;
        
        // Roll: rotation around Z-axis (tilt left/right)
        const roll = Math.atan2(xAxis.z, yAxis.z) * 180 / Math.PI;
        
        // Yaw: rotation around Y-axis (already implemented as rotation)
        const yaw = this.checkHandRotation(landmarks);
        
        return { pitch, roll, yaw };
    }
    
    calculatePalmNormal(landmarks) {
        const wrist = landmarks[0];
        const index = landmarks[5];
        const pinky = landmarks[17];
        
        // Detect if this is a left or right hand
        const isLeftHand = index.x > pinky.x;
        
        const v1 = {
            x: index.x - wrist.x,
            y: index.y - wrist.y,
            z: index.z - wrist.z
        };
        
        const v2 = {
            x: pinky.x - wrist.x,
            y: pinky.y - wrist.y,
            z: pinky.z - wrist.z
        };
        
        // Use consistent cross product - MediaPipe landmarks are always palm-side
        // For palm-facing-camera, we want normal pointing toward camera (negative Z)
        const normal = {
            x: v1.y * v2.z - v1.z * v2.y,
            y: v1.z * v2.x - v1.x * v2.z,
            z: v1.x * v2.y - v1.y * v2.x
        };
        
        // For left hands, we need to flip the normal
        if (isLeftHand) {
            normal.x *= -1;
            normal.y *= -1;
            normal.z *= -1;
        }
        
        const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
        
        return {
            x: normal.x / length,
            y: normal.y / length,
            z: normal.z / length
        };
    }
    
    updateMetrics(landmarks) {
        if (!landmarks) return;
        
        const palmCenter = this.calculatePalmCenter(landmarks);
        const distance = this.calculateDistance(palmCenter);
        const alignment = this.calculateAlignment(landmarks);
        const features = this.detectFeatures(landmarks);
        
        // Get full orientation
        const orientation = this.calculateHandOrientation(landmarks);
        
        // Store for access
        this.currentOrientation = orientation;
        this.currentPosition = {
            x: palmCenter.x * 100,  // Convert to percentage
            y: palmCenter.y * 100,  // Convert to percentage
            z: distance
        };
        
        this.updateMetricBar('distance', distance, 50);
        this.updateMetricBar('alignment', alignment * 100, 100);
        this.updateMetricBar('features', features, 100);
        
        document.querySelector('.distance-value').textContent = `${Math.round(distance)}cm`;
        document.querySelector('.alignment-value').textContent = `${Math.round(alignment * 100)}%`;
        document.querySelector('.features-value').textContent = `${Math.round(features)}%`;
        
    }
    
    detectFeatures(landmarks) {
        const fingerSpreads = [];
        for (let i = 0; i < 4; i++) {
            const finger1 = landmarks[4 + i * 4];
            const finger2 = landmarks[8 + i * 4];
            const spread = Math.sqrt(
                Math.pow(finger1.x - finger2.x, 2) +
                Math.pow(finger1.y - finger2.y, 2)
            );
            fingerSpreads.push(spread);
        }
        
        const avgSpread = fingerSpreads.reduce((a, b) => a + b) / fingerSpreads.length;
        return Math.min(100, avgSpread * 500);
    }
    
    updateMetricBar(metric, value, max) {
        const fill = document.querySelector(`.${metric}-fill`);
        const percentage = Math.min(100, (value / max) * 100);
        fill.style.width = `${percentage}%`;
    }
    
    updateStatus(text, type = '') {
        const statusIndicator = document.querySelector('.status-indicator');
        const statusText = document.querySelector('.status-text');
        
        statusIndicator.className = `status-indicator ${type}`;
        statusText.textContent = text;
    }
    
    handlePerfectAlignment() {
        const now = Date.now();
        
        // Check cooldown period
        if (now - this.lastCaptureTime < this.captureCooldown) {
            return;
        }
        
        if (!this.isAutoCapturing) {
            this.isAutoCapturing = true;
            this.perfectAlignmentTime = now;
        }
        
        // Require stable alignment for 500ms before capture
        if (now - this.perfectAlignmentTime >= 500) {
            this.capture();
            this.isAutoCapturing = false;
            this.lastCaptureTime = now;
        }
    }
    
    showCountdown(seconds) {
        const existing = document.querySelector('.auto-capture-indicator');
        if (existing) existing.remove();
        
        const indicator = document.createElement('div');
        indicator.className = 'auto-capture-indicator';
        indicator.textContent = seconds;
        document.querySelector('.dot-projector-container').appendChild(indicator);
        
        setTimeout(() => indicator.remove(), 900);
    }
    
    /**
     * Main capture method - routes to appropriate capture mode
     * Handles both single (RGB) and dual (IR+RGB) capture flows
     * 
     * @public
     */
    capture() {
        if (!this.palmData || !this.videoElement.srcObject) {
            this.updateStatus('No palm detected', 'error');
            return;
        }
        
        // Re-validate hand state before capture
        const isHandFlat = this.checkHandFlatness(this.palmData);
        const isPalmOriented = this.checkPalmOrientation(this.palmData);
        
        if (!isHandFlat) {
            this.updateStatus('Open your palm fully', 'warning');
            this.isAutoCapturing = false;
            this.perfectAlignmentTime = 0;
            return;
        }
        
        if (!isPalmOriented) {
            this.updateStatus('Face your palm to the camera', 'warning');
            this.isAutoCapturing = false;
            this.perfectAlignmentTime = 0;
            return;
        }
        
        // Capture current palm data to avoid null reference in async callback
        const currentPalmData = [...this.palmData];
        
        // Setup capture canvas
        this.captureCanvas.width = this.videoElement.videoWidth;
        this.captureCanvas.height = this.videoElement.videoHeight;
        
        if (this.irMode) {
            // Capture both regular and IR images when IR mode is on
            this.captureDualMode();
        } else {
            // Single regular capture
            this.showEnhancedCaptureFeedback();
            
            this.createRegularCapture(this.captureCtx, this.captureCanvas.width, this.captureCanvas.height);
            
            // Convert to blob with compression
            this.captureCanvas.toBlob((blob) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const captureData = {
                        id: Date.now(),
                        image: reader.result,
                        type: 'regular',
                        timestamp: new Date().toISOString(),
                        metrics: {
                            distance: this.calculateDistance(this.calculatePalmCenter(currentPalmData)),
                            alignment: Math.round(this.calculateAlignment(currentPalmData) * 100)
                        }
                    };
                    
                    this.captures.unshift(captureData);
                    // Reduce max captures to prevent quota issues
                    if (this.captures.length > 10) {
                        this.captures = this.captures.slice(0, 10);
                    }
                    
                    try {
                        localStorage.setItem('palmCaptures', JSON.stringify(this.captures));
                    } catch (e) {
                        if (e.name === 'QuotaExceededError') {
                            console.warn('Storage quota exceeded, clearing old captures');
                            // Keep only the 5 most recent captures
                            this.captures = this.captures.slice(0, 5);
                            localStorage.setItem('palmCaptures', JSON.stringify(this.captures));
                        }
                    }
                    this.updateStatus('Captured successfully!', 'success');
                    
                    setTimeout(() => {
                        this.updateStatus('Scanning...', 'scanning');
                    }, 2000);
                };
                reader.readAsDataURL(blob);
            }, 'image/jpeg', 0.8); // Use JPEG compression at 80% quality
        }
        
        this.isAutoCapturing = false;
        this.perfectAlignmentTime = 0;
    }
    
    toggleIRMode() {
        this.irMode = !this.irMode;
        const btn = document.getElementById('irModeBtn');
        btn.textContent = `IR Mode: ${this.irMode ? 'ON' : 'OFF'}`;
        btn.classList.toggle('active', this.irMode);
        
        // Show IR camera selector when IR mode is on
        const irSelector = document.getElementById('irCameraSelectorWrapper');
        if (irSelector) {
            irSelector.style.display = this.irMode ? 'flex' : 'none';
        }
        
        if (this.irMode) {
            // Change dot colors for IR mode
            this.instancedDots.material.color.setHex(0x8800ff);
            this.instancedDots.material.emissive.setHex(0x440088);
            
            // Don't apply filter - it messes up the hand tracking colors
            // this.renderer.domElement.style.filter = 'hue-rotate(270deg) saturate(1.5)';
            
            // Switch to IR camera if scanning
            if (this.isScanning) {
                this.stopScanning();
                setTimeout(() => this.startScanning(), 500);
            }
        } else {
            // Reset dot colors for normal mode
            this.instancedDots.material.color.setHex(0x00b366);
            this.instancedDots.material.emissive.setHex(0x005933);
            
            // Remove filter
            this.renderer.domElement.style.filter = 'none';
            
            // Switch back to regular camera if scanning
            if (this.isScanning) {
                this.stopScanning();
                setTimeout(() => this.startScanning(), 500);
            }
        }
    }
    
    /**
     * Captures both IR and RGB images in the proper sequence.
     * 
     * CAPTURE FLOW:
     * 1. Switch to IR camera and capture IR image
     * 2. Immediately switch to RGB camera and capture regular image
     * 3. Switch back to the camera that was active before capture
     * 
     * This sequence ensures IR illumination doesn't interfere with RGB capture.
     * 
     * To customize the capture sequence:
     * - Modify the camera switching order in this method
     * - Adjust the delay between captures (currently 100ms)
     * - Change which camera to return to after capture
     */
    /**
     * Captures both IR and RGB images in proper sequence
     * Switches cameras only if different devices selected
     * 
     * CAPTURE FLOW:
     * 1. Switch to IR camera (if different)
     * 2. Capture IR image with vein patterns
     * 3. Switch to RGB camera (if different)
     * 4. Capture regular RGB image
     * 5. Store both with metadata
     * 
     * @async
     * @private
     */
    async captureDualMode() {
        // Capture current palm data to avoid null reference in async operations
        const currentPalmData = this.palmData ? [...this.palmData] : null;
        if (!currentPalmData) {
            this.updateStatus('No palm detected', 'error');
            return;
        }
        
        const w = this.captureCanvas.width;
        const h = this.captureCanvas.height;
        const timestamp = new Date().toISOString();
        const id = Date.now();
        const metrics = {
            distance: this.calculateDistance(this.calculatePalmCenter(currentPalmData)),
            alignment: Math.round(this.calculateAlignment(currentPalmData) * 100)
        };
        
        // Show enhanced capture feedback
        this.showEnhancedCaptureFeedback();
        
        try {
            // Create both captures from the same video frame simultaneously
            
            // Create a second canvas for IR capture
            const irCanvas = document.createElement('canvas');
            irCanvas.width = w;
            irCanvas.height = h;
            const irCtx = irCanvas.getContext('2d');
            
            // Capture both modes at the same time from the same palm data
            this.createRegularCapture(this.captureCtx, w, h, currentPalmData);
            this.createIRVeinCapture(irCtx, w, h, currentPalmData);
            
            // Convert both to blobs simultaneously
            const [regularBlob, irBlob] = await Promise.all([
                new Promise(resolve => this.captureCanvas.toBlob(resolve, 'image/jpeg', 0.8)),
                new Promise(resolve => irCanvas.toBlob(resolve, 'image/jpeg', 0.8))
            ]);
            
            // Process and save both captures
            const irReader = new FileReader();
            const regularReader = new FileReader();
            
            irReader.onloadend = () => {
                const irCapture = {
                    id: id,
                    image: irReader.result,
                    type: 'ir',
                    timestamp: timestamp,
                    metrics: metrics,
                    pairedWith: id + 1
                };
                
                regularReader.onloadend = () => {
                    const regularCapture = {
                        id: id + 1,
                        image: regularReader.result,
                        type: 'regular',
                        timestamp: timestamp,
                        metrics: metrics,
                        pairedWith: id
                    };
                    
                    // Save both captures
                    this.captures.unshift(regularCapture);
                    this.captures.unshift(irCapture);
                    // Reduce max captures to prevent quota issues
                    if (this.captures.length > 10) {
                        this.captures = this.captures.slice(0, 10);
                    }
                    
                    try {
                        localStorage.setItem('palmCaptures', JSON.stringify(this.captures));
                    } catch (e) {
                        if (e.name === 'QuotaExceededError') {
                            console.warn('Storage quota exceeded, clearing old captures');
                            // Keep only the 5 most recent captures
                            this.captures = this.captures.slice(0, 5);
                            localStorage.setItem('palmCaptures', JSON.stringify(this.captures));
                        }
                    }
                    this.updateStatus('Captured IR + RGB successfully!', 'success');
                    
                    setTimeout(() => {
                        this.updateStatus('Scanning...', 'scanning');
                    }, 2000);
                };
                regularReader.readAsDataURL(regularBlob);
            };
            irReader.readAsDataURL(irBlob);
            
        } catch (error) {
            console.error('Dual capture error:', error);
            this.updateStatus('Capture failed', 'error');
        }
    }
    
    /**
     * Switches to a specific camera by device ID
     * @param {string} deviceId - The device ID of the camera to switch to
     */
    async switchToCamera(deviceId) {
        if (this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(track => track.stop());
        }
        
        const constraints = {
            video: {
                deviceId: { exact: deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.videoElement.srcObject = stream;
        await new Promise(resolve => {
            this.videoElement.onloadedmetadata = () => {
                this.videoElement.play();
                resolve();
            };
        });
    }
    
    createRegularCapture(ctx, w, h, palmData = null) {
        // Use passed palmData or fall back to current palmData
        const landmarks = palmData || this.palmData;
        
        // Check if palmData exists
        if (!landmarks) {
            console.warn('No palm data available for regular capture');
            // Just draw the video without palm-specific processing
            ctx.drawImage(this.videoElement, 0, 0, w, h);
            return;
        }
        
        // Get palm bounds with padding for zoom
        const palmBounds = this.getPalmBounds(landmarks, w, h, 80);
        
        // Calculate zoom factor to fill canvas nicely
        const zoomFactorX = w / palmBounds.width;
        const zoomFactorY = h / palmBounds.height;
        const zoomFactor = Math.min(zoomFactorX, zoomFactorY) * 0.8;
        
        // Calculate translation to center the palm
        const translateX = (w - palmBounds.width * zoomFactor) / 2 - palmBounds.left * zoomFactor;
        const translateY = (h - palmBounds.height * zoomFactor) / 2 - palmBounds.top * zoomFactor;
        
        // Draw the full video frame first
        ctx.save();
        ctx.translate(translateX, translateY);
        ctx.scale(zoomFactor, zoomFactor);
        ctx.drawImage(this.videoElement, 0, 0, w, h);
        ctx.restore();
        
        // Apply portrait blur effect to background
        this.applyPortraitBlur(ctx, w, h, palmBounds, zoomFactor, translateX, translateY);
        
        // Add biometric overlay
        ctx.save();
        ctx.translate(translateX, translateY);
        ctx.scale(zoomFactor, zoomFactor);
        this.drawBiometricOverlay(ctx, landmarks, w, h);
        ctx.restore();
        
        // Add scan effects
        this.addScanEffects(ctx, w, h, false);
    }
    
    createIRVeinCapture(ctx, w, h, palmData = null) {
        
        // Use passed palmData or fall back to current palmData
        const landmarks = palmData || this.palmData;
        
        // Check if palmData exists
        if (!landmarks) {
            console.warn('No palm data available for IR capture');
            // Just draw dark background
            ctx.fillStyle = '#1a001a';
            ctx.fillRect(0, 0, w, h);
            return;
        }
        
        // Get palm bounds with padding for zoom
        const palmBounds = this.getPalmBounds(landmarks, w, h, 80);
        
        // Calculate zoom factor
        const zoomFactorX = w / palmBounds.width;
        const zoomFactorY = h / palmBounds.height;
        const zoomFactor = Math.min(zoomFactorX, zoomFactorY) * 0.8;
        
        // Calculate translation to center the palm
        const translateX = (w - palmBounds.width * zoomFactor) / 2 - palmBounds.left * zoomFactor;
        const translateY = (h - palmBounds.height * zoomFactor) / 2 - palmBounds.top * zoomFactor;
        
        // Dark purple background for IR
        ctx.fillStyle = '#1a001a';
        ctx.fillRect(0, 0, w, h);
        
        // Draw video in IR style (heavily filtered)
        ctx.save();
        ctx.translate(translateX, translateY);
        ctx.scale(zoomFactor, zoomFactor);
        
        // Apply strong IR filter to video - make it purple/magenta
        ctx.filter = 'brightness(0.2) contrast(2) hue-rotate(270deg) saturate(3)';
        ctx.drawImage(this.videoElement, 0, 0, w, h);
        ctx.filter = 'none';
        
        // Draw simulated vein patterns
        this.drawVeinPattern(ctx, landmarks, w, h);
        
        // Draw IR biometric overlay
        this.drawIRBiometricOverlay(ctx, landmarks, w, h);
        
        ctx.restore();
        
        // Apply IR portrait effect
        this.applyIRPortraitEffect(ctx, w, h, palmBounds, zoomFactor, translateX, translateY);
        
        // Add IR scan effects
        this.addScanEffects(ctx, w, h, true);
    }
    
    // Removed createTightHandMask and createHandMask - no longer needed with portrait blur approach
    
    drawVeinPattern(ctx, landmarks, w, h) {
        ctx.save();
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.8;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff00ff';
        
        // Generate procedural vein paths
        const palmCenter = this.calculatePalmCenter(landmarks);
        
        // Main veins from wrist to fingers
        const fingerBases = [5, 9, 13, 17];
        fingerBases.forEach((base, i) => {
            ctx.beginPath();
            ctx.moveTo(landmarks[0].x * w, landmarks[0].y * h);
            
            // Add some curvature
            const cpx = (landmarks[0].x + landmarks[base].x) * w / 2 + (Math.random() - 0.5) * 20;
            const cpy = (landmarks[0].y + landmarks[base].y) * h / 2 + (Math.random() - 0.5) * 20;
            
            ctx.quadraticCurveTo(cpx, cpy, landmarks[base].x * w, landmarks[base].y * h);
            ctx.stroke();
            
            // Branch veins
            for (let j = 0; j < 3; j++) {
                ctx.beginPath();
                const t = 0.3 + j * 0.2;
                const px = landmarks[0].x * (1-t) + landmarks[base].x * t;
                const py = landmarks[0].y * (1-t) + landmarks[base].y * t;
                
                ctx.moveTo(px * w, py * h);
                ctx.lineTo(
                    px * w + (Math.random() - 0.5) * 30,
                    py * h + (Math.random() - 0.5) * 30
                );
                ctx.stroke();
            }
        });
        
        // Cross-connecting veins
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            const start = fingerBases[Math.floor(Math.random() * fingerBases.length)];
            const end = fingerBases[Math.floor(Math.random() * fingerBases.length)];
            
            ctx.moveTo(landmarks[start].x * w, landmarks[start].y * h);
            ctx.lineTo(landmarks[end].x * w, landmarks[end].y * h);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    drawIRBiometricOverlay(ctx, landmarks, w, h) {
        ctx.save();
        
        // Heat signature points
        ctx.globalAlpha = 0.8;
        landmarks.forEach((landmark, idx) => {
            const x = landmark.x * w;
            const y = landmark.y * h;
            
            // Create heat gradient
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, 15);
            gradient.addColorStop(0, 'rgba(255, 0, 255, 0.8)');
            gradient.addColorStop(0.5, 'rgba(255, 0, 128, 0.4)');
            gradient.addColorStop(1, 'rgba(255, 0, 255, 0)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, 15, 0, 2 * Math.PI);
            ctx.fill();
        });
        
        // IR markers
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        ctx.font = '10px monospace';
        ctx.fillStyle = '#ff00ff';
        
        // Add temperature readings
        const temps = ['36.2°C', '36.5°C', '36.3°C', '36.4°C', '36.1°C'];
        [0, 4, 8, 12, 16].forEach((idx, i) => {
            const x = landmarks[idx].x * w;
            const y = landmarks[idx].y * h;
            ctx.fillText(temps[i], x + 10, y - 10);
        });
        
        ctx.restore();
    }
    
    applyPortraitBlur(ctx, w, h, palmBounds, zoomFactor, translateX, translateY) {
        ctx.save();
        
        // Create radial gradient from palm center
        const centerX = translateX + (palmBounds.centerX * zoomFactor);
        const centerY = translateY + (palmBounds.centerY * zoomFactor);
        const radius = palmBounds.radius * zoomFactor * 1.5;
        
        // Apply vignette/blur effect
        const gradient = ctx.createRadialGradient(
            centerX, centerY, radius * 0.5,
            centerX, centerY, radius * 2
        );
        
        gradient.addColorStop(0, 'rgba(240, 244, 243, 0)');
        gradient.addColorStop(0.5, 'rgba(240, 244, 243, 0.3)');
        gradient.addColorStop(0.8, 'rgba(240, 244, 243, 0.7)');
        gradient.addColorStop(1, 'rgba(240, 244, 243, 0.95)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        
        // Add soft focus effect around edges
        ctx.globalCompositeOperation = 'multiply';
        const edgeGradient = ctx.createRadialGradient(
            centerX, centerY, radius * 0.7,
            centerX, centerY, radius * 2.5
        );
        
        edgeGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        edgeGradient.addColorStop(0.6, 'rgba(255, 255, 255, 1)');
        edgeGradient.addColorStop(1, 'rgba(200, 200, 200, 0.8)');
        
        ctx.fillStyle = edgeGradient;
        ctx.fillRect(0, 0, w, h);
        
        ctx.restore();
    }
    
    applyIRPortraitEffect(ctx, w, h, palmBounds, zoomFactor, translateX, translateY) {
        ctx.save();
        
        // Create radial gradient from palm center
        const centerX = translateX + (palmBounds.centerX * zoomFactor);
        const centerY = translateY + (palmBounds.centerY * zoomFactor);
        const radius = palmBounds.radius * zoomFactor * 1.5;
        
        // Apply IR vignette effect
        const gradient = ctx.createRadialGradient(
            centerX, centerY, radius * 0.5,
            centerX, centerY, radius * 2
        );
        
        gradient.addColorStop(0, 'rgba(10, 10, 10, 0)');
        gradient.addColorStop(0.5, 'rgba(10, 10, 10, 0.3)');
        gradient.addColorStop(0.8, 'rgba(10, 10, 10, 0.7)');
        gradient.addColorStop(1, 'rgba(10, 10, 10, 0.95)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        
        ctx.restore();
    }
    
    addScanEffects(ctx, w, h, isIR) {
        ctx.save();
        
        // Scan lines
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = isIR ? '#ff00ff' : '#00ff88';
        ctx.lineWidth = 1;
        
        for (let y = 0; y < h; y += 15) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        
        // Frame
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = isIR ? '#ff00ff' : '#00ff88';
        ctx.lineWidth = 2;
        ctx.strokeRect(20, 20, w - 40, h - 40);
        
        // Mode indicator and data
        ctx.fillStyle = isIR ? '#ff00ff' : '#00ff88';
        ctx.font = 'bold 12px monospace';
        ctx.globalAlpha = 0.8;
        
        if (isIR) {
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#ff00ff';
            ctx.fillText('IR VEIN SCAN', 30, 40);
            
            // Temperature reading
            const temp = (36.5 + Math.random() * 0.8).toFixed(1);
            ctx.fillText(`TEMP: ${temp}°C`, 30, 60);
            ctx.fillText('VEIN PATTERN: DETECTED', 30, 80);
            ctx.fillText('BLOOD FLOW: NORMAL', 30, 100);
            
            // IR wavelength indicator
            ctx.font = '10px monospace';
            ctx.globalAlpha = 0.6;
            ctx.fillText('850nm INFRARED', w - 130, 40);
        } else {
            ctx.fillText('VISIBLE LIGHT SCAN', 30, 40);
            ctx.font = '10px monospace';
            ctx.globalAlpha = 0.6;
            ctx.fillText('RGB CAPTURE', w - 100, 40);
        }
        
        ctx.restore();
    }
    
    // Removed applyEdgeSoftening - no longer needed with portrait blur approach
    
    getPalmBounds(landmarks, w, h, padding) {
        if (!landmarks || landmarks.length === 0) {
            // Return default bounds if no landmarks
            return {
                left: w * 0.2,
                top: h * 0.2,
                width: w * 0.6,
                height: h * 0.6,
                centerX: w * 0.5,
                centerY: h * 0.5,
                radius: Math.min(w, h) * 0.3
            };
        }
        
        let minX = 1, maxX = 0, minY = 1, maxY = 0;
        
        landmarks.forEach(landmark => {
            minX = Math.min(minX, landmark.x);
            maxX = Math.max(maxX, landmark.x);
            minY = Math.min(minY, landmark.y);
            maxY = Math.max(maxY, landmark.y);
        });
        
        const left = Math.max(0, minX * w - padding);
        const top = Math.max(0, minY * h - padding);
        const right = Math.min(w, maxX * w + padding);
        const bottom = Math.min(h, maxY * h + padding);
        
        return {
            left,
            top,
            width: right - left,
            height: bottom - top,
            centerX: (left + right) / 2,
            centerY: (top + bottom) / 2,
            radius: Math.max(right - left, bottom - top) / 2
        };
    }
    
    createPalmPath(ctx, landmarks, w, h) {
        // Create a generous path that includes the entire hand
        const padding = 30; // Padding around landmarks
        
        // Create convex hull around all landmarks with padding
        ctx.beginPath();
        
        // Start with wrist
        ctx.moveTo(landmarks[0].x * w - padding, landmarks[0].y * h + padding);
        
        // Thumb side
        ctx.quadraticCurveTo(
            landmarks[1].x * w - padding * 2, landmarks[1].y * h,
            landmarks[4].x * w - padding, landmarks[4].y * h - padding
        );
        
        // Top of thumb to index
        ctx.quadraticCurveTo(
            landmarks[2].x * w, landmarks[2].y * h - padding * 1.5,
            landmarks[8].x * w, landmarks[8].y * h - padding
        );
        
        // Across fingertips
        ctx.quadraticCurveTo(
            landmarks[12].x * w, landmarks[12].y * h - padding * 1.5,
            landmarks[16].x * w, landmarks[16].y * h - padding
        );
        
        // Pinky to wrist
        ctx.quadraticCurveTo(
            landmarks[20].x * w + padding, landmarks[20].y * h - padding,
            landmarks[20].x * w + padding * 1.5, landmarks[20].y * h
        );
        
        // Bottom of pinky side
        ctx.quadraticCurveTo(
            landmarks[17].x * w + padding, landmarks[17].y * h + padding,
            landmarks[0].x * w + padding, landmarks[0].y * h + padding
        );
        
        // Back to start
        ctx.quadraticCurveTo(
            landmarks[0].x * w, landmarks[0].y * h + padding * 1.5,
            landmarks[0].x * w - padding, landmarks[0].y * h + padding
        );
        
        ctx.closePath();
    }
    
    drawBiometricOverlay(ctx, landmarks, w, h) {
        ctx.save();
        
        // Draw finger tracking connections
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#00ff88';
        
        // Draw hand skeleton
        this.handConnections.forEach(([start, end]) => {
            ctx.beginPath();
            ctx.moveTo(landmarks[start].x * w, landmarks[start].y * h);
            ctx.lineTo(landmarks[end].x * w, landmarks[end].y * h);
            ctx.stroke();
        });
        
        // Draw all landmark points
        ctx.fillStyle = '#00ff88';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        
        landmarks.forEach((landmark, idx) => {
            const x = landmark.x * w;
            const y = landmark.y * h;
            
            // Determine point size based on importance
            let radius = 3;
            if ([4, 8, 12, 16, 20].includes(idx)) radius = 5; // Fingertips
            if (idx === 0) radius = 6; // Wrist
            
            // Draw point
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.fill();
            
            // Draw outline for fingertips
            if ([4, 8, 12, 16, 20].includes(idx)) {
                ctx.stroke();
            }
        });
        
        // Draw palm grid pattern
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 0.5;
        ctx.shadowBlur = 0;
        
        const palmBounds = this.getPalmBounds(landmarks, w, h, 0);
        const gridSize = 30;
        
        for (let x = palmBounds.left; x < palmBounds.left + palmBounds.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, palmBounds.top);
            ctx.lineTo(x, palmBounds.top + palmBounds.height);
            ctx.stroke();
        }
        
        for (let y = palmBounds.top; y < palmBounds.top + palmBounds.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(palmBounds.left, y);
            ctx.lineTo(palmBounds.left + palmBounds.width, y);
            ctx.stroke();
        }
        
        // Draw biometric labels for key points
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#00ff88';
        ctx.font = '10px monospace';
        ctx.shadowBlur = 3;
        
        const fingerLabels = [
            { idx: 4, label: 'T' },
            { idx: 8, label: 'I' },
            { idx: 12, label: 'M' },
            { idx: 16, label: 'R' },
            { idx: 20, label: 'P' },
            { idx: 0, label: 'W' }
        ];
        
        fingerLabels.forEach(point => {
            const x = landmarks[point.idx].x * w;
            const y = landmarks[point.idx].y * h;
            ctx.fillText(point.label, x + 10, y - 8);
        });
        
        // Add scan info
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#00ff88';
        ctx.font = '11px monospace';
        ctx.shadowBlur = 0;
        
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        ctx.fillText(`SCAN TIME: ${timestamp}`, 30, h - 30);
        ctx.fillText(`BIOMETRIC ID: ${Math.random().toString(36).substr(2, 9).toUpperCase()}`, 30, h - 45);
        
        // Add distance and alignment info
        const distance = this.calculateDistance(this.calculatePalmCenter(landmarks));
        const alignment = Math.round(this.calculateAlignment(landmarks) * 100);
        ctx.fillText(`DISTANCE: ${distance}cm | ALIGNMENT: ${alignment}%`, 30, h - 60);
        
        ctx.restore();
    }
    
    
    showCaptureFlash() {
        const flash = document.createElement('div');
        flash.className = 'capture-flash';
        document.querySelector('.dot-projector-container').appendChild(flash);
        setTimeout(() => flash.remove(), 300);
    }
    
    /**
     * Shows enhanced visual feedback when capturing
     * Includes countdown, flash, and sound effect
     */
    showEnhancedCaptureFeedback() {
        // Create capture overlay
        const overlay = document.createElement('div');
        overlay.className = 'capture-overlay';
        overlay.innerHTML = `
            <div class="capture-animation">
                <div class="capture-ring"></div>
                <div class="capture-text">CAPTURING</div>
            </div>
        `;
        document.querySelector('.dot-projector-container').appendChild(overlay);
        
        // Camera shutter sound effect (using Web Audio API)
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 1000;
            gainNode.gain.value = 0.1;
            
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (e) {
            // Silent fail if audio not available
        }
        
        // Flash effect
        setTimeout(() => {
            this.showCaptureFlash();
        }, 200);
        
        // Remove overlay
        setTimeout(() => {
            overlay.remove();
        }, 1000);
    }
    
    showGallery() {
        const gallery = document.getElementById('captureGallery');
        const content = document.getElementById('galleryContent');
        
        content.innerHTML = '';
        
        if (this.captures.length === 0) {
            content.innerHTML = '<p style="text-align: center; color: #888;">No captures yet</p>';
        } else {
            this.captures.forEach(capture => {
                const item = document.createElement('div');
                item.className = 'capture-item';
                
                // Add IR class if it's an IR capture
                if (capture.type === 'ir') {
                    item.classList.add('ir-capture');
                }
                
                const date = new Date(capture.timestamp);
                const timeStr = date.toLocaleString();
                
                // Add type indicator
                const typeLabel = capture.type === 'ir' ? '<span style="color: #ff00ff; font-weight: bold;">[IR]</span> ' : '';
                
                item.innerHTML = `
                    <img src="${capture.image}" alt="Palm capture">
                    <div class="capture-info">
                        <div class="capture-time">${typeLabel}${timeStr}</div>
                        <div class="capture-metrics">
                            Distance: ${capture.metrics.distance}cm | 
                            Alignment: ${capture.metrics.alignment}%
                        </div>
                    </div>
                    <button class="delete-btn" onclick="dotProjector.deleteCapture(${capture.id})">&times;</button>
                `;
                
                content.appendChild(item);
            });
        }
        
        gallery.style.display = 'block';
    }
    
    hideGallery() {
        document.getElementById('captureGallery').style.display = 'none';
    }
    
    deleteCapture(id) {
        this.captures = this.captures.filter(c => c.id !== id);
        localStorage.setItem('palmCaptures', JSON.stringify(this.captures));
        this.showGallery(); // Refresh gallery
    }
    
    clearAllCaptures() {
        if (confirm('Are you sure you want to delete all captures?')) {
            this.captures = [];
            localStorage.removeItem('palmCaptures');
            this.showGallery(); // Refresh gallery to show empty state
        }
    }
    
    /**
     * Show camera settings modal
     */
    async showSettings() {
        // Ensure cameras are detected first
        if (this.availableCameras.length === 0) {
            await this.detectCameras();
        }
        
        // Ensure camera selectors exist if we have multiple cameras
        if (this.availableCameras.length > 1 && !document.getElementById('cameraSelector')) {
            this.addCameraSelector();
        }
        
        // Populate camera selectors
        const rgbSelect = document.getElementById('rgbCameraSelect');
        const irSelect = document.getElementById('irCameraSelect');
        
        // Clear existing options
        rgbSelect.innerHTML = '<option value="default">Default Camera</option>';
        irSelect.innerHTML = '<option value="default">Default Camera</option>';
        
        // Add available cameras
        this.availableCameras.forEach((camera, index) => {
            // Create a meaningful label for the camera
            let label = camera.label || `Camera ${index + 1}`;
            
            // Add device ID suffix if label is generic
            if (!camera.label || camera.label === '') {
                label = `Camera ${index + 1} (${camera.deviceId.substring(0, 8)}...)`;
            }
            
            // Check if this camera is likely an IR camera
            const lowerLabel = label.toLowerCase();
            const isLikelyIR = lowerLabel.includes('ir') || lowerLabel.includes('infrared') || 
                              lowerLabel.includes('depth') || lowerLabel.includes('windows hello');
            
            // RGB camera option
            const rgbOption = document.createElement('option');
            rgbOption.value = camera.deviceId;
            rgbOption.textContent = label;
            if (camera.deviceId === this.selectedCameraId) {
                rgbOption.selected = true;
            }
            rgbSelect.appendChild(rgbOption);
            
            // IR camera option
            const irOption = document.createElement('option');
            irOption.value = camera.deviceId;
            irOption.textContent = isLikelyIR ? `${label} (IR)` : label;
            if (camera.deviceId === this.selectedIRCameraId) {
                irOption.selected = true;
            }
            irSelect.appendChild(irOption);
        });
        
        // Add change listeners
        rgbSelect.onchange = (e) => {
            this.selectedCameraId = e.target.value === 'default' ? null : e.target.value;
            // If scanning, restart with new camera
            if (this.isScanning) {
                this.stopScanning();
                setTimeout(() => this.startScanning(), 100);
            }
        };
        
        irSelect.onchange = (e) => {
            this.selectedIRCameraId = e.target.value === 'default' ? null : e.target.value;
        };
        
        document.getElementById('settingsModal').style.display = 'flex';
    }
    
    /**
     * Hide camera settings modal
     */
    hideSettings() {
        document.getElementById('settingsModal').style.display = 'none';
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.animationFrame++;
        
        // Simple idle state - no animation when no hand detected
        if (!this.palmData && this.instancedDots) {
            // Dots stay in place - no movement
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    /**
     * Reset dot field to idle state
     */
    resetDotField() {
        if (!this.instancedDots) return;
        
        const matrix = new THREE.Matrix4();
        const scale = new THREE.Vector3(1, 1, 1);
        const color = new THREE.Color();
        const baseColor = this.irMode ? 0xff00ff : 0x00b366;
        
        this.dotPositions.forEach((dotPos, index) => {
            // Reset to original position - no animation
            matrix.setPosition(dotPos.x, dotPos.y, dotPos.z);
            matrix.scale(scale);
            this.instancedDots.setMatrixAt(index, matrix);
            
            // Reset color to base color
            color.setHex(baseColor);
            this.instancedDots.setColorAt(index, color);
        });
        
        this.instancedDots.instanceMatrix.needsUpdate = true;
        this.instancedDots.instanceColor.needsUpdate = true;
    }
}

// Initialize the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.dotProjector = new DotProjector();
    });
} else {
    // DOM is already loaded
    window.dotProjector = new DotProjector();
}