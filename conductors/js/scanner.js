// ==================================================
// AI PASSENGER SCANNER (High FPS Mobile Optimization)
// ==================================================
let aiStream = null;
let aiRunning = false;
let tfModel = null; 
let isModelLoading = false;
let detectorBusy = false;
let legacyCameraIndex = 0;
let availableCameras = [];
let cameraSessions = [];
let cameraStartToken = 0;
const MAX_CAMERA_SESSIONS = 4;
const PREFERRED_ADDITIONAL_CAMERAS_KEY = 'qc_scanner_additional_camera_device_ids';
const LEGACY_PREFERRED_ADDITIONAL_CAMERA_KEY = 'qc_scanner_additional_camera_device_id';

function loadPreferredAdditionalCameraIds() {
    const savedIds = localStorage.getItem(PREFERRED_ADDITIONAL_CAMERAS_KEY);
    if (savedIds) {
        try {
            const parsedIds = JSON.parse(savedIds);
            if (Array.isArray(parsedIds)) {
                return [...new Set(parsedIds.filter(deviceId => typeof deviceId === 'string' && deviceId))];
            }
            console.warn('Saved additional camera preferences are not a list.');
        } catch (error) {
            console.warn('Could not read saved additional camera preferences:', error);
        }
    }

    const legacyDeviceId = localStorage.getItem(LEGACY_PREFERRED_ADDITIONAL_CAMERA_KEY);
    return legacyDeviceId ? [legacyDeviceId] : [];
}

function savePreferredAdditionalCameraIds(deviceIds) {
    const uniqueIds = [...new Set(deviceIds.filter(deviceId => typeof deviceId === 'string' && deviceId))];
    if (uniqueIds.length) {
        localStorage.setItem(PREFERRED_ADDITIONAL_CAMERAS_KEY, JSON.stringify(uniqueIds));
    } else {
        localStorage.removeItem(PREFERRED_ADDITIONAL_CAMERAS_KEY);
    }
    localStorage.removeItem(LEGACY_PREFERRED_ADDITIONAL_CAMERA_KEY);
}

function getCameraPagesContainer() {
    return document.querySelector('#content #aiCameraPages')
        || document.querySelector('#backgroundCameraHost #aiCameraPages');
}

function getBackgroundCameraHost() {
    let host = document.getElementById('backgroundCameraHost');
    if (host) return host;

    host = document.createElement('div');
    host.id = 'backgroundCameraHost';
    host.setAttribute('aria-hidden', 'true');
    Object.assign(host.style, {
        position: 'fixed',
        left: '-10000px',
        top: '0',
        width: '640px',
        height: '480px',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: '1'
    });
    document.body.appendChild(host);
    return host;
}

function parkAICamera() {
    const pages = document.querySelector('#content #aiCameraPages');
    if (!pages) return;

    getBackgroundCameraHost().replaceChildren(pages);
    cameraSessions.forEach(session => {
        session.video?.play().catch(error => {
            console.warn(`Could not keep camera "${session.label}" playing in the background:`, error);
        });
    });
}

async function refreshAvailableCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        availableCameras = devices.filter(device => device.kind === 'videoinput' && device.deviceId);
        return availableCameras;
    } catch (error) {
        console.warn("Could not enumerate cameras:", error);
        availableCameras = [];
        return availableCameras;
    }
}

if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
        refreshAvailableCameras().then(updateAddCameraControls);
    });
}

// ==================================================
// LINE ORIENTATION & ANGLE CONFIGURATION
// ==================================================
function loadLegacyScannerConfig() {
    const angle = parseInt(localStorage.getItem('qc_scanner_line_angle') || '90', 10);
    const offset = parseInt(localStorage.getItem('qc_scanner_line_offset') || '0', 10);
    return {
        angle: Number.isFinite(angle) ? Math.min(180, Math.max(0, angle)) : 90,
        offset: Number.isFinite(offset) ? Math.min(50, Math.max(-50, offset)) : 0,
        inverted: localStorage.getItem('qc_scanner_inverted') === 'true'
    };
}

let scannerConfig = loadLegacyScannerConfig();
let activeSettingsDeviceId = null;

function getScannerSettingsStorageKey(deviceId) {
    return `qc_scanner_settings_${encodeURIComponent(deviceId)}`;
}

