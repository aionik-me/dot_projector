class DotProjector {
    constructor() {
        this.canvas = document.getElementById('dotCanvas');
        this.handCanvas = document.getElementById('handCanvas');
        this.handCtx = this.handCanvas.getContext('2d');
        
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
        
        this.dots = [];
        this.dotPattern = [];
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
        
        // Capture properties
        this.captures = JSON.parse(localStorage.getItem('palmCaptures') || '[]');
        this.isAutoCapturing = false;
        this.perfectAlignmentTime = 0;
        this.autoCaptureDelay = 3000; // 3 seconds of perfect alignment
        
        this.init();
    }
    
    init() {
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Setup hand canvas
        this.handCanvas.width = this.canvas.clientWidth;
        this.handCanvas.height = this.canvas.clientHeight;
        
        this.camera.position.z = 50;
        
        const ambientLight = new THREE.AmbientLight(0x404040);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0x0088ff, 0.5);
        directionalLight.position.set(0, 1, 1);
        this.scene.add(directionalLight);
        
        this.createDotPattern();
        this.setupHandTracking();
        this.setupEventListeners();
        
        this.animate();
    }
    
    createDotPattern() {
        const dotGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const gridSize = 30;
        const spacing = 2.5;
        
        for (let x = -gridSize/2; x <= gridSize/2; x += spacing) {
            for (let y = -gridSize/2; y <= gridSize/2; y += spacing) {
                const intensity = Math.random() * 0.5 + 0.5;
                const dotMaterial = new THREE.MeshPhongMaterial({
                    color: new THREE.Color(0, intensity, intensity * 0.5),
                    emissive: new THREE.Color(0, intensity * 0.5, intensity * 0.3),
                    emissiveIntensity: 0.5
                });
                
                const dot = new THREE.Mesh(dotGeometry, dotMaterial);
                dot.position.set(x, y, 0);
                dot.basePosition = { x, y, z: 0 };
                dot.phase = Math.random() * Math.PI * 2;
                
                this.dots.push(dot);
                this.scene.add(dot);
            }
        }
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
        
        window.addEventListener('resize', () => {
            this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
            this.handCanvas.width = this.canvas.clientWidth;
            this.handCanvas.height = this.canvas.clientHeight;
        });
    }
    
    async startScanning() {
        if (this.isScanning) {
            this.stopScanning();
            return;
        }
        
        try {
            this.isScanning = true;
            document.getElementById('startBtn').textContent = 'Stop Scanning';
            document.getElementById('captureBtn').disabled = false;
            
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            this.videoElement.srcObject = stream;
            
            this.videoElement.onloadedmetadata = () => {
                this.videoElement.play();
                this.detectHand();
            };
            
            this.updateStatus('Scanning...', 'scanning');
        } catch (error) {
            console.error('Camera access error:', error);
            this.updateStatus('Camera access denied', 'error');
            this.stopScanning();
        }
    }
    
    stopScanning() {
        this.isScanning = false;
        document.getElementById('startBtn').textContent = 'Start Scanning';
        document.getElementById('captureBtn').disabled = true;
        
        if (this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(track => track.stop());
            this.videoElement.srcObject = null;
        }
        
        this.updateStatus('Ready to Scan', '');
    }
    
    async detectHand() {
        if (!this.isScanning) return;
        
        if (this.videoElement.readyState === 4) {
            await this.hands.send({ image: this.videoElement });
        }
        
        requestAnimationFrame(() => this.detectHand());
    }
    
    onHandResults(results) {
        // Clear hand canvas
        this.handCtx.clearRect(0, 0, this.handCanvas.width, this.handCanvas.height);
        
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            this.palmData = results.multiHandLandmarks[0];
            this.drawHandVisualization(this.palmData);
            this.updatePalmVisualization(this.palmData);
            this.updateMetrics(this.palmData);
        } else {
            this.palmData = null;
            this.updateStatus('Place your palm in view', 'warning');
            // Show guide overlay when no hand is detected
            document.getElementById('guidanceOverlay').style.opacity = '1';
        }
    }
    
    drawHandVisualization(landmarks) {
        const ctx = this.handCtx;
        const w = this.handCanvas.width;
        const h = this.handCanvas.height;
        
        // Hide guide overlay when hand is detected
        document.getElementById('guidanceOverlay').style.opacity = '0.2';
        
        // Clear and setup
        ctx.save();
        
        // Calculate palm metrics
        const avgZ = landmarks.reduce((sum, pt) => sum + pt.z, 0) / landmarks.length;
        const palmCenter = this.calculatePalmCenter(landmarks);
        
        // Draw filled palm shape with smooth curves
        ctx.beginPath();
        ctx.moveTo(landmarks[0].x * w, landmarks[0].y * h); // Wrist
        
        // Curve through thumb base
        ctx.quadraticCurveTo(
            landmarks[1].x * w, landmarks[1].y * h,
            landmarks[2].x * w, landmarks[2].y * h
        );
        
        // Curve to index finger base
        ctx.quadraticCurveTo(
            landmarks[3].x * w, landmarks[3].y * h,
            landmarks[5].x * w, landmarks[5].y * h
        );
        
        // Through finger bases
        ctx.lineTo(landmarks[9].x * w, landmarks[9].y * h);
        ctx.lineTo(landmarks[13].x * w, landmarks[13].y * h);
        ctx.lineTo(landmarks[17].x * w, landmarks[17].y * h);
        
        // Curve back to wrist
        ctx.quadraticCurveTo(
            landmarks[18].x * w, landmarks[18].y * h,
            landmarks[0].x * w, landmarks[0].y * h
        );
        
        ctx.closePath();
        
        // Create depth-based gradient fill
        const gradient = ctx.createRadialGradient(
            palmCenter.x * w, palmCenter.y * h, 0,
            palmCenter.x * w, palmCenter.y * h, w * 0.3
        );
        
        // Fix: z is negative when closer to camera, positive when further
        const depthColor = avgZ < -0.05 ? [255, 100, 100] : avgZ > 0.05 ? [100, 150, 255] : [100, 255, 150]; // Red if too close, blue if too far, green if good
        gradient.addColorStop(0, `rgba(${depthColor[0]}, ${depthColor[1]}, ${depthColor[2]}, 0.3)`);
        gradient.addColorStop(1, `rgba(${depthColor[0]}, ${depthColor[1]}, ${depthColor[2]}, 0.1)`);
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Draw palm outline
        ctx.strokeStyle = `rgba(${depthColor[0]}, ${depthColor[1]}, ${depthColor[2]}, 0.8)`;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw fingers as filled shapes with labels
        const fingerGroups = [
            { points: [1, 2, 3, 4], name: 'Thumb', color: [255, 160, 122] },
            { points: [5, 6, 7, 8], name: 'Index', color: [152, 216, 200] },
            { points: [9, 10, 11, 12], name: 'Middle', color: [135, 206, 235] },
            { points: [13, 14, 15, 16], name: 'Ring', color: [221, 160, 221] },
            { points: [17, 18, 19, 20], name: 'Pinky', color: [240, 230, 140] }
        ];
        
        ctx.globalAlpha = 0.4;
        fingerGroups.forEach((finger, idx) => {
            ctx.beginPath();
            
            // Draw finger shape
            const base1 = landmarks[finger.points[0]];
            const base2 = landmarks[idx === 0 ? 2 : finger.points[0]];
            const tip = landmarks[finger.points[3]];
            
            ctx.moveTo(base1.x * w, base1.y * h);
            
            // Draw finger sides
            finger.points.forEach(point => {
                ctx.lineTo(landmarks[point].x * w, landmarks[point].y * h);
            });
            
            // Close finger shape
            ctx.lineTo(base2.x * w, base2.y * h);
            ctx.closePath();
            
            // Fill with custom finger color
            const fingerGradient = ctx.createLinearGradient(
                base1.x * w, base1.y * h,
                tip.x * w, tip.y * h
            );
            fingerGradient.addColorStop(0, `rgba(${finger.color[0]}, ${finger.color[1]}, ${finger.color[2]}, 0.3)`);
            fingerGradient.addColorStop(1, `rgba(${finger.color[0]}, ${finger.color[1]}, ${finger.color[2]}, 0.1)`);
            
            ctx.fillStyle = fingerGradient;
            ctx.fill();
        });
        
        ctx.globalAlpha = 1;
        
        // Draw key feature points - all fingertips and important landmarks
        const keyPoints = [
            { idx: 0, label: 'W', color: '#ff6b6b' }, // Wrist
            { idx: 9, label: 'C', color: '#4ecdc4' }, // Center
            { idx: 4, label: 'T', color: '#ffa07a' }, // Thumb tip
            { idx: 8, label: 'I', color: '#98d8c8' }, // Index tip
            { idx: 12, label: 'M', color: '#87ceeb' }, // Middle tip
            { idx: 16, label: 'R', color: '#dda0dd' }, // Ring tip
            { idx: 20, label: 'P', color: '#f0e68c' }, // Pinky tip
        ];
        
        keyPoints.forEach(point => {
            const x = landmarks[point.idx].x * w;
            const y = landmarks[point.idx].y * h;
            
            // Draw point
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = point.color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw label
            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(point.label, x, y - 10);
        });
        
        // Draw feature extraction visualization
        this.drawFeatureExtraction(landmarks, ctx, w, h);
        
        // Draw edge proximity warnings
        this.drawEdgeWarnings(landmarks, ctx, w, h);
        
        ctx.restore();
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
        const margin = 0.1;
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
        
        this.dots.forEach((dot, index) => {
            // Calculate distance to palm center in 3D
            const distToPalm = Math.sqrt(
                Math.pow(dot.basePosition.x - palm3D.x, 2) + 
                Math.pow(dot.basePosition.y - palm3D.y, 2)
            );
            
            // Calculate influence based on hand landmarks
            let maxInfluence = 0;
            landmarks.forEach(landmark => {
                const landmarkX = (landmark.x - 0.5) * 60;
                const landmarkY = -(landmark.y - 0.5) * 60;
                const dist = Math.sqrt(
                    Math.pow(dot.basePosition.x - landmarkX, 2) + 
                    Math.pow(dot.basePosition.y - landmarkY, 2)
                );
                const influence = Math.max(0, 1 - dist / 15);
                maxInfluence = Math.max(maxInfluence, influence);
            });
            
            // Create ripple effect from palm
            const waveOffset = Math.sin(this.animationFrame * 0.02 + dot.phase - distToPalm * 0.1) * 3;
            
            // Z position based on proximity to hand
            dot.position.z = dot.basePosition.z + waveOffset * maxInfluence + palm3D.z * maxInfluence * 0.1;
            
            // Color based on distance and hand features
            const hue = (120 - distance * 2 + maxInfluence * 60) / 360;
            const saturation = alignment * (0.5 + maxInfluence * 0.5);
            const lightness = 0.3 + maxInfluence * 0.6;
            
            dot.material.color.setHSL(hue, saturation, lightness);
            dot.material.emissive.setHSL(hue, saturation, lightness * 0.7);
            dot.material.emissiveIntensity = maxInfluence;
            
            // Scale dots near hand features
            dot.scale.setScalar(1 + maxInfluence * 0.8);
            
            // Rotate dots for dynamic effect
            if (maxInfluence > 0) {
                dot.rotation.x += 0.02 * maxInfluence;
                dot.rotation.y += 0.02 * maxInfluence;
            }
        });
        
        // Check if hand is fully visible
        const margin = 0.1;
        let fullyVisible = true;
        landmarks.forEach(landmark => {
            if (landmark.x < margin || landmark.x > 1 - margin ||
                landmark.y < margin || landmark.y > 1 - margin) {
                fullyVisible = false;
            }
        });
        
        if (!fullyVisible) {
            this.updateStatus('Show entire hand in frame', 'error');
            this.perfectAlignmentTime = 0;
        } else if (distance >= 25 && distance <= 35 && alignment > 0.6) {
            this.updateStatus('Perfect! Hold steady', 'success');
            this.handlePerfectAlignment();
        } else if (distance < 25) {
            this.updateStatus('Move hand further away', 'warning');
            this.perfectAlignmentTime = 0;
        } else if (distance > 35) {
            this.updateStatus('Move hand closer', 'warning');
            this.perfectAlignmentTime = 0;
        } else if (alignment < 0.6) {
            this.updateStatus('Spread fingers naturally', 'warning');
            this.perfectAlignmentTime = 0;
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
        // z is negative when hand is close, positive when far
        return Math.round(30 + palmCenter.z * 200);
    }
    
    calculateAlignment(landmarks) {
        // Check if all landmarks are within frame bounds
        const margin = 0.1; // 10% margin from edges
        let allVisible = true;
        let avgConfidence = 0;
        
        landmarks.forEach(landmark => {
            if (landmark.x < margin || landmark.x > 1 - margin ||
                landmark.y < margin || landmark.y > 1 - margin) {
                allVisible = false;
            }
            // Approximate confidence based on position (edges are less confident)
            const edgeDistance = Math.min(
                landmark.x, 1 - landmark.x,
                landmark.y, 1 - landmark.y
            );
            avgConfidence += Math.min(1, edgeDistance * 10);
        });
        avgConfidence /= landmarks.length;
        
        // Calculate palm area to ensure hand is spread naturally
        const palmArea = this.calculatePalmArea(landmarks);
        const expectedArea = 0.15; // Expected palm area as fraction of frame
        const areaScore = Math.min(1, palmArea / expectedArea);
        
        // Calculate palm normal using multiple points
        const palmNormal = this.calculatePalmNormal(landmarks);
        const orientationScore = Math.max(0, palmNormal.z);
        
        // Check finger spread (natural hand position)
        const fingerSpread = this.calculateFingerSpread(landmarks);
        const spreadScore = Math.min(1, fingerSpread / 0.3); // Expected spread
        
        // Combine all factors
        const alignment = allVisible ? 
            (orientationScore * 0.4 + areaScore * 0.3 + avgConfidence * 0.2 + spreadScore * 0.1) : 
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
        if (!this.isAutoCapturing) {
            this.perfectAlignmentTime = Date.now();
            this.isAutoCapturing = true;
        }
        
        const elapsed = Date.now() - this.perfectAlignmentTime;
        const countdown = Math.ceil((this.autoCaptureDelay - elapsed) / 1000);
        
        if (countdown > 0) {
            this.showCountdown(countdown);
        }
        
        if (elapsed >= this.autoCaptureDelay) {
            this.capture();
            this.isAutoCapturing = false;
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
        
        // Draw video frame
        this.captureCtx.drawImage(this.videoElement, 0, 0);
        
        // Draw palm overlay
        this.drawPalmOverlay(this.captureCtx, this.palmData);
        
        // Convert to blob and save
        this.captureCanvas.toBlob((blob) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const captureData = {
                    id: Date.now(),
                    image: reader.result,
                    timestamp: new Date().toISOString(),
                    metrics: {
                        distance: this.calculateDistance(this.calculatePalmCenter(this.palmData)),
                        alignment: Math.round(this.calculateAlignment(this.palmData) * 100)
                    }
                };
                
                this.captures.unshift(captureData);
                if (this.captures.length > 20) this.captures.pop(); // Keep max 20 captures
                
                localStorage.setItem('palmCaptures', JSON.stringify(this.captures));
                this.showCaptureFlash();
                this.updateStatus('Captured successfully!', 'success');
                
                setTimeout(() => {
                    this.updateStatus('Scanning...', 'scanning');
                }, 2000);
            };
            reader.readAsDataURL(blob);
        });
        
        this.isAutoCapturing = false;
        this.perfectAlignmentTime = 0;
    }
    
    drawPalmOverlay(ctx, landmarks) {
        const w = this.captureCanvas.width;
        const h = this.captureCanvas.height;
        
        // Draw semi-transparent overlay
        ctx.save();
        ctx.globalAlpha = 0.3;
        
        // Draw palm outline
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ff88';
        
        ctx.beginPath();
        ctx.moveTo(landmarks[0].x * w, landmarks[0].y * h);
        landmarks.forEach((landmark, idx) => {
            if ([0, 5, 9, 13, 17].includes(idx)) {
                ctx.lineTo(landmark.x * w, landmark.y * h);
            }
        });
        ctx.closePath();
        ctx.stroke();
        
        // Draw key points
        ctx.fillStyle = '#00ff88';
        landmarks.forEach((landmark, idx) => {
            if ([0, 4, 8, 12, 16, 20].includes(idx)) {
                ctx.beginPath();
                ctx.arc(landmark.x * w, landmark.y * h, 5, 0, 2 * Math.PI);
                ctx.fill();
            }
        });
        
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
                
                const date = new Date(capture.timestamp);
                const timeStr = date.toLocaleString();
                
                item.innerHTML = `
                    <img src="${capture.image}" alt="Palm capture">
                    <div class="capture-info">
                        <div class="capture-time">${timeStr}</div>
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
        
        this.dots.forEach((dot, index) => {
            if (!this.palmData) {
                const time = this.animationFrame * 0.01;
                dot.position.z = Math.sin(time + dot.phase) * 2;
                dot.rotation.x += 0.01;
                dot.rotation.y += 0.01;
            }
        });
        
        this.renderer.render(this.scene, this.camera);
    }
}

const dotProjector = new DotProjector();