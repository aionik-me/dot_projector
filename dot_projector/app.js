class DotProjector {
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
        this.animationFrame = 0;
        
        this.hands = null;
        this.videoElement = document.getElementById('inputVideo');
        this.captureCanvas = document.getElementById('captureCanvas');
        this.captureCtx = this.captureCanvas.getContext('2d');
        
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
    
    createDotPattern() {
        const dotGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const dotMaterial = new THREE.MeshPhongMaterial({
            color: new THREE.Color(0, 0.7, 0.35),
            emissive: new THREE.Color(0, 0.35, 0.2),
            emissiveIntensity: 0.5
        });
        
        const gridSize = 30;
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
                
                // Store position and phase for animation
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
                varying vec3 vColor;
                void main() {
                    vColor = vec3(0.0, 1.0, 0.5);
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                void main() {
                    vec2 xy = gl_PointCoord.xy - vec2(0.5);
                    float r = dot(xy, xy);
                    if (r > 0.25) discard;
                    
                    float intensity = 1.0 - r * 4.0;
                    gl_FragColor = vec4(vColor * intensity, intensity);
                }
            `,
            transparent: true,
            depthTest: false
        });
        
        this.handPoints = new THREE.Points(pointGeometry, pointMaterial);
        this.handPoints.visible = false;
        this.scene.add(this.handPoints);
    }
    
    setupHandTracking() {
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
        document.getElementById('irModeBtn').addEventListener('click', () => this.toggleIRMode());
        
        window.addEventListener('resize', () => {
            this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        });
    }
    
    async detectCameras() {
        try {
            // Request initial permissions to get camera labels
            await navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
                stream.getTracks().forEach(track => track.stop());
            });
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableCameras = devices.filter(device => device.kind === 'videoinput');
            
            // Check for IR camera (common labels)
            this.hasIRCamera = this.availableCameras.some(camera => {
                const label = camera.label.toLowerCase();
                return label.includes('ir') || label.includes('infrared') || 
                       label.includes('depth') || label.includes('windows hello');
            });
            
            // If multiple cameras, add camera selector
            if (this.availableCameras.length > 1) {
                this.addCameraSelector();
            }
            
            // Show IR mode button if IR camera detected
            if (this.hasIRCamera) {
                document.getElementById('irModeBtn').style.display = 'inline-block';
            }
            
            return this.availableCameras;
        } catch (error) {
            console.error('Error detecting cameras:', error);
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
            const label = camera.label.toLowerCase();
            if (label.includes('ir') || label.includes('infrared') || 
                label.includes('depth') || label.includes('windows hello')) {
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
        
        // Set defaults
        this.selectedCameraId = this.availableCameras[0].deviceId;
        if (!this.selectedIRCameraId) {
            this.selectedIRCameraId = this.availableCameras[0].deviceId;
        }
        
        // Set selector values
        selector.value = this.selectedCameraId;
        irSelector.value = this.selectedIRCameraId;
    }
    
    async startScanning() {
        if (this.isScanning) {
            this.stopScanning();
            return;
        }
        
        // Detect cameras on first scan
        if (this.availableCameras.length === 0) {
            await this.detectCameras();
        }
        
        try {
            this.isScanning = true;
            document.getElementById('startBtn').textContent = 'Stop Scanning';
            document.getElementById('startBtn').classList.remove('primary');
            document.getElementById('startBtn').classList.add('secondary');
            document.getElementById('captureBtn').disabled = false;
            
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            
            // Use appropriate camera based on mode
            if (this.irMode && this.selectedIRCameraId) {
                constraints.video.deviceId = { exact: this.selectedIRCameraId };
            } else if (!this.irMode && this.selectedCameraId) {
                constraints.video.deviceId = { exact: this.selectedCameraId };
            }
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = stream;
            
            this.videoElement.onloadedmetadata = () => {
                this.videoElement.play();
                this.detectHand();
            };
            
            this.updateStatus('Scanning...', 'scanning');
            document.getElementById('guidanceOverlay').style.opacity = '0.3';
        } catch (error) {
            console.error('Camera access error:', error);
            this.updateStatus('Camera access denied', 'error');
            this.stopScanning();
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
        if (!this.isScanning) return;
        
        if (this.videoElement.readyState === 4) {
            await this.hands.send({ image: this.videoElement });
        }
        
        requestAnimationFrame(() => this.detectHand());
    }
    
    onHandResults(results) {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            this.palmData = results.multiHandLandmarks[0];
            this.updateHandVisualization(this.palmData);
            this.updatePalmVisualization(this.palmData);
            this.updateMetrics(this.palmData);
            
            // Hide guide overlay when hand is detected
            document.getElementById('guidanceOverlay').style.opacity = '0.2';
        } else {
            this.palmData = null;
            this.updateStatus('Place your palm in view', 'warning');
            // Show guide overlay when no hand is detected
            document.getElementById('guidanceOverlay').style.opacity = '1';
            
            // Hide hand visualization
            this.handLines.visible = false;
            this.handPoints.visible = false;
        }
    }
    
    updateHandVisualization(landmarks) {
        // Convert landmarks to 3D coordinates
        const scale = 60; // Match the dot grid scale
        
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
            
            // Size based on importance
            if ([4, 8, 12, 16, 20].includes(idx)) {
                pointSizes[idx] = 8; // Fingertips
            } else if (idx === 0) {
                pointSizes[idx] = 10; // Wrist
            } else {
                pointSizes[idx] = 5; // Other points
            }
        });
        
        this.handPoints.geometry.attributes.position.needsUpdate = true;
        this.handPoints.geometry.attributes.size.needsUpdate = true;
        this.handPoints.visible = true;
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
            
            // Calculate influence based on hand landmarks
            let maxInfluence = 0;
            landmarks.forEach(landmark => {
                const landmarkX = (landmark.x - 0.5) * 60;
                const landmarkY = -(landmark.y - 0.5) * 60;
                const dist = Math.sqrt(
                    Math.pow(dotPos.x - landmarkX, 2) + 
                    Math.pow(dotPos.y - landmarkY, 2)
                );
                const influence = Math.max(0, 1 - dist / 15);
                maxInfluence = Math.max(maxInfluence, influence);
            });
            
            // Create ripple effect from palm
            const waveOffset = Math.sin(this.animationFrame * 0.02 + this.dotPhases[index] - distToPalm * 0.1) * 3;
            
            // Z position based on proximity to hand
            const zPos = dotPos.z + waveOffset * maxInfluence + palm3D.z * maxInfluence * 0.1;
            
            // Set scale based on influence
            const scaleValue = 1 + maxInfluence * 0.8;
            scale.set(scaleValue, scaleValue, scaleValue);
            
            // Set rotation for dynamic effect
            if (maxInfluence > 0) {
                rotation.x = this.animationFrame * 0.02 * maxInfluence;
                rotation.y = this.animationFrame * 0.02 * maxInfluence;
            } else {
                rotation.set(0, 0, 0);
            }
            
            // Compose matrix
            matrix.compose(
                new THREE.Vector3(dotPos.x, dotPos.y, zPos),
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
        } else if (distance < 15) {
            this.updateStatus('Move hand further away', 'warning');
            this.perfectAlignmentTime = 0;
            this.isAutoCapturing = false;
        } else if (distance > 35) {
            this.updateStatus('Move hand closer', 'warning');
            this.perfectAlignmentTime = 0;
            this.isAutoCapturing = false;
        } else if (alignment < 0.4) { // Much more lenient
            this.updateStatus('Center your palm', 'warning');
            this.perfectAlignmentTime = 0;
            this.isAutoCapturing = false;
        } else if (distance >= 15 && distance <= 35 && alignment >= 0.4 && fingersExtended) {
            this.updateStatus('Perfect! Hold steady', 'success');
            this.handlePerfectAlignment();
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
    
    calculateDistance(palmCenter) {
        // Convert z-coordinate to distance in cm
        // z is typically between -0.15 (close) and 0.15 (far)
        // Let's use a more realistic conversion
        const normalizedZ = Math.max(-0.2, Math.min(0.2, palmCenter.z));
        return Math.round(25 + normalizedZ * 100);
    }
    
    calculateAlignment(landmarks) {
        // Check if all landmarks are within frame bounds
        const margin = 0.05; // 5% margin from edges - more lenient
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
        const minArea = 0.03; // Much more lenient minimum
        const maxArea = 0.3; // Allow larger hands
        const areaScore = palmArea < minArea ? palmArea / minArea : 
                         palmArea > maxArea ? 0.7 : 1;
        
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
        // Check if fingers are properly extended (not curled)
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
            
            // Finger is extended if alignment is good
            if (alignment > 0.7) {
                extendedCount++;
            }
        });
        
        // Require at least 3 fingers to be extended
        return extendedCount >= 3;
    }
    
    calculatePalmNormal(landmarks) {
        const wrist = landmarks[0];
        const index = landmarks[5];
        const pinky = landmarks[17];
        
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
        
        const normal = {
            x: v1.y * v2.z - v1.z * v2.y,
            y: v1.z * v2.x - v1.x * v2.z,
            z: v1.x * v2.y - v1.y * v2.x
        };
        
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
    
    capture() {
        if (!this.palmData || !this.videoElement.srcObject) {
            this.updateStatus('No palm detected', 'error');
            return;
        }
        
        // Setup capture canvas
        this.captureCanvas.width = this.videoElement.videoWidth;
        this.captureCanvas.height = this.videoElement.videoHeight;
        
        if (this.irMode) {
            // Capture both regular and IR images when IR mode is on
            this.captureDualMode();
        } else {
            // Single regular capture
            this.createRegularCapture(this.captureCtx, this.captureCanvas.width, this.captureCanvas.height);
            
            // Convert to blob and save
            this.captureCanvas.toBlob((blob) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const captureData = {
                        id: Date.now(),
                        image: reader.result,
                        type: 'regular',
                        timestamp: new Date().toISOString(),
                        metrics: {
                            distance: this.calculateDistance(this.calculatePalmCenter(this.palmData)),
                            alignment: Math.round(this.calculateAlignment(this.palmData) * 100)
                        }
                    };
                    
                    this.captures.unshift(captureData);
                    if (this.captures.length > 20) this.captures.pop();
                    
                    localStorage.setItem('palmCaptures', JSON.stringify(this.captures));
                    this.showCaptureFlash();
                    this.updateStatus('Captured successfully!', 'success');
                    
                    setTimeout(() => {
                        this.updateStatus('Scanning...', 'scanning');
                    }, 2000);
                };
                reader.readAsDataURL(blob);
            });
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
        irSelector.style.display = this.irMode ? 'flex' : 'none';
        
        if (this.irMode) {
            // Change to IR visualization colors
            this.handLines.material.color.setHex(0xff00ff); // Purple for IR
            this.handPoints.material.uniforms.color.value.setHex(0xff00ff);
            this.instancedDots.material.color.setHex(0x8800ff);
            this.instancedDots.material.emissive.setHex(0x440088);
            
            // Apply filter only to the canvas, not the container
            this.renderer.domElement.style.filter = 'hue-rotate(270deg) saturate(1.5)';
            
            // Switch to IR camera if scanning
            if (this.isScanning) {
                this.stopScanning();
                setTimeout(() => this.startScanning(), 500);
            }
        } else {
            // Reset to normal colors
            this.handLines.material.color.setHex(0x00ff88);
            this.handPoints.material.uniforms.color.value.setHex(0x00ff88);
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
    
    captureDualMode() {
        const w = this.captureCanvas.width;
        const h = this.captureCanvas.height;
        const timestamp = new Date().toISOString();
        const id = Date.now();
        const metrics = {
            distance: this.calculateDistance(this.calculatePalmCenter(this.palmData)),
            alignment: Math.round(this.calculateAlignment(this.palmData) * 100)
        };
        
        // First capture regular image
        this.createRegularCapture(this.captureCtx, w, h);
        this.captureCanvas.toBlob((regularBlob) => {
            const regularReader = new FileReader();
            regularReader.onloadend = () => {
                const regularCapture = {
                    id: id,
                    image: regularReader.result,
                    type: 'regular',
                    timestamp: timestamp,
                    metrics: metrics
                };
                
                // Then capture IR image
                this.createIRVeinCapture(this.captureCtx, w, h);
                this.captureCanvas.toBlob((irBlob) => {
                    const irReader = new FileReader();
                    irReader.onloadend = () => {
                        const irCapture = {
                            id: id + 1,
                            image: irReader.result,
                            type: 'ir',
                            timestamp: timestamp,
                            metrics: metrics,
                            pairedWith: id
                        };
                        
                        // Save both captures
                        this.captures.unshift(irCapture);
                        this.captures.unshift(regularCapture);
                        if (this.captures.length > 20) {
                            this.captures.splice(20);
                        }
                        
                        localStorage.setItem('palmCaptures', JSON.stringify(this.captures));
                        this.showCaptureFlash();
                        this.updateStatus('Captured both regular and IR!', 'success');
                        
                        setTimeout(() => {
                            this.updateStatus('Scanning...', 'scanning');
                        }, 2000);
                    };
                    irReader.readAsDataURL(irBlob);
                });
            };
            regularReader.readAsDataURL(regularBlob);
        });
    }
    
    createRegularCapture(ctx, w, h) {
        // Get palm bounds with padding for zoom
        const palmBounds = this.getPalmBounds(this.palmData, w, h, 80);
        
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
        this.drawBiometricOverlay(ctx, this.palmData, w, h);
        ctx.restore();
        
        // Add scan effects
        this.addScanEffects(ctx, w, h, false);
    }
    
    createIRVeinCapture(ctx, w, h) {
        // Get palm bounds with padding for zoom
        const palmBounds = this.getPalmBounds(this.palmData, w, h, 80);
        
        // Calculate zoom factor
        const zoomFactorX = w / palmBounds.width;
        const zoomFactorY = h / palmBounds.height;
        const zoomFactor = Math.min(zoomFactorX, zoomFactorY) * 0.8;
        
        // Calculate translation to center the palm
        const translateX = (w - palmBounds.width * zoomFactor) / 2 - palmBounds.left * zoomFactor;
        const translateY = (h - palmBounds.height * zoomFactor) / 2 - palmBounds.top * zoomFactor;
        
        // Dark background for IR
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);
        
        // Draw video in IR style (darkened)
        ctx.save();
        ctx.translate(translateX, translateY);
        ctx.scale(zoomFactor, zoomFactor);
        
        // Apply IR filter to video
        ctx.filter = 'brightness(0.3) contrast(1.5)';
        ctx.drawImage(this.videoElement, 0, 0, w, h);
        ctx.filter = 'none';
        
        // Draw simulated vein patterns
        this.drawVeinPattern(ctx, this.palmData, w, h);
        
        // Draw IR biometric overlay
        this.drawIRBiometricOverlay(ctx, this.palmData, w, h);
        
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
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.shadowBlur = 10;
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
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.animationFrame++;
        
        // Animate dots when no palm is detected
        if (!this.palmData && this.instancedDots) {
            const matrix = new THREE.Matrix4();
            const rotation = new THREE.Euler();
            const scale = new THREE.Vector3(1, 1, 1);
            const time = this.animationFrame * 0.01;
            
            this.dotPositions.forEach((dotPos, index) => {
                const zPos = Math.sin(time + this.dotPhases[index]) * 2;
                rotation.x = time;
                rotation.y = time;
                
                matrix.compose(
                    new THREE.Vector3(dotPos.x, dotPos.y, zPos),
                    new THREE.Quaternion().setFromEuler(rotation),
                    scale
                );
                this.instancedDots.setMatrixAt(index, matrix);
            });
            
            this.instancedDots.instanceMatrix.needsUpdate = true;
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

const dotProjector = new DotProjector();