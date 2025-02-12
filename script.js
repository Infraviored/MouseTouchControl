const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

const touchpad = document.getElementById('touchpad');
const leftClick = document.getElementById('leftClick');
const rightClick = document.getElementById('rightClick');
const textField = document.getElementById('textField');
const sendButton = document.getElementById('sendButton');
const copyButton = document.getElementById('copyButton');
const lockButton = document.getElementById('lockButton');
const settingsButton = document.getElementById('settingsButton');
const shortcutsButton = document.getElementById('shortcutsButton');
const settingsPanel = document.getElementById('settingsPanel');
const shortcutsPopup = document.getElementById('shortcutsPopup');
const mouseSpeedInput = document.getElementById('mouseSpeed');
const moveThresholdInput = document.getElementById('moveThreshold');
const rightClickDelayInput = document.getElementById('rightClickDelay');
const accelerationInput = document.getElementById('acceleration');
const darkModeToggle = document.getElementById('darkMode');
const reloadButton = document.getElementById('reloadButton');

let mouseSpeed = 4, moveThreshold = 5, rightClickDelay = 500, acceleration = 1.0;
let isLocked = false;
let lastClickTime = 0;
const doubleClickDelay = 300; // milliseconds between clicks to count as double-click

// New globals for multi-touch support
const activePointers = new Map();
let twoFingerGesture = null; // holds info for two finger gestures
let singlePointerGesture = null; // holds info for single pointer gestures

// Add new global variables near the other settings variables
let navigationSwipeInverted = false; // new setting
let navigationDistance = 50; // default value that was hardcoded before
let scrollSpeed = 0.5; // new setting to halve the default scroll speed

// Add new global for scroll accumulation
let scrollAccumulator = 0;
const SCROLL_THRESHOLD = 1; // Minimum amount before triggering a scroll

// SETTINGS
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('touchpadSettings')) || {};
    mouseSpeed = settings.mouseSpeed || 4;
    moveThreshold = settings.moveThreshold || 5;
    rightClickDelay = settings.rightClickDelay || 500;
    acceleration = settings.acceleration || 1.0;
    navigationSwipeInverted = settings.navigationSwipeInverted || false;
    navigationDistance = settings.navigationDistance || 50;
    scrollSpeed = settings.scrollSpeed || 0.5;
    
    mouseSpeedInput.value = mouseSpeed * 10;
    moveThresholdInput.value = moveThreshold;
    rightClickDelayInput.value = rightClickDelay;
    accelerationInput.value = acceleration * 10;
    darkModeToggle.checked = settings.darkMode || false;
    document.getElementById('navigationSwipeInverted').checked = navigationSwipeInverted;
    document.getElementById('navigationDistance').value = navigationDistance;
    document.getElementById('scrollSpeed').value = scrollSpeed * 100;
    
    document.body.classList.toggle('dark-theme', darkModeToggle.checked);
}

function saveSettings() {
    const settings = {
        mouseSpeed,
        moveThreshold,
        rightClickDelay,
        acceleration,
        darkMode: darkModeToggle.checked,
        navigationSwipeInverted,
        navigationDistance,
        scrollSpeed
    };
    localStorage.setItem('touchpadSettings', JSON.stringify(settings));
}

function applyAcceleration(delta) {
    return Math.sign(delta) * Math.pow(Math.abs(delta), acceleration);
}

function adjustBottomBarPosition() {
    const visualViewport = window.visualViewport;
    if (visualViewport) {
        const bottomBar = document.getElementById('bottomBar');
        const keyboardHeight = window.innerHeight - visualViewport.height;
        
        if (keyboardHeight > 0) {
            bottomBar.style.transform = `translateY(-${keyboardHeight}px)`;
        } else {
            bottomBar.style.transform = 'translateY(0)';
        }
    }
}

window.visualViewport?.addEventListener('resize', adjustBottomBarPosition);
window.visualViewport?.addEventListener('scroll', adjustBottomBarPosition);

textField.addEventListener('focus', () => {
    setTimeout(adjustBottomBarPosition, 100);
});
textField.addEventListener('blur', () => {
    setTimeout(adjustBottomBarPosition, 100);
});

settingsButton.addEventListener('click', () => {
    settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
});

shortcutsButton.addEventListener('click', () => {
    shortcutsPopup.style.display = 'block';
});

document.getElementById('closeShortcuts').addEventListener('click', () => {
    shortcutsPopup.style.display = 'none';
});

