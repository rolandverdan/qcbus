// ==================================================
// AI PASSENGER SCANNER (High FPS Mobile Optimization)
// ==================================================
let aiStream = null;
let aiRunning = false;
let tfModel = null; 
let isModelLoading = false;
let currentCameraIndex = 0;
let availableCameras = [];

// Pre-configure TensorFlow WebGL backend for maximum mobile performance
async function configureTf() {
    if (window.tf) {
        try {
            await tf.setBackend('webgl');
            tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
            tf.env().set('WEBGL_PACK', true);
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

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
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

    // 1. Offscreen 300x300 canvas: MobileNet SSD's native resolution
    // Pre-downscaling with native 2D hardware blit eliminates 70% of GPU texture overhead!
    const offscreen = document.createElement('canvas');
    offscreen.width = 300;
    offscreen.height = 300;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

    // 2. Smooth 60 FPS Render Loop: renders live video, red line, and tracking overlays smoothly
    function renderLoop() {
        if (!aiRunning) return;

        // Directly paint video to canvas (fixes black video in Chrome on PC)
        if (video.readyState >= 2) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        const lineX = canvas.width / 2;

        // Draw vibrant center red line
        ctx.beginPath();
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, canvas.height);
        ctx.strokeStyle = "rgba(239, 68, 68, 0.85)";
        ctx.lineWidth = 4;
        ctx.stroke();

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

    // 3. Controlled AI Detection Loop: runs every ~90ms so CPU/GPU never get pegged at 100%
    async function detectLoop() {
        while (aiRunning && aiStream) {
            if (!isDetecting && video.readyState >= 2) {
                isDetecting = true;
                try {
                    // Fast hardware-accelerated downsample to 300x300
                    offCtx.drawImage(video, 0, 0, 300, 300);

                    // Infer on tiny 300x300 frame with max 3 boxes
                    const predictions = await model.detect(offscreen, 3, 0.38);

                    const scaleX = canvas.width / 300;
                    const scaleY = canvas.height / 300;
                    const lineX = canvas.width / 2;
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

                        const prevX = trackedEntities[matchedId].x;
                        const wasCounted = trackedEntities[matchedId].counted;

                        currentFrameEntities[matchedId] = {
                            x: centerX,
                            y: centerY,
                            counted: wasCounted,
                            lastSeen: now,
                            box: { x, y, w, h }
                        };

                        // Line crossing math
                        if (!wasCounted) {
                            if (prevX < lineX && centerX >= lineX) {
                                currentFrameEntities[matchedId].counted = true;
                                triggerFlash(true);
                                if (window.addPassenger) {
                                    window.addPassenger('in');
                                    updateLocalDisplay();
                                }
                            } else if (prevX > lineX && centerX <= lineX) {
                                currentFrameEntities[matchedId].counted = true;
                                triggerFlash(false);
                                if (window.addPassenger) {
                                    window.addPassenger('out');
                                    updateLocalDisplay();
                                }
                            }
                        }

                        // Reset count eligibility when moving away from the line
                        if (Math.abs(centerX - lineX) > (canvas.width * 0.18)) {
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

            // Yield thread for 90ms so the camera video & UI stay at 60 FPS
            await new Promise(r => setTimeout(r, 90));
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