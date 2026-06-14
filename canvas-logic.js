import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref as dbRef, push, onChildAdded } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 📥 Настройки вашей базы данных Firebase
const firebaseConfig = {
    apiKey: "AIzaSyA-X928SY0pDhvYJPIIp-25E-X6gklcvhM",
  authDomain: "risunok-5ca72.firebaseapp.com",
  databaseURL: "https://risunok-5ca72-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "risunok-5ca72",
  storageBucket: "risunok-5ca72.firebasestorage.app",
  messagingSenderId: "596915972537",
  appId: "1:596915972537:web:5a0be5c76a8d433e21ae68",
  measurementId: "G-2DM14NS9PT"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// ==========================================
// 1. ГЛАВНЫЙ ХОЛСТ: ДРАГ + ПИНЧ ЗУМ
// ==========================================
const viewport = document.getElementById('viewport');
const mainCanvasDiv = document.getElementById('main-canvas');
const scaleIndicator = document.getElementById('scale-indicator');

let canvasX = (window.innerWidth - 2000) / 2;
let canvasY = (window.innerHeight - 2000) / 2;
let mainScale = 1;

let isDragging = false;
let dragStartX, dragStartY;
let initialPinchDistance = 0;
let initialMainScale = 1;
let initialCanvasX = 0, initialCanvasY = 0;

function updateMainCanvas() {
    mainCanvasDiv.style.transform = `translate(${canvasX}px, ${canvasY}px) scale(${mainScale})`;
    scaleIndicator.innerText = Math.round(mainScale * 100) + '%';
}
updateMainCanvas();

function zoomAtPoint(deltaScale, clientX, clientY) {
    const oldScale = mainScale;
    let newScale = mainScale + deltaScale;
    newScale = Math.min(Math.max(0.3, newScale), 3);
    if (newScale === mainScale) return;
    const cx = clientX ?? window.innerWidth / 2;
    const cy = clientY ?? window.innerHeight / 2;
    canvasX = cx - (cx - canvasX) * (newScale / oldScale);
    canvasY = cy - (cy - canvasY) * (newScale / oldScale);
    mainScale = newScale;
    updateMainCanvas();
}

document.querySelectorAll('.main-zoom-in').forEach(btn => btn.onclick = (e) => { e.stopPropagation(); zoomAtPoint(0.2); });
document.querySelectorAll('.main-zoom-out').forEach(btn => btn.onclick = (e) => { e.stopPropagation(); zoomAtPoint(-0.2); });

viewport.addEventListener('pointerdown', (e) => {
    if (e.button === 0) {
        isDragging = true;
        dragStartX = e.clientX - canvasX;
        dragStartY = e.clientY - canvasY;
        viewport.setPointerCapture(e.pointerId);
    }
});
viewport.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    canvasX = e.clientX - dragStartX;
    canvasY = e.clientY - dragStartY;
    updateMainCanvas();
});
viewport.addEventListener('pointerup', () => isDragging = false);

viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0], t2 = e.touches[1];
        const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
        initialPinchDistance = Math.hypot(dx, dy);
        initialMainScale = mainScale;
        initialCanvasX = canvasX;
        initialCanvasY = canvasY;
    }
});
viewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialPinchDistance > 0) {
        e.preventDefault();
        const t1 = e.touches[0], t2 = e.touches[1];
        const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
        const newDist = Math.hypot(dx, dy);
        if (newDist === 0) return;
        const scaleFactor = newDist / initialPinchDistance;
        let newScale = initialMainScale * scaleFactor;
        newScale = Math.min(Math.max(0.3, newScale), 3);
        const centerX = (t1.clientX + t2.clientX) / 2;
        const centerY = (t1.clientY + t2.clientY) / 2;
        canvasX = centerX - (centerX - initialCanvasX) * (newScale / initialMainScale);
        canvasY = centerY - (centerY - initialCanvasY) * (newScale / initialMainScale);
        mainScale = newScale;
        updateMainCanvas();
    }
});
viewport.addEventListener('touchend', () => { initialPinchDistance = 0; });