function loadCameraScannerConfig(deviceId) {
    const defaults = loadLegacyScannerConfig();
    const savedSettings = localStorage.getItem(getScannerSettingsStorageKey(deviceId));
    if (!savedSettings) return defaults;

    try {
        const saved = JSON.parse(savedSettings);
        const angle = Number(saved.angle);
        const offset = Number(saved.offset);
        return {
            angle: Number.isFinite(angle) ? Math.min(180, Math.max(0, angle)) : defaults.angle,
            offset: Number.isFinite(offset) ? Math.min(50, Math.max(-50, offset)) : defaults.offset,
            inverted: typeof saved.inverted === 'boolean' ? saved.inverted : defaults.inverted
        };
    } catch (error) {
        console.warn(`Could not read saved scanner settings for camera "${deviceId}":`, error);
        return defaults;
    }
}

function saveScannerConfig() {
    const session = cameraSessions.find(camera => camera.deviceId === activeSettingsDeviceId);
    if (session) {
        session.settings = scannerConfig;
        localStorage.setItem(
            getScannerSettingsStorageKey(session.deviceId),
            JSON.stringify(session.settings)
        );
        return;
    }

    localStorage.setItem('qc_scanner_line_angle', scannerConfig.angle);
    localStorage.setItem('qc_scanner_line_offset', scannerConfig.offset);
    localStorage.setItem('qc_scanner_inverted', scannerConfig.inverted);
}

function updateScannerSettingsCameraOptions() {
    const select = document.getElementById('scannerSettingsCamera');
    if (!select) return;

    select.replaceChildren();
    cameraSessions.forEach(session => {
        const option = document.createElement('option');
        option.value = session.deviceId;
        option.textContent = session.label;
        select.appendChild(option);
    });

    const activeSession = cameraSessions.find(camera => camera.deviceId === activeSettingsDeviceId)
        || cameraSessions[0];
    if (activeSession) {
        activeSettingsDeviceId = activeSession.deviceId;
        scannerConfig = activeSession.settings;
        select.value = activeSession.deviceId;
    }
    select.classList.toggle('hidden', cameraSessions.length < 2);
}

function selectScannerSettingsCamera(deviceId) {
    const session = cameraSessions.find(camera => camera.deviceId === deviceId);
    if (!session) return;

    activeSettingsDeviceId = session.deviceId;
    scannerConfig = session.settings;
    updateScannerSettingsCameraOptions();
    updateScannerControlsUI();
}

function getLineGeometry(width, height, config = scannerConfig) {
    const rad = (config.angle * Math.PI) / 180;
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
    const offsetPx = (config.offset / 100) * Math.min(width, height);
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

function getLineSignedDistance(px, py, geom, config = scannerConfig) {
    let d = (px - geom.x0) * geom.inDirX + (py - geom.y0) * geom.inDirY;
    return config.inverted ? -d : d;
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
            btnVert.className = 'flex items-center justify-center gap-2 rounded-xl border border-qc-blue-accent bg-qc-blue-accent px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition';
            btnHoriz.className = 'flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50';
        } else if (scannerConfig.angle === 0 || scannerConfig.angle === 180) {
            btnHoriz.className = 'flex items-center justify-center gap-2 rounded-xl border border-qc-blue-accent bg-qc-blue-accent px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition';
            btnVert.className = 'flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50';
        } else {
            btnVert.className = 'flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50';
            btnHoriz.className = 'flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50';
        }
    }
}

window.initScannerControlsUI = () => {
    updateScannerSettingsCameraOptions();
    updateScannerControlsUI();
};

window.selectScannerSettingsCamera = selectScannerSettingsCamera;

window.setScannerLineOrientation = function(orientation) {
    if (orientation === 'vertical') {
        window.onScannerAngleChange(90);
    } else if (orientation === 'horizontal') {
        window.onScannerAngleChange(0);
    }
};

window.onScannerAngleChange = function(val) {
    scannerConfig.angle = parseInt(val, 10);
    saveScannerConfig();
    updateScannerControlsUI();
};

window.onScannerOffsetChange = function(val) {
    scannerConfig.offset = parseInt(val, 10);
    saveScannerConfig();
    updateScannerControlsUI();
};

