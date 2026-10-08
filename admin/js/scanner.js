// ==================================================
// AI PASSENGER SCANNER
// ==================================================
let aiStream = null;
let aiAnimFrame = null;

async function startAICamera() {
    const video = document.getElementById('aiVideo');
    const canvas = document.getElementById('aiCanvas');
    const overlay = document.getElementById('scannerOverlay');
    const statusBadge = document.getElementById('aiStatus');
    
    if (!video || !canvas) return;

    overlay.style.display = 'none';
    video.style.display = 'block';
    canvas.style.display = 'block';
    statusBadge.textContent = "Loading AI Model...";
    statusBadge.className = "bg-yellow-500 text-white px-5 py-2 rounded-full text-sm font-bold shadow-lg";

    try {
        aiStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = aiStream;
    } catch (err) {
        statusBadge.textContent = "Camera Error";
        statusBadge.className = "bg-red-500 text-white px-5 py-2 rounded-full text-sm font-bold";
        return;
    }

    video.onloadedmetadata = async () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Relies on the scripts added to index.html
        const model = await cocoSsd.load();
        
        statusBadge.textContent = "Scanner Active";
        statusBadge.className = "bg-emerald-500 text-white px-5 py-2 rounded-full text-sm font-bold shadow-lg";
        
        runDetection(video, model, canvas.getContext('2d'), canvas);
    };
}

function runDetection(video, model, ctx, canvas) {
    let trackedEntities = {};
    let entityIdCounter = 0;

    function detect() {
        if (!aiStream) return; 
        
        model.detect(video).then(predictions => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const lineX = canvas.width / 2;
            
            // Draw crossing line
            ctx.beginPath(); ctx.moveTo(lineX, 0); ctx.lineTo(lineX, canvas.height); 
            ctx.strokeStyle = "rgba(255, 0, 0, 0.8)"; ctx.lineWidth = 4; ctx.stroke();

            // Filter people
            const people = predictions.filter(p => p.class === 'person' && p.score > 0.35 && p.bbox[3] > (p.bbox[2] * 0.8));
            let currentFrameEntities = {};

            people.forEach(person => {
                const [x, y, width, height] = person.bbox;
                const centerX = x + (width / 2);
                const centerY = y + (height / 2);

                ctx.strokeStyle = "#00FF00"; ctx.lineWidth = 4; ctx.strokeRect(x, y, width, height);

                let matchedId = null;
                let minDistance = canvas.width * 0.3;

                for (const [id, data] of Object.entries(trackedEntities)) {
                    const dist = Math.hypot(centerX - data.x, centerY - data.y);
                    if (dist < minDistance) { minDistance = dist; matchedId = id; }
                }

                if (!matchedId) {
                    matchedId = entityIdCounter++;
                    trackedEntities[matchedId] = { x: centerX, y: centerY, counted: false };
                }
                
                currentFrameEntities[matchedId] = { x: centerX, y: centerY, counted: trackedEntities[matchedId].counted };
                const prevX = trackedEntities[matchedId].x;
                
                // Crossing logic calling counter.js
                if (!currentFrameEntities[matchedId].counted) {
                    if (prevX < lineX && centerX >= lineX) {
                        currentFrameEntities[matchedId].counted = true;
                        if (window.addPassenger) window.addPassenger('in'); 
                    } else if (prevX > lineX && centerX <= lineX) {
                        currentFrameEntities[matchedId].counted = true;
                        if (window.addPassenger) window.addPassenger('out');
                    }
                }

                if (Math.abs(centerX - lineX) > (canvas.width * 0.15)) {
                    currentFrameEntities[matchedId].counted = false;
                }
            });

            trackedEntities = currentFrameEntities;
            aiAnimFrame = requestAnimationFrame(detect);
        });
    }
    detect();
}

function stopAICamera() {
    if (aiStream) {
        aiStream.getTracks().forEach(track => track.stop());
        aiStream = null;
    }
    if (aiAnimFrame) {
        cancelAnimationFrame(aiAnimFrame);
        aiAnimFrame = null;
    }
}

window.startAICamera = startAICamera;
window.stopAICamera = stopAICamera;