// ==========================================
// 2. МОДАЛЬНОЕ ОКНО: СТРУКТУРНОЕ РИСОВАНИЕ ВЕКТОРОВ
// ==========================================
const drawModal = document.getElementById('draw-modal');
const drawingCanvas = document.getElementById('drawing-board');
const drawContainer = document.getElementById('drawing-container');
const drawScaleSpan = document.getElementById('draw-scale-indicator');
const ctx = drawingCanvas.getContext('2d');

let currentColor = '#2c3e66';
let currentTool = 'brush';
let brushSize = 14;
let rainbowHue = 0;

let drawScale = 1;
let drawPanX = 0, drawPanY = 0;
let isPanningMode = false;
let isPanningActive = false;
let lastPanX = 0, lastPanY = 0;
let modalPinchDistance = 0;
let modalInitialScale = 1, modalInitialPanX = 0, modalInitialPanY = 0;

let isDrawing = false;

// СТРУКТУРЫ ДАННЫХ ДЛЯ КООРДИНАТ
let currentLines = []; 
let lastPos = null;    

function updateDrawTransform() {
    drawingCanvas.style.transform = `translate(${drawPanX}px, ${drawPanY}px) scale(${drawScale})`;
    drawScaleSpan.innerText = Math.round(drawScale * 100) + '%';
}
function resetDrawView() { drawScale = 1; drawPanX = 0; drawPanY = 0; updateDrawTransform(); }

function zoomDraw(delta, clientX, clientY) {
    let newScale = drawScale + delta;
    newScale = Math.min(Math.max(0.5, newScale), 4);
    if (newScale === drawScale) return;
    const rect = drawContainer.getBoundingClientRect();
    const centerX = clientX !== undefined ? clientX - rect.left : rect.width / 2;
    const centerY = clientY !== undefined ? clientY - rect.top : rect.height / 2;
    drawPanX = centerX - (centerX - drawPanX) * (newScale / drawScale);
    drawPanY = centerY - (centerY - drawPanY) * (newScale / drawScale);
    drawScale = newScale;
    updateDrawTransform();
}
document.getElementById('draw-zoom-in').onclick = () => zoomDraw(0.2);
document.getElementById('draw-zoom-out').onclick = () => zoomDraw(-0.2);

const toggleBtn = document.getElementById('toggle-pan-mode');
toggleBtn.onclick = () => {
    isPanningMode = !isPanningMode;
    toggleBtn.textContent = isPanningMode ? "✏️ Рисов." : "✋ Панорам.";
    toggleBtn.style.background = isPanningMode ? "#3a86ff" : "#f5a623";
};

function getCanvasCoords(e) {
    const rect = drawContainer.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; }
    else { clientX = e.clientX; clientY = e.clientY; }
    const containerX = clientX - rect.left;
    const containerY = clientY - rect.top;
    const canvasX = (containerX - drawPanX) / drawScale;
    const canvasY = (containerY - drawPanY) / drawScale;
    return { x: Math.round(Math.max(0, Math.min(drawingCanvas.width, canvasX))), y: Math.round(Math.max(0, Math.min(drawingCanvas.height, canvasY))) };
}

function applyBrushSettings(forcedColor = null) {
    ctx.globalCompositeOperation = 'source-over';
    if (currentTool === 'eraser') {
        ctx.strokeStyle = '#ffffff';
        ctx.globalCompositeOperation = 'destination-out';
    } else {
        ctx.strokeStyle = forcedColor || currentColor;
    }
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}

function startDraw(e) {
    if (isPanningMode) return;
    e.preventDefault();
    isDrawing = true;
    
    const pos = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);

    let activeColor = currentColor;
    if (currentTool === 'rainbow') {
        activeColor = `hsl(${rainbowHue}, 100%, 55%)`;
        rainbowHue = (rainbowHue + 5) % 360;
    }

    applyBrushSettings(activeColor);

    currentLines.push({
        tool: currentTool,
        color: activeColor,
        size: brushSize,
        points: [pos]
    });
    
    lastPos = pos;
    draw(e);
}