window.toggleScannerDirection = function() {
    scannerConfig.inverted = !scannerConfig.inverted;
    saveScannerConfig();
    updateScannerControlsUI();
};

window.resetScannerLine = function() {
    scannerConfig.angle = 90;
    scannerConfig.offset = 0;
    scannerConfig.inverted = false;
    saveScannerConfig();
    updateScannerControlsUI();
};

// Pre-configure TensorFlow WebGL backend for maximum mobile performance
async function configureTf() {
    if (window.tf) {
        try {
            await tf.setBackend('webgl');
            tf.env().set('WEBGL_PACK', true);
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

async function startAICameraLegacy(preferredDeviceId = null) {
    if (isModelLoading) return;
    
    const video = document.getElementById('aiVideo');
    const canvas = document.getElementById('aiCanvas');
    const overlay = document.getElementById('scannerOverlay');
    const statusBadge = document.getElementById('aiStatus');
    
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
        if (availableCameras.length > 0 && availableCameras[legacyCameraIndex]) {
            constraintOptions.push({
                video: {
                    deviceId: { ideal: availableCameras[legacyCameraIndex].deviceId },
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
    const activeDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId;
    await refreshAvailableCameras(activeDeviceId);

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

function updateCameraLayout() {
    const viewport = document.querySelector('#content #cameraViewport');
    const pages = getCameraPagesContainer();
    const hasMultipleCameras = cameraSessions.length > 1;

    if (viewport) viewport.style.aspectRatio = hasMultipleCameras ? '4 / 3' : '3 / 4';
    if (pages) {
        pages.classList.toggle('grid-cols-2', hasMultipleCameras);
        pages.classList.toggle('gap-1', hasMultipleCameras);
        pages.classList.toggle('p-1', hasMultipleCameras);
    }
}

function updateAddCameraControls() {
    const addButton = document.getElementById('addCameraBtn');
    const picker = document.getElementById('addCameraPicker');
    const select = document.getElementById('availableCameraSelect');
    if (!addButton || !picker || !select) return;

    const selectedDeviceId = select.value;
    const unopenedCameras = availableCameras.filter(
        camera => !cameraSessions.some(session => session.deviceId === camera.deviceId)
    );
    const pickerOpen = !picker.classList.contains('hidden');

    addButton.classList.toggle(
        'hidden',
        !aiRunning || cameraSessions.length >= MAX_CAMERA_SESSIONS || unopenedCameras.length === 0
    );
    select.replaceChildren();
    unopenedCameras.forEach((camera, index) => {
        const option = document.createElement('option');
        option.value = camera.deviceId;
        option.textContent = camera.label || `Camera ${index + 1}`;
        select.appendChild(option);
    });
    if (unopenedCameras.some(camera => camera.deviceId === selectedDeviceId)) {
        select.value = selectedDeviceId;
    }

    picker.classList.toggle('hidden', !pickerOpen || unopenedCameras.length === 0);
    picker.classList.toggle('flex', pickerOpen && unopenedCameras.length > 0);
}

async function startCameraSession(session, startToken) {
    const pages = getCameraPagesContainer();
    if (!cameraSessions.includes(session)) return false;

    const page = document.createElement('div');
    page.className = 'relative min-h-0 min-w-0 overflow-hidden';

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.className = 'absolute inset-0 h-full w-full object-cover';
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.srcObject = session.stream;

    const canvas = document.createElement('canvas');
    canvas.className = 'absolute inset-0 z-10 h-full w-full object-cover';
    const cameraHeader = document.createElement('div');
    cameraHeader.className = 'absolute left-2 right-2 top-2 z-20 flex min-w-0 items-start justify-between gap-1';
    const label = document.createElement('span');
    label.className = 'min-w-0 max-w-[calc(100%-1rem)] truncate rounded bg-black/60 px-2 py-1 text-[10px] font-semibold text-white';
    label.textContent = session.label;
    cameraHeader.appendChild(label);
    if (session.isAdditional) {
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'shrink-0 rounded bg-red-600/90 px-2 py-1 text-[10px] font-bold text-white';
        removeButton.textContent = 'Remove';
        removeButton.setAttribute('aria-label', `Remove ${session.label}`);
        removeButton.disabled = true;
        removeButton.addEventListener('click', () => removeAddedAICamera(session.deviceId));
        session.removeButton = removeButton;
        cameraHeader.appendChild(removeButton);
    }
    page.append(video, canvas, cameraHeader);
    pages?.appendChild(page);
    session.page = page;
    session.video = video;
    session.canvas = canvas;
    updateCameraLayout();

    try {
        await video.play();
    } catch (error) {
        console.warn(`Could not play camera "${session.label}":`, error);
    }
    if (startToken !== cameraStartToken) return false;
    const activePages = getCameraPagesContainer();
    if (activePages && page.parentElement !== activePages) activePages.appendChild(page);

    await new Promise(resolve => {
        if (video.readyState >= 2 && video.videoWidth > 0) {
            resolve();
            return;
        }
        const onReady = () => {
            video.removeEventListener('loadeddata', onReady);
            resolve();
        };
        video.addEventListener('loadeddata', onReady, { once: true });
        setTimeout(resolve, 1000);
    });
    if (startToken !== cameraStartToken) return false;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    const scale = Math.min(1, 640 / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) {
        console.error(`Could not create the scanner canvas for "${session.label}".`);
        return false;
    }

    session.running = true;
    if (session.removeButton) session.removeButton.disabled = false;
    runDetection(video, tfModel, context, canvas, session);
    return true;
}

async function openAddCameraPicker() {
    if (!aiRunning || isModelLoading) return;
    if (cameraSessions.length >= MAX_CAMERA_SESSIONS) return;
    await refreshAvailableCameras();
    if (!aiRunning || cameraSessions.length >= MAX_CAMERA_SESSIONS) return;

    const picker = document.getElementById('addCameraPicker');
    const notice = document.getElementById('cameraCountNotice');
    const hasUnopenedCamera = availableCameras.some(
        camera => !cameraSessions.some(session => session.deviceId === camera.deviceId)
    );
    if (!picker || !hasUnopenedCamera) {
        if (notice) {
            notice.textContent = 'No additional cameras are available.';
            notice.classList.remove('hidden');
        }
        return;
    }

    picker.classList.remove('hidden');
    picker.classList.add('flex');
    updateAddCameraControls();
}

function closeAddCameraPicker() {
    const picker = document.getElementById('addCameraPicker');
    if (!picker) return;
    picker.classList.add('hidden');
    picker.classList.remove('flex');
}

async function addAICameraByDeviceId(deviceId) {
    if (!aiRunning || isModelLoading) return;

    const statusBadge = document.getElementById('aiStatus');
    const notice = document.getElementById('cameraCountNotice');
    if (cameraSessions.length >= MAX_CAMERA_SESSIONS) {
        if (notice) {
            notice.textContent = `Only ${MAX_CAMERA_SESSIONS} cameras can be used at once.`;
            notice.classList.remove('hidden');
        }
        return false;
    }
    await refreshAvailableCameras();
    const device = availableCameras.find(camera => camera.deviceId === deviceId);
    if (!device || cameraSessions.some(session => session.deviceId === device.deviceId)) {
        if (notice) {
            notice.textContent = device
                ? `"${device.label || 'This camera'}" is already active.`
                : 'The saved camera is unavailable. Choose an available camera to add it.';
            notice.classList.remove('hidden');
        }
        updateAddCameraControls();
        return false;
    }

    const startToken = cameraStartToken;
    isModelLoading = true;
    if (statusBadge) statusBadge.textContent = 'Adding camera...';

    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: { exact: device.deviceId },
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        });
    } catch (error) {
        console.error(`Could not add camera "${device.label || device.deviceId}":`, error);
        isModelLoading = false;
        if (statusBadge) statusBadge.textContent = `${cameraSessions.length} camera${cameraSessions.length === 1 ? '' : 's'} counting`;
        if (notice) {
            notice.textContent = `Could not open "${device.label || 'the selected camera'}". Check device support and permissions.`;
            notice.classList.remove('hidden');
        }
        return false;
    }

    if (startToken !== cameraStartToken) {
        stream.getTracks().forEach(track => track.stop());
        return false;
    }

    const session = {
        deviceId: device.deviceId,
        label: device.label || `Camera ${cameraSessions.length + 1}`,
        stream,
        settings: loadCameraScannerConfig(device.deviceId),
        isAdditional: true,
        error: null
    };
    cameraSessions.push(session);
    activeSettingsDeviceId = session.deviceId;
    scannerConfig = session.settings;
    updateScannerSettingsCameraOptions();
    updateScannerControlsUI();

    let started = false;
    try {
        started = await startCameraSession(session, startToken);
    } catch (error) {
        console.error(`Could not initialize camera "${session.label}":`, error);
    }
    if (startToken !== cameraStartToken) return false;

    isModelLoading = false;
    if (!started) {
        session.running = false;
        if (session.renderAnimFrame) cancelAnimationFrame(session.renderAnimFrame);
        stream.getTracks().forEach(track => track.stop());
        cameraSessions = cameraSessions.filter(cameraSession => cameraSession !== session);
        session.page?.remove();
        updateScannerSettingsCameraOptions();
        updateScannerControlsUI();
        if (notice) {
            notice.textContent = `Could not start "${session.label}".`;
            notice.classList.remove('hidden');
        }
    } else {
        savePreferredAdditionalCameraIds([
            ...loadPreferredAdditionalCameraIds(),
            device.deviceId
        ]);
        closeAddCameraPicker();
        if (notice) {
            notice.textContent = 'Each camera counts independently; overlapping views may count a passenger more than once.';
            notice.classList.remove('hidden');
        }
    }
    if (statusBadge) {
        statusBadge.textContent = `${cameraSessions.length} camera${cameraSessions.length === 1 ? '' : 's'} counting`;
    }
    updateCameraLayout();
    updateAddCameraControls();
    resumeAICamera();
    return started;
}

async function addSelectedAICamera() {
    const select = document.getElementById('availableCameraSelect');
    if (!select) return;
    await addAICameraByDeviceId(select.value);
}

async function removeAddedAICamera(deviceId) {
    const session = cameraSessions.find(camera => camera.deviceId === deviceId && camera.isAdditional);
    if (!session || isModelLoading) return;

    session.running = false;
    if (session.renderAnimFrame) cancelAnimationFrame(session.renderAnimFrame);
    session.stream?.getTracks().forEach(track => track.stop());
    if (session.video) {
        session.video.pause();
        session.video.srcObject = null;
    }
    session.page?.remove();
    cameraSessions = cameraSessions.filter(camera => camera !== session);
    savePreferredAdditionalCameraIds(
        loadPreferredAdditionalCameraIds().filter(savedDeviceId => savedDeviceId !== session.deviceId)
    );
    updateScannerSettingsCameraOptions();
    updateScannerControlsUI();
    updateCameraLayout();
    updateAddCameraControls();

    const previousMainSession = cameraSessions[0];
    if (!previousMainSession) return;

    isModelLoading = true;
    const statusBadge = document.getElementById('aiStatus');
    if (statusBadge) statusBadge.textContent = 'Returning to main camera...';
    const notice = document.getElementById('cameraCountNotice');
    if (notice) notice.classList.add('hidden');

    previousMainSession.running = false;
    if (previousMainSession.renderAnimFrame) cancelAnimationFrame(previousMainSession.renderAnimFrame);
    previousMainSession.page?.remove();
    if (previousMainSession.video) {
        previousMainSession.video.pause();
        previousMainSession.video.srcObject = null;
    }
    previousMainSession.stream?.getTracks().forEach(track => track.stop());
    const mainSession = {
        ...previousMainSession,
        stream: null,
        video: null,
        canvas: null,
        page: null,
        renderAnimFrame: null,
        running: false
    };
    cameraSessions[0] = mainSession;
    aiStream = null;

    const startToken = cameraStartToken;
    const videoConstraints = {
        width: { ideal: 640 },
        height: { ideal: 480 }
    };
    let stream;
    try {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: mainSession.deviceId && mainSession.deviceId !== 'default'
                    ? { ...videoConstraints, deviceId: { exact: mainSession.deviceId } }
                    : { ...videoConstraints, facingMode: { ideal: 'environment' } },
                audio: false
            });
        } catch (error) {
            if (!mainSession.deviceId || mainSession.deviceId === 'default') throw error;
            console.warn(`Could not reopen "${mainSession.label}" by device ID; using the default rear camera.`, error);
            stream = await navigator.mediaDevices.getUserMedia({
                video: { ...videoConstraints, facingMode: { ideal: 'environment' } },
                audio: false
            });
        }

        if (startToken !== cameraStartToken) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }

        const actualDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId;
        if (actualDeviceId && actualDeviceId !== mainSession.deviceId) {
            localStorage.setItem(
                getScannerSettingsStorageKey(actualDeviceId),
                JSON.stringify(mainSession.settings)
            );
            mainSession.deviceId = actualDeviceId;
            activeSettingsDeviceId = actualDeviceId;
        }
        mainSession.stream = stream;
        aiStream = stream;
        const started = await startCameraSession(mainSession, startToken);
        if (startToken !== cameraStartToken) return;
        if (!started) throw new Error(`Could not restart "${mainSession.label}".`);

        isModelLoading = false;
        updateScannerSettingsCameraOptions();
        updateScannerControlsUI();
        updateCameraLayout();
        updateAddCameraControls();
        resumeAICamera();
    } catch (error) {
        console.error('Could not restore the main camera after removing the added camera:', error);
        isModelLoading = false;
        stopAICamera();
        const currentNotice = document.getElementById('cameraCountNotice');
        if (currentNotice) {
            currentNotice.textContent = 'Could not restore the main camera. Tap Start Camera to try again.';
            currentNotice.classList.remove('hidden');
        }
    }
}

async function startAICamera() {
    if (isModelLoading || aiRunning) return;

    const pages = getCameraPagesContainer();
    const statusBadge = document.getElementById('aiStatus');
    const notice = document.getElementById('cameraCountNotice');
    if (!pages) return;

    const startToken = ++cameraStartToken;
    const isCurrentStart = () => startToken === cameraStartToken && window.AppState?.trip?.active;
    isModelLoading = true;
    pages.replaceChildren();
    if (notice) {
        notice.textContent = '';
        notice.classList.add('hidden');
    }
    if (statusBadge) {
        statusBadge.textContent = "Starting cameras...";
        statusBadge.className = "bg-yellow-500 text-white px-5 py-2 rounded-full text-xs font-bold shadow-lg";
    }

    let firstStream;
    try {
        firstStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        });
    } catch (error) {
        console.error("Could not start the camera:", error);
        if (statusBadge) {
            statusBadge.textContent = "Camera Error";
            statusBadge.className = "bg-red-500 text-white px-5 py-2 rounded-full text-xs font-bold";
        }
        isModelLoading = false;
        return;
    }
    if (!isCurrentStart()) {
        firstStream.getTracks().forEach(track => track.stop());
        return;
    }

    const firstTrack = firstStream.getVideoTracks()[0];
    const firstDeviceId = firstTrack?.getSettings().deviceId;
    aiStream = firstStream;
    await refreshAvailableCameras();
    if (!isCurrentStart()) {
        firstStream.getTracks().forEach(track => track.stop());
        return;
    }

    const activeDevice = availableCameras.find(device => device.deviceId === firstDeviceId)
        || availableCameras.find(device => device.label && device.label === firstTrack?.label);
    const firstSessionDeviceId = firstDeviceId || activeDevice?.deviceId || 'default';
    cameraSessions = [{
        deviceId: firstSessionDeviceId,
        label: activeDevice?.label || firstTrack?.label || 'Camera 1',
        stream: firstStream,
        settings: loadCameraScannerConfig(firstSessionDeviceId),
        error: null
    }];
    activeSettingsDeviceId = firstSessionDeviceId;
    scannerConfig = cameraSessions[0].settings;
    updateScannerSettingsCameraOptions();
    updateScannerControlsUI();

    try {
        if (!tfModel) {
            await configureTf();
            if (!tfModel && window.cocoSsd) {
                tfModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
            }
        }
    } catch (error) {
        console.error("AI passenger detection model could not be loaded:", error);
    }
    if (!isCurrentStart()) return;
    if (!tfModel) {
        console.error("AI passenger detection model is unavailable.");
        cameraSessions.forEach(session => session.stream?.getTracks().forEach(track => track.stop()));
        cameraSessions = [];
        aiStream = null;
        activeSettingsDeviceId = null;
        scannerConfig = loadLegacyScannerConfig();
        updateScannerSettingsCameraOptions();
        isModelLoading = false;
        if (statusBadge) {
            statusBadge.textContent = "AI Scanner Error";
            statusBadge.className = "bg-red-500 text-white px-5 py-2 rounded-full text-xs font-bold";
        }
        return;
    }

    aiRunning = true;
    const started = await startCameraSession(cameraSessions[0], startToken);
    if (!isCurrentStart()) return;
    isModelLoading = false;
    if (!started) {
        stopAICamera();
        if (statusBadge) {
            statusBadge.textContent = "Camera Error";
            statusBadge.className = "bg-red-500 text-white px-5 py-2 rounded-full text-xs font-bold";
        }
        return;
    }

    resumeAICamera();
    const preferredAdditionalCameraIds = loadPreferredAdditionalCameraIds()
        .filter(deviceId => deviceId !== firstSessionDeviceId);
    savePreferredAdditionalCameraIds(preferredAdditionalCameraIds);
    for (const deviceId of preferredAdditionalCameraIds) {
        if (cameraSessions.length >= MAX_CAMERA_SESSIONS) break;
        await addAICameraByDeviceId(deviceId);
    }
}

