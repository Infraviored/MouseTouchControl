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

// New globals for multi-touch support
const activePointers = new Map();
let twoFingerGesture = null; // Will be initialized with:
// {
//     startCenter: {x, y},
//     lastCenter: {x, y},
//     horizontalAccum: 0,
//     navigationTriggered: false,
//     gestureType: null, // 'scroll', 'navigation', or null during detection
//     initialPoints: [] // store points during detection phase
// }
let singlePointerGesture = null; // holds info for single pointer gestures

// Add new global variables near the other settings variables
let navigationSwipeInverted = false; // new setting
let navigationDistance = 50; // default value that was hardcoded before
let scrollSpeed = 0.5; // new setting to halve the default scroll speed

// Add new global for scroll accumulation
let scrollAccumulator = 0;
const SCROLL_THRESHOLD = 1; // Reduced from 3 to 1

// Add new constants for gesture detection
const GESTURE_DETECTION_DISTANCE = 15; // pixels to determine gesture type
const ANGLE_THRESHOLD = 45; // degrees to separate horizontal/vertical gestures

// Add new global variable for terminal mode
let terminalMode = false;

// Replace leftClick button initialization with terminal mode button
const terminalButton = document.getElementById('terminalMode');

// Keep the double-click detection variables
let lastClickTime = 0;
const doubleClickDelay = 300; // milliseconds between clicks to count as double-click

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
    terminalMode = settings.terminalMode || false;
    
    mouseSpeedInput.value = mouseSpeed * 10;
    moveThresholdInput.value = moveThreshold;
    rightClickDelayInput.value = rightClickDelay;
    accelerationInput.value = acceleration * 10;
    darkModeToggle.checked = settings.darkMode || false;
    document.getElementById('navigationSwipeInverted').checked = navigationSwipeInverted;
    document.getElementById('navigationDistance').value = navigationDistance;
    document.getElementById('scrollSpeed').value = scrollSpeed * 100;
    
    document.body.classList.toggle('dark-theme', darkModeToggle.checked);
    
    // Apply terminal mode state on load
    if (terminalMode) {
        terminalButton.classList.add('active');
        terminalButton.innerHTML = '<i class="fas fa-terminal active"></i>';
    }

    // Update toggle states with proper colors
    if (darkModeToggle.checked) {
        darkModeToggle.nextElementSibling.style.backgroundColor = 'var(--accent-color)';
    }
    if (document.getElementById('navigationSwipeInverted').checked) {
        document.getElementById('navigationSwipeInverted').nextElementSibling.style.backgroundColor = 'var(--accent-color)';
    }
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
        scrollSpeed,
        terminalMode
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
    settingsPanel.style.display = settingsPanel.style.display === 'block' ? 'none' : 'block';
});

shortcutsButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const display = shortcutsPopup.style.display;
    shortcutsPopup.style.display = display === 'block' ? 'none' : 'block';
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

// Helper function to calculate angle between two points
function calculateAngle(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    // Returns angle in degrees from -180 to 180
    return Math.atan2(dy, dx) * 180 / Math.PI;
}

function pointerdownHandler(e) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    if (activePointers.size === 2) {
        const center = getCenterOfActivePointers();
        twoFingerGesture = {
            startCenter: center,
            lastCenter: center,
            horizontalAccum: 0,
            navigationTriggered: false,
            gestureType: null,
            initialPoints: [center]
        };
        // Cancel any pending single-finger timers
        if (singlePointerGesture && singlePointerGesture.rightClickTimer) {
            clearTimeout(singlePointerGesture.rightClickTimer);
            singlePointerGesture.rightClickTimer = null;
        }
    } else if (activePointers.size === 1) {
        const now = Date.now();
        if (now - lastClickTime < doubleClickDelay) {
            // Double-click detected - start temporary lock
            sendCommand('mouseDown');
            singlePointerGesture = {
                startX: e.clientX,
                startY: e.clientY,
                lastX: e.clientX,
                lastY: e.clientY,
                isMoving: false,
                isTemporaryLocked: true,
                rightClickTimer: setTimeout(() => {
                    if (singlePointerGesture && !singlePointerGesture.isMoving) {
                        sendCommand('rightClick');
                        singlePointerGesture.rightClickTriggered = true;
                    }
                }, rightClickDelay)
            };
        } else {
            // Normal single click
            singlePointerGesture = {
                startX: e.clientX,
                startY: e.clientY,
                lastX: e.clientX,
                lastY: e.clientY,
                isMoving: false,
                rightClickTimer: setTimeout(() => {
                    if (singlePointerGesture && !singlePointerGesture.isMoving) {
                        sendCommand('rightClick');
                        singlePointerGesture.rightClickTriggered = true;
                    }
                }, rightClickDelay)
            };
        }
        lastClickTime = now;
    }
}