function draw(e) {
    if (!isDrawing || isPanningMode) return;
    e.preventDefault();
    const pos = getCanvasCoords(e);
    
    if (currentTool === 'rainbow') {
        const activeColor = `hsl(${rainbowHue}, 100%, 55%)`;
        rainbowHue = (rainbowHue + 5) % 360;

        currentLines.push({
            tool: currentTool,
            color: activeColor,
            size: brushSize,
            points: [lastPos, pos]
        });

        ctx.strokeStyle = activeColor;
        ctx.beginPath();
        ctx.moveTo(lastPos.x, lastPos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    } else {
        currentLines[currentLines.length - 1].points.push(pos);
        
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    }

    lastPos = pos;
}
function stopDraw() { isDrawing = false; ctx.beginPath(); }

function startPan(e) {
    if (!isPanningMode) return;
    e.preventDefault();
    isPanningActive = true;
    const point = e.touches ? e.touches[0] : e;
    lastPanX = point.clientX; lastPanY = point.clientY;
}
function doPan(e) {
    if (!isPanningActive || !isPanningMode) return;
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    const dx = point.clientX - lastPanX, dy = point.clientY - lastPanY;
    if (dx !== 0 || dy !== 0) {
        drawPanX += dx; drawPanY += dy;
        updateDrawTransform();
    }
    lastPanX = point.clientX; lastPanY = point.clientY;
}
function endPan() { isPanningActive = false; }

function handleModalPinchStart(e) {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const t1 = e.touches[0], t2 = e.touches[1];
    const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
    modalPinchDistance = Math.hypot(dx, dy);
    modalInitialScale = drawScale;
    modalInitialPanX = drawPanX;
    modalInitialPanY = drawPanY;
}
function handleModalPinchMove(e) {
    if (e.touches.length !== 2 || modalPinchDistance === 0) return;
    e.preventDefault();
    const t1 = e.touches[0], t2 = e.touches[1];
    const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
    const newDist = Math.hypot(dx, dy);
    if (newDist === 0) return;
    const scaleFactor = newDist / modalPinchDistance;
    let newScale = modalInitialScale * scaleFactor;
    newScale = Math.min(Math.max(0.5, newScale), 4);
    if (newScale === drawScale) return;
    const rect = drawContainer.getBoundingClientRect();
    const centerX = (t1.clientX + t2.clientX) / 2 - rect.left;
    const centerY = (t1.clientY + t2.clientY) / 2 - rect.top;
    drawPanX = centerX - (centerX - modalInitialPanX) * (newScale / modalInitialScale);
    drawPanY = centerY - (centerY - modalInitialPanY) * (newScale / modalInitialScale);
    drawScale = newScale;
    updateDrawTransform();
}

drawContainer.addEventListener('mousedown', (e) => { if (isPanningMode) startPan(e); else startDraw(e); });
window.addEventListener('mousemove', (e) => { if (isPanningMode && isPanningActive) doPan(e); else if (!isPanningMode && isDrawing) draw(e); });
window.addEventListener('mouseup', () => { if (isPanningMode) endPan(); else stopDraw(); });

drawContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) { handleModalPinchStart(e); return; }
    if (isPanningMode) startPan(e); else startDraw(e);
});
drawContainer.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && modalPinchDistance > 0) { handleModalPinchMove(e); return; }
    if (isPanningMode && isPanningActive) doPan(e);
    else if (!isPanningMode && isDrawing) draw(e);
});
drawContainer.addEventListener('touchend', () => { modalPinchDistance = 0; if (isPanningMode) endPan(); else stopDraw(); });

const colorPaletteDiv = document.getElementById('color-palette');
const colors = ['#2c3e66', '#e63946', '#f4a261', '#2a9d8f', '#9c27b0', '#ff69b4', '#000000', '#ffffff'];
colors.forEach(col => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = col;
    swatch.style.border = col === '#ffffff' ? '1px solid #ccc' : '2px solid white';
    swatch.addEventListener('click', () => {
        currentTool = 'brush';
        brushBtn.classList.add('active'); eraserBtn.classList.remove('active'); rainbowBtn.classList.remove('active');
        currentColor = col;
    });
    colorPaletteDiv.appendChild(swatch);
});

