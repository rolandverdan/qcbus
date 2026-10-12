// ==================================================
// AI PASSENGER SCANNER (High FPS Mobile Optimization)
// ==================================================
let aiStream = null;
let aiRunning = false;
let tfModel = null; 
let isModelLoading = false;
let currentCameraIndex = 0;
let availableCameras = [];

// ==================================================
// LINE ORIENTATION & ANGLE CONFIGURATION
// ==================================================
let scannerConfig = {
    angle: parseInt(localStorage.getItem('qc_scanner_line_angle') || '90', 10), // 0 to 180 degrees
    offset: parseInt(localStorage.getItem('qc_scanner_line_offset') || '0', 10), // -50 to 50%
    inverted: localStorage.getItem('qc_scanner_inverted') === 'true'
};

function getLineGeometry(width, height) {
    const rad = (scannerConfig.angle * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    
    // Normal direction vector pointing in "IN" direction
    // angle = 90 (vertical): points right (+1, 0)
    // angle = 0 (horizontal): points down (0, +1)
    const inDirX = Math.sin(rad);
    const inDirY = Math.cos(rad);
    
    // Line segment direction vector (perpendicular to normal)
    const lineDirX = Math.cos(rad);
    const lineDirY = -Math.sin(rad);
    
    // Center point shifted by user offset percentage along normal
    const offsetPx = (scannerConfig.offset / 100) * Math.min(width, height);
    const x0 = cx + offsetPx * inDirX;
    const y0 = cy + offsetPx * inDirY;
    
    // Line endpoints across canvas
    const L = Math.hypot(width, height) + 120;
    const x1 = x0 - L * lineDirX;
    const y1 = y0 - L * lineDirY;
    const x2 = x0 + L * lineDirX;
    const y2 = y0 + L * lineDirY;
    
    return { x0, y0, inDirX, inDirY, lineDirX, lineDirY, x1, y1, x2, y2 };
}

function getLineSignedDistance(px, py, geom) {
    let d = (px - geom.x0) * geom.inDirX + (py - geom.y0) * geom.inDirY;
    return scannerConfig.inverted ? -d : d;
}

function updateScannerControlsUI() {
    const angleSlider = document.getElementById('lineAngleSlider');
    const offsetSlider = document.getElementById('lineOffsetSlider');
    const angleLabel = document.getElementById('lineAngleLabel');
    const offsetLabel = document.getElementById('lineOffsetLabel');
    const dirLabel = document.getElementById('directionLabel');
    const btnVert = document.getElementById('btnLineVert');
    const btnHoriz = document.getElementById('btnLineHoriz');

    if (angleSlider) angleSlider.value = scannerConfig.angle;
    if (offsetSlider) offsetSlider.value = scannerConfig.offset;

    if (angleLabel) {
        let text = `${scannerConfig.angle}°`;
        if (scannerConfig.angle === 90) text += ' (Vertical)';
        else if (scannerConfig.angle === 0 || scannerConfig.angle === 180) text += ' (Horizontal)';
        angleLabel.textContent = text;
    }

    if (offsetLabel) {
        offsetLabel.textContent = scannerConfig.offset === 0 
            ? 'Center' 
            : `${scannerConfig.offset > 0 ? '+' : ''}${scannerConfig.offset}%`;
    }

    if (dirLabel) {
        dirLabel.textContent = scannerConfig.inverted ? 'Inverted' : 'Normal';
    }

    if (btnVert && btnHoriz) {
        if (scannerConfig.angle === 90) {
            btnVert.className = 'px-2.5 py-1 rounded-lg transition bg-qc-blue-accent text-white shadow-sm';
            btnHoriz.className = 'px-2.5 py-1 rounded-lg transition text-gray-600 hover:text-gray-900';
        } else if (scannerConfig.angle === 0 || scannerConfig.angle === 180) {
            btnHoriz.className = 'px-2.5 py-1 rounded-lg transition bg-qc-blue-accent text-white shadow-sm';
            btnVert.className = 'px-2.5 py-1 rounded-lg transition text-gray-600 hover:text-gray-900';
        } else {
            btnVert.className = 'px-2.5 py-1 rounded-lg transition text-gray-600 hover:text-gray-900';
            btnHoriz.className = 'px-2.5 py-1 rounded-lg transition text-gray-600 hover:text-gray-900';
        }
    }
}

window.initScannerControlsUI = updateScannerControlsUI;

window.setScannerLineOrientation = function(orientation) {
    if (orientation === 'vertical') {
        window.onScannerAngleChange(90);
    } else if (orientation === 'horizontal') {
        window.onScannerAngleChange(0);
    }
};

window.onScannerAngleChange = function(val) {
    scannerConfig.angle = parseInt(val, 10);
    localStorage.setItem('qc_scanner_line_angle', scannerConfig.angle);
    updateScannerControlsUI();
};

window.onScannerOffsetChange = function(val) {
    scannerConfig.offset = parseInt(val, 10);
    localStorage.setItem('qc_scanner_line_offset', scannerConfig.offset);
    updateScannerControlsUI();
};

window.toggleScannerDirection = function() {
    scannerConfig.inverted = !scannerConfig.inverted;
    localStorage.setItem('qc_scanner_inverted', scannerConfig.inverted);
    updateScannerControlsUI();
};

// Pre-configure TensorFlow WebGL backend for maximum mobile performance & zero stutter
async function configureTf() {
    if (window.tf) {
        try {
            await tf.setBackend('webgl');
            tf.env().set('WEBGL_PACK', true);
            tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0); // Immediately delete textures to prevent GC stutter
            tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
            tf.env().set('WEBGL_VERSION', 2);
        } catch (e) {
            console.warn("TF WebGL optimization note:", e);
        }
    }
    if (window.cocoSsd && !tfModel) {
        try {
            tfModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
            console.log("AI Model (lite_mobilenet_v2) pre-loaded successfully");
        } catch (err) {
            console.error("AI Pre-load failed:", err);
        }
    }
}