mouseSpeedInput.addEventListener('input', (e) => {
    mouseSpeed = e.target.value / 10;
    saveSettings();
});
moveThresholdInput.addEventListener('input', (e) => {
    moveThreshold = parseInt(e.target.value);
    saveSettings();
});
rightClickDelayInput.addEventListener('input', (e) => {
    rightClickDelay = parseInt(e.target.value);
    saveSettings();
});
accelerationInput.addEventListener('input', (e) => {
    acceleration = e.target.value / 10;
    saveSettings();
});
darkModeToggle.addEventListener('change', (e) => {
    document.body.classList.toggle('dark-theme', e.target.checked);
    saveSettings();
});

// BUTTONS for click and shortcuts (remain unchanged)
leftClick.addEventListener('click', () => sendCommand('leftClick'));
rightClick.addEventListener('click', () => sendCommand('rightClick'));
sendButton.addEventListener('click', sendText);
copyButton.addEventListener('click', copyText);
lockButton.addEventListener('click', toggleLock);
document.getElementById('ctrlC').addEventListener('click', () => sendCommand('shortcut', { keys: ['control', 'c'] }));
document.getElementById('ctrlV').addEventListener('click', () => sendCommand('shortcut', { keys: ['control', 'v'] }));
document.getElementById('ctrlA').addEventListener('click', () => sendCommand('shortcut', { keys: ['control', 'a'] }));

// --- REVISED POINTER EVENT HANDLERS FOR MULTI-TOUCH SUPPORT ---

// Helper to compute the center of all active pointers
function getCenterOfActivePointers() {
    let sumX = 0, sumY = 0, count = 0;
    activePointers.forEach(pos => {
        sumX += pos.x;
        sumY += pos.y;
        count++;
    });
    return { x: sumX / count, y: sumY / count };
}

function pointerdownHandler(e) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    if (activePointers.size === 2) {
        // Initialize two-finger gesture
        twoFingerGesture = {
            startCenter: getCenterOfActivePointers(),
            lastCenter: getCenterOfActivePointers(),
            horizontalAccum: 0,
            navigationTriggered: false
        };
        // Cancel any pending single-finger timers
        if (singlePointerGesture && singlePointerGesture.rightClickTimer) {
            clearTimeout(singlePointerGesture.rightClickTimer);
            singlePointerGesture.rightClickTimer = null;
        }
    } else if (activePointers.size === 1) {
        // Start single-finger gesture
        singlePointerGesture = {
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastY: e.clientY,
            isMoving: false,
            rightClickTimer: null
        };
        const currentTime = new Date().getTime();
        if (currentTime - lastClickTime < doubleClickDelay) {
            // Double-tap detected: initiate drag mode (lock)
            isLocked = true;
            lockButton.innerHTML = '<i class="fas fa-lock"></i>';
            sendCommand('mouseDown');
            singlePointerGesture.isMoving = true;
        } else {
            if (!isLocked) {
                singlePointerGesture.rightClickTimer = setTimeout(() => {
                    if (!singlePointerGesture.isMoving) {
                        sendCommand('rightClick');
                    }
                    singlePointerGesture.isMoving = true;
                }, rightClickDelay);
            }
        }
        lastClickTime = currentTime;
    }
}