function runDetection(video, model, ctx, canvas, session) {
    let trackedEntities = {};
    let entityIdCounter = 0;
    let isDetecting = false;
    let flashEffect = null;

    // 1. Offscreen 256x256 canvas WITHOUT willReadFrequently (keeps it on the GPU!)
    const AI_SIZE = 256;
    const offscreen = document.createElement('canvas');
    offscreen.width = AI_SIZE;
    offscreen.height = AI_SIZE;
    const offCtx = offscreen.getContext('2d', { alpha: false });
    offCtx.imageSmoothingEnabled = false;

    // 2. Lightweight Overlay Loop: ONLY draws UI lines & boxes (the <video> tag handles the video feed natively!)
    function renderLoop() {
        if (!session.running) return;

        // Clear only the transparent overlay instead of repainting the entire video frame
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const config = session.settings || scannerConfig;
        const geom = getLineGeometry(canvas.width, canvas.height, config);

        // Draw detection line
        ctx.beginPath();
        ctx.moveTo(geom.x1, geom.y1);
        ctx.lineTo(geom.x2, geom.y2);
        ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
        ctx.lineWidth = 4;
        ctx.stroke();

        // Direction indicator badges (IN and OUT pills)
        const tagDist = 28;
        const inDirX = config.inverted ? -geom.inDirX : geom.inDirX;
        const inDirY = config.inverted ? -geom.inDirY : geom.inDirY;
        const inTagX = geom.x0 + inDirX * tagDist;
        const inTagY = geom.y0 + inDirY * tagDist;
        const outTagX = geom.x0 - inDirX * tagDist;
        const outTagY = geom.y0 - inDirY * tagDist;

        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillStyle = "rgba(16, 185, 129, 0.9)";
        ctx.beginPath();
        ctx.arc(inTagX, inTagY, 12, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText("IN", inTagX, inTagY);

        ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
        ctx.beginPath();
        ctx.arc(outTagX, outTagY, 12, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText("OUT", outTagX, outTagY);

        const now = Date.now();

        // Draw active tracked person boxes
        for (const [id, entity] of Object.entries(trackedEntities)) {
            if (entity.box && now - entity.lastSeen < 500) {
                ctx.strokeStyle = entity.counted ? "#10b981" : "#38bdf8";
                ctx.lineWidth = 3;
                ctx.strokeRect(entity.box.x, entity.box.y, entity.box.w, entity.box.h);

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

        session.renderAnimFrame = requestAnimationFrame(renderLoop);
    }
    renderLoop();

    function triggerFlash(isIn) {
        flashEffect = {
            color: isIn ? 'rgba(16, 185, 129, ALPHA)' : 'rgba(239, 68, 68, ALPHA)',
            alpha: 0.35,
        };
    }

    // 3. Throttled GPU AI Loop (~8-10 FPS is plenty for walking speed and keeps phone cool)
    async function detectLoop() {
        while (session.running && session.stream) {
            if (!isDetecting && !detectorBusy && video.readyState >= 2) {
                isDetecting = true;
                detectorBusy = true;
                try {
                    offCtx.drawImage(video, 0, 0, AI_SIZE, AI_SIZE);
                    if (window.tf) await tf.nextFrame(); // Yield before heavy GPU inference
                    
                    const predictions = await model.detect(offscreen, 3, 0.40);
                    if (!session.running) continue;

                    const scaleX = canvas.width / AI_SIZE;
                    const scaleY = canvas.height / AI_SIZE;
                    const config = session.settings || scannerConfig;
                    const geom = getLineGeometry(canvas.width, canvas.height, config);
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

                        const prevDist = getLineSignedDistance(trackedEntities[matchedId].x, trackedEntities[matchedId].y, geom, config);
                        const currDist = getLineSignedDistance(centerX, centerY, geom, config);
                        const wasCounted = trackedEntities[matchedId].counted;

                        currentFrameEntities[matchedId] = {
                            x: centerX,
                            y: centerY,
                            counted: wasCounted,
                            lastSeen: now,
                            box: { x, y, w, h }
                        };

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

                        const resetThreshold = Math.min(canvas.width, canvas.height) * 0.18;
                        if (Math.abs(currDist) > resetThreshold) {
                            currentFrameEntities[matchedId].counted = false;
                        }
                    }

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
                    detectorBusy = false;
                }
            }

            await new Promise(r => setTimeout(r, 110));
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

function resumeAICamera() {
    if (!aiRunning || !cameraSessions.length || !window.AppState?.trip?.active) return;

    const pages = getCameraPagesContainer();
    if (!pages) return;

    pages.replaceChildren();
    cameraSessions.forEach(session => {
        if (session.page) pages.appendChild(session.page);
        if (session.video) {
            session.video.srcObject = session.stream;
            session.video.play().catch(error => {
                console.warn(`Could not resume camera "${session.label}":`, error);
            });
        } else {
            startCameraSession(session, cameraStartToken).catch(error => {
                console.error(`Could not resume camera "${session.label}":`, error);
            });
        }
    });
    document.getElementById('backgroundCameraHost')?.replaceChildren();

    const overlay = document.getElementById('scannerOverlay');
    const statusBadge = document.getElementById('aiStatus');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
    if (statusBadge) {
        statusBadge.textContent = `${cameraSessions.length} camera${cameraSessions.length === 1 ? '' : 's'} counting`;
        statusBadge.className = 'bg-emerald-500 text-white px-5 py-2 rounded-full text-xs font-bold shadow-lg';
    }
    updateCameraLayout();
    updateScannerSettingsCameraOptions();
    updateScannerControlsUI();
    updateAddCameraControls();
}

function stopAICamera() {
    cameraStartToken += 1;
    aiRunning = false;
    cameraSessions.forEach(session => {
        session.running = false;
        if (session.renderAnimFrame) cancelAnimationFrame(session.renderAnimFrame);
        session.stream?.getTracks().forEach(track => track.stop());
        if (session.video) {
            session.video.pause();
            session.video.srcObject = null;
        }
    });
    cameraSessions = [];
    aiStream = null;
    activeSettingsDeviceId = null;
    scannerConfig = loadLegacyScannerConfig();
    const pages = getCameraPagesContainer();
    const overlay = document.getElementById('scannerOverlay');
    const statusBadge = document.getElementById('aiStatus');

    if (pages) pages.replaceChildren();
    document.getElementById('backgroundCameraHost')?.replaceChildren();
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
    }
    const notice = document.getElementById('cameraCountNotice');
    if (notice) notice.classList.add('hidden');
    closeAddCameraPicker();
    updateCameraLayout();
    updateScannerSettingsCameraOptions();
    updateScannerControlsUI();
    updateAddCameraControls();
    if (statusBadge) {
        statusBadge.textContent = "Camera Off";
        statusBadge.className = "bg-slate-800 text-slate-300 px-5 py-2 rounded-full text-xs font-bold shadow-lg border border-slate-700";
    }
    isModelLoading = false;
}

window.startAICamera = startAICamera;
window.parkAICamera = parkAICamera;
window.resumeAICamera = resumeAICamera;
window.stopAICamera = stopAICamera;
window.openAddCameraPicker = openAddCameraPicker;
window.closeAddCameraPicker = closeAddCameraPicker;
window.addSelectedAICamera = addSelectedAICamera;