function pointermoveHandler(e) {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    if (activePointers.size === 2) {
        const center = getCenterOfActivePointers();
        if (!twoFingerGesture) {
            twoFingerGesture = {
                startCenter: center,
                lastCenter: center,
                horizontalAccum: 0,
                navigationTriggered: false,
                gestureType: null,
                initialPoints: [center]
            };
        }
        const dx = center.x - twoFingerGesture.lastCenter.x;
        const dy = center.y - twoFingerGesture.lastCenter.y;
        twoFingerGesture.lastCenter = center;
        
        // During gesture detection phase
        if (!twoFingerGesture.gestureType) {
            twoFingerGesture.initialPoints.push(center);
            
            // Calculate total distance moved
            const totalDistance = Math.sqrt(
                Math.pow(center.x - twoFingerGesture.startCenter.x, 2) +
                Math.pow(center.y - twoFingerGesture.startCenter.y, 2)
            );

            // If we've moved enough to determine gesture type
            if (totalDistance >= GESTURE_DETECTION_DISTANCE) {
                const angle = Math.abs(calculateAngle(
                    twoFingerGesture.startCenter,
                    center
                ));
                
                // Determine gesture type based on angle
                if (angle < ANGLE_THRESHOLD || angle > (180 - ANGLE_THRESHOLD)) {
                    twoFingerGesture.gestureType = 'navigation';
                    console.log('Gesture type set to: navigation');
                } else if (angle > (90 - ANGLE_THRESHOLD) && angle < (90 + ANGLE_THRESHOLD)) {
                    twoFingerGesture.gestureType = 'scroll';
                    console.log('Gesture type set to: scroll');
                }
            }
            return; // Don't process any gestures during detection phase
        }

        // Process the gesture based on its type
        if (twoFingerGesture.gestureType === 'scroll') {
            // Scale down the scroll amount for smoother scrolling
            scrollAccumulator += dy * scrollSpeed * 0.2; // Added 0.2 multiplier for finer control
            if (Math.abs(scrollAccumulator) >= SCROLL_THRESHOLD) {
                const scrollAmount = Math.round(scrollAccumulator);
                sendCommand('scroll', { dx: 0, dy: scrollAmount });
                scrollAccumulator -= scrollAmount;
            }
        } else if (twoFingerGesture.gestureType === 'navigation') {
            // Handle navigation
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
            const acceleratedDx = applyAcceleration(dx);
            const acceleratedDy = applyAcceleration(dy);
            sendCommand('move', { dx: acceleratedDx * mouseSpeed, dy: acceleratedDy * mouseSpeed });
        }
    }
}