const picker = document.createElement('input');
picker.type = 'color'; picker.value = '#2c3e66';
picker.style.cssText = 'width:32px; height:32px; border-radius:50%; border:2px solid white; cursor:pointer;';
picker.addEventListener('input', (e) => {
    currentTool = 'brush';
    brushBtn.classList.add('active'); eraserBtn.classList.remove('active'); rainbowBtn.classList.remove('active');
    currentColor = e.target.value;
});
colorPaletteDiv.appendChild(picker);

const brushBtn = document.getElementById('tool-brush');
const eraserBtn = document.getElementById('tool-eraser');
const rainbowBtn = document.getElementById('tool-rainbow');
brushBtn.addEventListener('click', () => { currentTool = 'brush'; brushBtn.classList.add('active'); eraserBtn.classList.remove('active'); rainbowBtn.classList.remove('active'); });
eraserBtn.addEventListener('click', () => { currentTool = 'eraser'; eraserBtn.classList.add('active'); brushBtn.classList.remove('active'); rainbowBtn.classList.remove('active'); });
rainbowBtn.addEventListener('click', () => { currentTool = 'rainbow'; rainbowBtn.classList.add('active'); brushBtn.classList.remove('active'); eraserBtn.classList.remove('active'); });
brushBtn.classList.add('active');

const brushSizeSlider = document.getElementById('brush-size');
const brushSizeValue = document.getElementById('brush-size-value');
brushSizeSlider.addEventListener('input', (e) => { brushSize = parseInt(e.target.value); brushSizeValue.innerText = brushSize; });

document.getElementById('clear-drawing').addEventListener('click', () => { 
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height); 
    currentLines = []; 
});

document.getElementById('open-draw-btn').onclick = () => {
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    currentLines = []; 
    ctx.beginPath(); resetDrawView(); isPanningMode = false;
    toggleBtn.textContent = "✋ Панорам."; toggleBtn.style.background = "#f5a623";
    drawModal.classList.add('active');
};
document.getElementById('close-modal-btn').onclick = () => drawModal.classList.remove('active');

// ==========================================
// 3. БЕКЕНД: ОТПРАВКА И ОТРИСОВКА ВЕКТОРНЫХ КООРДИНАТ
// ==========================================
const placementUI = document.getElementById('placement-ui');
const targetGhost = document.getElementById('target-ghost');
const mainControls = document.getElementById('main-controls');
const confirmPlacementBtn = document.getElementById('confirm-placement-btn');

document.getElementById('save-btn').onclick = () => {
    if (currentLines.length === 0) return alert("Сначала нарисуйте что-нибудь!");
    targetGhost.src = drawingCanvas.toDataURL('image/png');
    drawModal.classList.remove('active');
    mainControls.style.display = 'none';
    placementUI.style.display = 'block';
};

function screenToCanvasCoords(clientX, clientY) {
    const xOnCanvas = (clientX - canvasX) / mainScale;
    const yOnCanvas = (clientY - canvasY) / mainScale;
    return {
        x: Math.min(Math.max(xOnCanvas, 0), 2000),
        y: Math.min(Math.max(yOnCanvas, 0), 2000)
    };
}

confirmPlacementBtn.onclick = async () => {
    if (currentLines.length === 0) return;

    confirmPlacementBtn.disabled = true;
    confirmPlacementBtn.innerText = "⏳ СОХРАНЕНИЕ...";

    const ghostRect = targetGhost.getBoundingClientRect();
    const centerX = ghostRect.left + ghostRect.width / 2;
    const centerY = ghostRect.top + ghostRect.height / 2;

    const canvasCoords = screenToCanvasCoords(centerX, centerY);
    const xOnCanvas = canvasCoords.x;
    const yOnCanvas = canvasCoords.y;

    let realSizeOnCanvas = 140 / mainScale;
    realSizeOnCanvas = Math.min(Math.max(realSizeOnCanvas, 40), 400);

    try {
        const itemsDbRef = dbRef(database, 'placed_items');
        
        await push(itemsDbRef, {
            lines: currentLines, 
            leftPercent: (xOnCanvas / 2000) * 100,
            topPercent: (yOnCanvas / 2000) * 100,
            sizePx: realSizeOnCanvas
        });

        placementUI.style.display = 'none';
        mainControls.style.display = 'flex';
        currentLines = [];
        targetGhost.src = "";
    } catch (error) {
        console.error("Ошибка Firebase:", error);
        alert("Не удалось сохранить.");
    } finally {
        confirmPlacementBtn.disabled = false;
        confirmPlacementBtn.innerText = "✅ ПОСТАВИТЬ СЮДА";
    }
};