function pointermoveHandler(e) {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    if (activePointers.size === 2) {
        // Process two-finger gesture (scroll & navigation)
        const center = getCenterOfActivePointers();
        if (!twoFingerGesture) {
            twoFingerGesture = {
                startCenter: center,
                lastCenter: center,
                horizontalAccum: 0,
                navigationTriggered: false
            };
        }
        const dx = center.x - twoFingerGesture.lastCenter.x;
        const dy = center.y - twoFingerGesture.lastCenter.y;
        twoFingerGesture.lastCenter = center;
        
        // Accumulate scroll amount and trigger when threshold is reached
        scrollAccumulator += dy * scrollSpeed;
        if (Math.abs(scrollAccumulator) >= SCROLL_THRESHOLD) {
            // Round to nearest integer to ensure consistent scrolling
            const scrollAmount = Math.round(scrollAccumulator);
            sendCommand('scroll', { dx: 0, dy: scrollAmount });
            // Keep remainder for next scroll
            scrollAccumulator -= scrollAmount;
        }
        
        // Update navigation logic with inverted option
        twoFingerGesture.horizontalAccum += dx;
        if (!twoFingerGesture.navigationTriggered && 
            Math.abs(twoFingerGesture.horizontalAccum) > navigationDistance) {
            const isSwipeRight = twoFingerGesture.horizontalAccum > 0;
            const direction = navigationSwipeInverted ? !isSwipeRight : isSwipeRight;
            sendCommand('shortcut', { 
                keys: ['alt', direction ? 'right' : 'left'] 
            });
            twoFingerGesture.navigationTriggered = true;
        }
    } else if (activePointers.size === 1 && singlePointerGesture) {
        // Process single-finger move for cursor movement
        const dx = e.clientX - singlePointerGesture.lastX;
        const dy = e.clientY - singlePointerGesture.lastY;
        singlePointerGesture.lastX = e.clientX;
        singlePointerGesture.lastY = e.clientY;
        const totalMovement = Math.sqrt(Math.pow(e.clientX - singlePointerGesture.startX, 2) +
                                        Math.pow(e.clientY - singlePointerGesture.startY, 2));
        if (totalMovement > moveThreshold) {
            singlePointerGesture.isMoving = true;
            if (!isLocked && singlePointerGesture.rightClickTimer) {
                clearTimeout(singlePointerGesture.rightClickTimer);
                singlePointerGesture.rightClickTimer = null;
            }
            const acceleratedDx = applyAcceleration(dx);
            const acceleratedDy = applyAcceleration(dy);
            sendCommand('move', { dx: acceleratedDx * mouseSpeed, dy: acceleratedDy * mouseSpeed });
        }
    }
}

function pointerupHandler(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) {
        twoFingerGesture = null;
        scrollAccumulator = 0; // Reset accumulator when two-finger gesture ends
    }
    if (activePointers.size === 0 && singlePointerGesture) {
        // For single-finger gestures that did not move, send left click on pointerup
        if (!singlePointerGesture.isMoving) {
            sendCommand('leftClick');
        }
        singlePointerGesture = null;
    }
}

// Attach the new pointer event handlers (also cover cancel/out/leave events)
touchpad.addEventListener('pointerdown', pointerdownHandler);
touchpad.addEventListener('pointermove', pointermoveHandler);
touchpad.addEventListener('pointerup', pointerupHandler);
touchpad.addEventListener('pointercancel', pointerupHandler);
touchpad.addEventListener('pointerout', pointerupHandler);
touchpad.addEventListener('pointerleave', pointerupHandler);

// --- END MULTI-TOUCH HANDLERS ---

function sendCommand(command, data = {}) {
    ws.send(JSON.stringify({ command, ...data }));
}

function sendText() {
    const text = textField.value;
    if (text) {
        sendCommand('typeAll', { text });
        textField.value = '';
    }
}

function copyText() {
    const text = textField.value;
    if (text) {
        sendCommand('copy', { text });
        textField.value = '';
    }
}

function toggleLock() {
    isLocked = !isLocked;
    lockButton.innerHTML = isLocked ? '<i class="fas fa-lock"></i>' : '<i class="fas fa-lock-open"></i>';
    sendCommand(isLocked ? 'mouseDown' : 'mouseUp');
}

function startHeartbeat() {
    heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ command: 'heartbeat' }));
        }
    }, 30000);
}

function stopHeartbeat() {
    clearInterval(heartbeatInterval);
}

ws.onopen = () => {
    console.log('Connected to server');
    loadSettings();
    startHeartbeat();
};

ws.onclose = () => {
    console.log('Disconnected from server');
    stopHeartbeat();
};

ws.onerror = (error) => console.error('WebSocket Error:', error);

textField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (textField.value === '') {
            sendCommand('shortcut', { keys: ['enter'] });
        } else {
            sendText();
        }
    } else if (e.key === 'Backspace' && textField.value === '') {
        e.preventDefault();
        sendCommand('shortcut', { keys: ['backspace'] });
    }
});

reloadButton.addEventListener('click', () => {
    location.reload();
});

// Add new event listeners for the new settings
document.getElementById('navigationSwipeInverted').addEventListener('change', (e) => {
    navigationSwipeInverted = e.target.checked;
    saveSettings();
});

document.getElementById('navigationDistance').addEventListener('input', (e) => {
    navigationDistance = parseInt(e.target.value);
    saveSettings();
});

document.getElementById('scrollSpeed').addEventListener('input', (e) => {
    scrollSpeed = e.target.value / 100;
    saveSettings();
});