function pointerupHandler(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2 && twoFingerGesture) {
        // If no gesture type was determined (movement was less than detection distance),
        // treat it as a two-finger tap (right click)
        if (!twoFingerGesture.gestureType) {
            sendCommand('rightClick');
            console.log('Two-finger tap detected: right click');
        }
        twoFingerGesture = null;
        scrollAccumulator = 0;
        // Cancel any single-finger gesture to prevent left click
        singlePointerGesture = null;
    } else if (activePointers.size === 0 && singlePointerGesture) {
        // Release temporary lock if it was active
        if (singlePointerGesture.isTemporaryLocked) {
            sendCommand('mouseUp');
        } else if (!singlePointerGesture.isMoving && !singlePointerGesture.rightClickTriggered) {
            sendCommand('leftClick');
        }
        if (singlePointerGesture.rightClickTimer) {
            clearTimeout(singlePointerGesture.rightClickTimer);
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
        // First copy the text to clipboard
        sendCommand('copy', { text });
        
        // Then paste using either Ctrl+V or Ctrl+Shift+V depending on terminal mode
        setTimeout(() => {
            if (terminalMode) {
                sendCommand('shortcut', { keys: ['control', 'shift', 'v'] });
            } else {
                sendCommand('shortcut', { keys: ['control', 'v'] });
            }
        }, 100); // Small delay to ensure copy completes
        
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

// Add new key handlers after the existing shortcut handlers
document.getElementById('keyTab').addEventListener('click', () => 
    sendCommand('shortcut', { keys: ['tab'] }));
document.getElementById('keyUp').addEventListener('click', () => 
    sendCommand('shortcut', { keys: ['up'] }));
document.getElementById('keyDown').addEventListener('click', () => 
    sendCommand('shortcut', { keys: ['down'] }));
document.getElementById('keyLeft').addEventListener('click', () => 
    sendCommand('shortcut', { keys: ['left'] }));
document.getElementById('keyRight').addEventListener('click', () => 
    sendCommand('shortcut', { keys: ['right'] }));

// Add touch feedback for better mobile experience
document.querySelectorAll('.key-button').forEach(button => {
    button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        button.style.transform = 'scale(0.95)';
        button.style.background = 'var(--button-active-bg)';
    });
    
    ['touchend', 'touchcancel'].forEach(event => {
        button.addEventListener(event, () => {
            button.style.transform = '';
            button.style.background = '';
            // Trigger click event on touchend to ensure the command is sent
            button.click();
        });
    });
});

// Add click outside handler for shortcuts popup
document.addEventListener('click', (e) => {
    const shortcutsPopup = document.getElementById('shortcutsPopup');
    const shortcutsButton = document.getElementById('shortcutsButton');
    
    // If click is outside the popup and the button, and popup is visible
    if (!shortcutsPopup.contains(e.target) && 
        !shortcutsButton.contains(e.target) && 
        shortcutsPopup.style.display === 'block') {
        shortcutsPopup.style.display = 'none';
    }
});

// Add terminal mode toggle handler
terminalButton.addEventListener('click', () => {
    terminalMode = !terminalMode;
    
    // Update visual feedback
    if (terminalMode) {
        terminalButton.style.backgroundColor = 'var(--button-color)';
        terminalButton.style.color = 'var(--button-text)';
    } else {
        terminalButton.style.backgroundColor = 'transparent';
        terminalButton.style.color = 'var(--text-color)';
    }
    
    saveSettings();
});

// Handle tooltips
document.querySelectorAll('.setting-info').forEach(info => {
    const tooltip = info.closest('.setting').querySelector('.setting-tooltip');
    tooltip.textContent = info.dataset.tooltip;
    
    info.addEventListener('mouseenter', () => {
        tooltip.style.display = 'block';
    });
    
    info.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
    });
});

// Ensure shortcuts popup is closed on page load
window.addEventListener('load', () => {
    shortcutsPopup.style.display = 'none';
});

// Sync number inputs with sliders
function setupInputSync(sliderId, numberId) {
    const slider = document.getElementById(sliderId);
    const number = document.getElementById(numberId);
    
    slider.addEventListener('input', () => {
        number.value = slider.value;
    });
    
    number.addEventListener('input', () => {
        slider.value = number.value;
        slider.dispatchEvent(new Event('input'));
    });
}

// Setup sync for all numeric settings
setupInputSync('mouseSpeed', 'mouseSpeedNumber');
setupInputSync('moveThreshold', 'moveThresholdNumber');
setupInputSync('acceleration', 'accelerationNumber');
setupInputSync('navigationDistance', 'navigationDistanceNumber');
setupInputSync('scrollSpeed', 'scrollSpeedNumber');