function renderVectorData(linesArray, targetContext) {
    linesArray.forEach(line => {
        targetContext.globalCompositeOperation = 'source-over';
        if (line.tool === 'eraser') {
            targetContext.strokeStyle = '#ffffff';
            targetContext.globalCompositeOperation = 'destination-out';
        } else {
            targetContext.strokeStyle = line.color;
        }
        targetContext.lineWidth = line.size;
        targetContext.lineCap = 'round';
        targetContext.lineJoin = 'round';

        if (!line.points || line.points.length === 0) return;

        targetContext.beginPath();
        targetContext.moveTo(line.points[0].x, line.points[0].y);
        
        for (let i = 1; i < line.points.length; i++) {
            targetContext.lineTo(line.points[i].x, line.points[i].y);
        }
        targetContext.stroke();
    });
}

const itemsDbRef = dbRef(database, 'placed_items');
onChildAdded(itemsDbRef, (snapshot) => {
    const itemData = snapshot.val();
    if (!itemData || !itemData.lines) return;

    const elCanvas = document.createElement('canvas');
    elCanvas.width = 1200; 
    elCanvas.height = 1200;
    elCanvas.classList.add('canvas-item');

    const elCtx = elCanvas.getContext('2d');
    
    renderVectorData(itemData.lines, elCtx);

    elCanvas.style.width = itemData.sizePx + 'px';
    elCanvas.style.height = itemData.sizePx + 'px';
    elCanvas.style.left = itemData.leftPercent + '%';
    elCanvas.style.top = itemData.topPercent + '%';

    mainCanvasDiv.appendChild(elCanvas);
});

// ==========================================
// 4. СКАЧИВАНИЕ ВСЕГО ХОЛСТА (2000x2000)
// ==========================================
async function downloadFullCanvas() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 2000; tempCanvas.height = 2000;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = '#fffdf0';
    tempCtx.fillRect(0, 0, 2000, 2000);
    tempCtx.strokeStyle = '#f0edce'; tempCtx.lineWidth = 1;
    
    for (let y = 0; y <= 2000; y += 50) { tempCtx.beginPath(); tempCtx.moveTo(0, y); tempCtx.lineTo(2000, y); tempCtx.stroke(); }
    for (let x = 0; x <= 2000; x += 50) { tempCtx.beginPath(); tempCtx.moveTo(x, 0); tempCtx.lineTo(x, 2000); tempCtx.stroke(); }

    const items = document.querySelectorAll('#main-canvas .canvas-item');
    items.forEach(elCanvas => {
        const leftPercent = parseFloat(elCanvas.style.left);
        const topPercent = parseFloat(elCanvas.style.top);
        const widthPx = parseFloat(elCanvas.style.width);
        const heightPx = parseFloat(elCanvas.style.height);
        if (isNaN(leftPercent) || isNaN(topPercent) || isNaN(widthPx) || isNaN(heightPx)) return;
        
        const x = (leftPercent / 100) * 2000;
        const y = (topPercent / 100) * 2000;
        
        tempCtx.drawImage(elCanvas, x - widthPx / 2, y - heightPx / 2, widthPx, heightPx);
    });

    const link = document.createElement('a');
    link.download = 'nash_holst.png';
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
}

document.getElementById('download-canvas-btn').addEventListener('click', () => { downloadFullCanvas().catch(console.warn); });