// Start configuration immediately
configureTf();

async function startAICamera(preferredDeviceId = null) {
    if (isModelLoading) return;
    
    const video = document.getElementById('aiVideo');
    const canvas = document.getElementById('aiCanvas');
    const overlay = document.getElementById('scannerOverlay');
    const statusBadge = document.getElementById('aiStatus');
    const switchBtn = document.getElementById('switchCamBtn');
    
    if (!video || !canvas) return;

    isModelLoading = true;
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
    video.classList.remove('hidden');
    video.style.display = 'block';
    canvas.classList.remove('hidden');
    canvas.style.display = 'block';
    
    if (statusBadge) {
        statusBadge.textContent = tfModel ? "Starting Camera..." : "Loading AI Scanner...";
        statusBadge.className = "bg-yellow-500 text-white px-5 py-2 rounded-full text-xs font-bold shadow-lg";
    }

    // Enumerate connected cameras
    try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        availableCameras = allDevices.filter(d => d.kind === 'videoinput');
        if (switchBtn) {
            if (availableCameras.length > 1) {
                switchBtn.classList.remove('hidden');
            } else {
                switchBtn.classList.add('hidden');
            }
        }
    } catch (e) {
        console.warn("Could not enumerate devices:", e);
    }

    // Resilient camera constraints: works on PC webcams, laptops, tablets, and phones!
    const constraintOptions = [];
    if (preferredDeviceId) {
        constraintOptions.push({
            video: {
                deviceId: { exact: preferredDeviceId },
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });
        constraintOptions.push({
            video: { deviceId: { exact: preferredDeviceId } }
        });
    } else {
        // 1. Mobile back camera (ideal 480p @ 30fps)
        constraintOptions.push({
            video: { 
                facingMode: { ideal: "environment" },
                width: { ideal: 480, max: 640 },
                height: { ideal: 480, max: 640 },
                frameRate: { ideal: 30, max: 30 }
            } 
        });
        // 2. Mobile back camera generic
        constraintOptions.push({
            video: { facingMode: { ideal: "environment" } }
        });
        // 3. Current enumerated device if available (e.g. PC webcam)
        if (availableCameras.length > 0 && availableCameras[currentCameraIndex]) {
            constraintOptions.push({
                video: {
                    deviceId: { ideal: availableCameras[currentCameraIndex].deviceId },
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
        }
        // 4. PC webcam / standard camera
        constraintOptions.push({
            video: { width: { ideal: 640 }, height: { ideal: 480 } }
        });
        // 5. Universal fallback
        constraintOptions.push({ video: true });
    }

    let stream = null;
    for (const c of constraintOptions) {
        try {
            stream = await navigator.mediaDevices.getUserMedia(c);
            if (stream) break;
        } catch (e) {
            // Try next constraint
        }
    }

    if (!stream) {
        if (statusBadge) {
            statusBadge.textContent = "Camera Error";
            statusBadge.className = "bg-red-500 text-white px-5 py-2 rounded-full text-xs font-bold";
        }
        isModelLoading = false;
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.style.display = 'flex';
        }
        video.classList.add('hidden');
        video.style.display = 'none';
        canvas.classList.add('hidden');
        canvas.style.display = 'none';
        return;
    }

    aiStream = stream;

    // Critical for autoplay & rendering across mobile and PC browsers
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.srcObject = aiStream;

    // Wait until video has loaded metadata and dimensions are ready
    await new Promise((resolve) => {
        if (video.readyState >= 2 && video.videoWidth > 0) {
            resolve();
        } else {
            let done = false;
            const onReady = () => {
                if (!done) {
                    done = true;
                    video.removeEventListener('loadeddata', onReady);
                    video.removeEventListener('loadedmetadata', onReady);
                    resolve();
                }
            };
            video.addEventListener('loadeddata', onReady);
            video.addEventListener('loadedmetadata', onReady);
            setTimeout(onReady, 800);
        }
    });

    try {
        await video.play();
    } catch (err) {
        console.warn("video.play() warning:", err);
    }

    // Performance enhancement: clamp canvas resolution to max 640px to eliminate lag
    const maxDim = 640;
    const vWidth = video.videoWidth || 640;
    const vHeight = video.videoHeight || 480;
    const scale = Math.min(1, maxDim / Math.max(vWidth, vHeight));
    canvas.width = Math.round(vWidth * scale);
    canvas.height = Math.round(vHeight * scale);
    
    if (!tfModel) {
        await configureTf();
        if (!tfModel && window.cocoSsd) {
            tfModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        }
    }
    
    if (statusBadge) {
        statusBadge.textContent = "Scanner Active";
        statusBadge.className = "bg-emerald-500 text-white px-5 py-2 rounded-full text-xs font-bold shadow-lg";
    }
    isModelLoading = false;
    aiRunning = true;
    
    const ctx = canvas.getContext('2d');
    runDetection(video, tfModel, ctx, canvas);

    // Auto-detect completely black frame (e.g. inactive or covered default webcam on PC)
    setTimeout(() => {
        if (aiRunning && video.readyState >= 2 && availableCameras.length > 1) {
            try {
                const testCanvas = document.createElement('canvas');
                testCanvas.width = 16;
                testCanvas.height = 16;
                const testCtx = testCanvas.getContext('2d', { willReadFrequently: true });
                testCtx.drawImage(video, 0, 0, 16, 16);
                const data = testCtx.getImageData(0, 0, 16, 16).data;
                let brightness = 0;
                for (let i = 0; i < data.length; i += 4) {
                    brightness += data[i] + data[i+1] + data[i+2];
                }
                if (brightness === 0) {
                    console.warn("Camera frame is 100% black; auto-switching to next camera...");
                    switchAICamera();
                }
            } catch (e) {}
        }
    }, 1200);
}

let renderAnimFrame = null;

function runDetection(video, model, ctx, canvas) {
    let trackedEntities = {};
    let entityIdCounter = 0;
    let isDetecting = false;
    let flashEffect = null;

    // 1. Offscreen 256x256 canvas: power-of-2 hardware scaling eliminates GPU texture overhead
    const AI_SIZE = 256;
    const offscreen = document.createElement('canvas');
    offscreen.width = AI_SIZE;
    offscreen.height = AI_SIZE;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    offCtx.imageSmoothingEnabled = false;

    // 2. Smooth 60 FPS Render Loop: renders live video, red line at user angle, and tracking overlays smoothly
    function renderLoop() {
        if (!aiRunning) return;

        // Directly paint video to canvas (fixes black video in Chrome on PC)
        if (video.readyState >= 2) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        const geom = getLineGeometry(canvas.width, canvas.height);

        // Draw detection line at adjusted angle and offset
        ctx.beginPath();
        ctx.moveTo(geom.x1, geom.y1);
        ctx.lineTo(geom.x2, geom.y2);
        ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
        ctx.lineWidth = 4;
        ctx.stroke();

        // Direction indicator badges (IN and OUT pills)
        const tagDist = 28;
        const inDirX = scannerConfig.inverted ? -geom.inDirX : geom.inDirX;
        const inDirY = scannerConfig.inverted ? -geom.inDirY : geom.inDirY;
        const inTagX = geom.x0 + inDirX * tagDist;
        const inTagY = geom.y0 + inDirY * tagDist;
        const outTagX = geom.x0 - inDirX * tagDist;
        const outTagY = geom.y0 - inDirY * tagDist;

        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Green IN indicator pill
        ctx.fillStyle = "rgba(16, 185, 129, 0.9)";
        ctx.beginPath();
        ctx.arc(inTagX, inTagY, 12, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText("IN", inTagX, inTagY);

        // Red OUT indicator pill
        ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
        ctx.beginPath();
        ctx.arc(outTagX, outTagY, 12, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText("OUT", outTagX, outTagY);

        const now = Date.now();

        // Draw active tracked person boxes
        for (const [id, entity] of Object.entries(trackedEntities)) {
            if (entity.box && now - entity.lastSeen < 600) {
                ctx.strokeStyle = entity.counted ? "#10b981" : "#38bdf8";
                ctx.lineWidth = 3;
                ctx.strokeRect(entity.box.x, entity.box.y, entity.box.w, entity.box.h);

                // Center tracker dot
                ctx.fillStyle = entity.counted ? "#10b981" : "#38bdf8";
                ctx.beginPath();
                ctx.arc(entity.x, entity.y, 6, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        // Draw flash feedback if triggered
        if (flashEffect && flashEffect.alpha > 0) {
            ctx.fillStyle = flashEffect.color.replace('ALPHA', String(flashEffect.alpha));
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            flashEffect.alpha -= 0.05;
        }

        renderAnimFrame = requestAnimationFrame(renderLoop);
    }
    renderLoop();

    function triggerFlash(isIn) {
        flashEffect = {
            color: isIn ? 'rgba(16, 185, 129, ALPHA)' : 'rgba(239, 68, 68, ALPHA)',
            alpha: 0.35,
        };
    }

    // 3. Cooperative AI Detection Loop: yields smoothly to preserve 60 FPS video render
    async function detectLoop() {
        while (aiRunning && aiStream) {
            if (!isDetecting && video.readyState >= 2) {
                isDetecting = true;
                try {
                    offCtx.drawImage(video, 0, 0, AI_SIZE, AI_SIZE);
                    const predictions = await model.detect(offscreen, 3, 0.38);

                    const scaleX = canvas.width / AI_SIZE;
                    const scaleY = canvas.height / AI_SIZE;
                    const geom = getLineGeometry(canvas.width, canvas.height);
                    const now = Date.now();

                    const people = predictions.filter(
                        p => p.class === 'person' && p.bbox[3] > (p.bbox[2] * 0.7)
                    );

                    let currentFrameEntities = {};

                    for (const person of people) {
                        const [bx, by, bw, bh] = person.bbox;
                        const x = bx * scaleX;
                        const y = by * scaleY;
                        const w = bw * scaleX;
                        const h = bh * scaleY;
                        const centerX = x + (w / 2);
                        const centerY = y + (h / 2);

                        let matchedId = null;
                        let minDistance = canvas.width * 0.35;

                        for (const [id, data] of Object.entries(trackedEntities)) {
                            const dist = Math.hypot(centerX - data.x, centerY - data.y);
                            if (dist < minDistance) {
                                minDistance = dist;
                                matchedId = id;
                            }
                        }

                        if (!matchedId) {
                            matchedId = String(entityIdCounter++);
                            trackedEntities[matchedId] = {
                                x: centerX,
                                y: centerY,
                                counted: false,
                                lastSeen: now,
                                box: { x, y, w, h }
                            };
                        }

                        const prevDist = getLineSignedDistance(trackedEntities[matchedId].x, trackedEntities[matchedId].y, geom);
                        const currDist = getLineSignedDistance(centerX, centerY, geom);
                        const wasCounted = trackedEntities[matchedId].counted;

                        currentFrameEntities[matchedId] = {
                            x: centerX,
                            y: centerY,
                            counted: wasCounted,
                            lastSeen: now,
                            box: { x, y, w, h }
                        };

                        // Line crossing math with arbitrary angle!
                        if (!wasCounted) {
                            if (prevDist < 0 && currDist >= 0) {
                                currentFrameEntities[matchedId].counted = true;
                                triggerFlash(true);
                                if (window.addPassenger) {
                                    window.addPassenger('in');
                                    updateLocalDisplay();
                                }
                            } else if (prevDist > 0 && currDist <= 0) {
                                currentFrameEntities[matchedId].counted = true;
                                triggerFlash(false);
                                if (window.addPassenger) {
                                    window.addPassenger('out');
                                    updateLocalDisplay();
                                }
                            }
                        }

                        // Reset count eligibility when moving away from the line
                        const resetThreshold = Math.min(canvas.width, canvas.height) * 0.18;
                        if (Math.abs(currDist) > resetThreshold) {
                            currentFrameEntities[matchedId].counted = false;
                        }
                    }

                    // Keep existing active entities that were seen within 500ms
                    for (const [id, entity] of Object.entries(trackedEntities)) {
                        if (!currentFrameEntities[id] && now - entity.lastSeen < 500) {
                            currentFrameEntities[id] = entity;
                        }
                    }

                    trackedEntities = currentFrameEntities;

                } catch (err) {
                    console.error("Detection error:", err);
                } finally {
                    isDetecting = false;
                }
            }

            // Yield thread cooperatively so camera video & UI stay silky smooth at 60 FPS
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => setTimeout(r, 60));
        }
    }

    detectLoop();
}

function updateLocalDisplay() {
    const display = document.getElementById('scannerCount');
    if (display && window.AppState) {
        display.textContent = window.AppState.occupancy.onboard;
    }
}

async function switchAICamera() {
    if (!availableCameras.length) {
        try {
            const allDevices = await navigator.mediaDevices.enumerateDevices();
            availableCameras = allDevices.filter(d => d.kind === 'videoinput');
        } catch (e) {}
    }
    if (availableCameras.length <= 1) return;

    currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    const nextCam = availableCameras[currentCameraIndex];
    stopAICamera(true);
    await new Promise(r => setTimeout(r, 200));
    if (nextCam) {
        startAICamera(nextCam.deviceId);
    }
}

function stopAICamera(isSwitching = false) {
    aiRunning = false;
    if (aiStream) {
        aiStream.getTracks().forEach(track => track.stop());
        aiStream = null;
    }
    if (renderAnimFrame) {
        cancelAnimationFrame(renderAnimFrame);
        renderAnimFrame = null;
    }
    const video = document.getElementById('aiVideo');
    const canvas = document.getElementById('aiCanvas');
    const overlay = document.getElementById('scannerOverlay');
    const statusBadge = document.getElementById('aiStatus');
    const switchBtn = document.getElementById('switchCamBtn');

    if (video) {
        video.classList.add('hidden');
        video.style.display = 'none';
        video.srcObject = null;
    }
    if (canvas) {
        canvas.classList.add('hidden');
        canvas.style.display = 'none';
    }
    if (!isSwitching) {
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.style.display = 'flex';
        }
        if (switchBtn) {
            switchBtn.classList.add('hidden');
        }
        currentCameraIndex = 0;
    }
    if (statusBadge) {
        statusBadge.textContent = isSwitching ? "Switching Camera..." : "Camera Off";
        statusBadge.className = isSwitching
            ? "bg-yellow-500 text-white px-5 py-2 rounded-full text-xs font-bold shadow-lg"
            : "bg-slate-800 text-slate-300 px-5 py-2 rounded-full text-xs font-bold shadow-lg border border-slate-700";
    }
    isModelLoading = false;
}

window.startAICamera = startAICamera;
window.stopAICamera = stopAICamera;
window.switchAICamera = switchAICamera;