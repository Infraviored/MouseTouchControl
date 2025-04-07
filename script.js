const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
let ws;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const baseReconnectDelay = 1000; // 1 second initial delay
let reconnectTimeout;
let heartbeatInterval;

function connectWebSocket() {
    ws = new WebSocket(`${wsProtocol}//${window.location.host}`);
    
    ws.onopen = () => {
        console.log('Connected to server');
        reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        loadSettings();
        startHeartbeat();
    };
    
    ws.onclose = () => {
        console.log('Disconnected from server');
        stopHeartbeat();
        
        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(30000, baseReconnectDelay * Math.pow(1.5, reconnectAttempts));
            reconnectAttempts++;
            reconnectTimeout = setTimeout(connectWebSocket, delay);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket Error:', error);
    };
}

// Initialize the WebSocket connection
connectWebSocket();

// Add event listener for visibility change (when user returns to the tab/app)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // If the document becomes visible and WebSocket is closed, reconnect
        if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            clearTimeout(reconnectTimeout); // Clear any pending reconnect
            reconnectTimeout = setTimeout(connectWebSocket, 500); // Try to reconnect quickly
        }
    }
});

// Add event listener for online/offline events
window.addEventListener('online', () => {
    if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectWebSocket, 1000);
    }
});

const touchpad = document.getElementById('touchpad');
const scrollContent = document.getElementById('scrollContent');
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

// Add new globals for scrollbar handling
let isScrollbarGesture = false;
let SCROLLBAR_WIDTH = 20; // Effective touch area width for scrollbar (px)
let scrollbarScrollAccumulator = 0; // Add scrollbar-specific accumulator

// Add new global variable for scrollbar width
let scrollbarWidth = 20; // Default scrollbar width in pixels

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
    scrollbarWidth = settings.scrollbarWidth || 20; // Load scrollbar width
    
    mouseSpeedInput.value = mouseSpeed * 10;
    moveThresholdInput.value = moveThreshold;
    rightClickDelayInput.value = rightClickDelay;
    accelerationInput.value = acceleration * 10;
    darkModeToggle.checked = settings.darkMode || false;
    document.getElementById('navigationSwipeInverted').checked = navigationSwipeInverted;
    document.getElementById('navigationDistance').value = navigationDistance;
    document.getElementById('scrollSpeed').value = scrollSpeed * 100;
    document.getElementById('scrollbarWidth').value = scrollbarWidth;
    
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
    
    // Update the SCROLLBAR_WIDTH constant
    SCROLLBAR_WIDTH = scrollbarWidth;
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
        terminalMode,
        scrollbarWidth
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
    // Check if touch is on scrollbar area before adding to active pointers
    const touchpadRect = touchpad.getBoundingClientRect();
    const isOnScrollbar = (e.clientX >= touchpadRect.right - SCROLLBAR_WIDTH);
    
    // Add to active pointers with minimal properties to improve performance
    if (isOnScrollbar) {
        activePointers.set(e.pointerId, { 
            x: e.clientX, 
            y: e.clientY,
            isScrollbarTouch: true
        });
        isScrollbarGesture = true;
        e.preventDefault(); // Prevent default scrolling
    } else {
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
}

function pointermoveHandler(e) {
    if (!activePointers.has(e.pointerId)) return;
    
    const pointer = activePointers.get(e.pointerId);
    
    // Fast path for scrollbar gestures
    if (pointer.isScrollbarTouch) {
        const prevY = pointer.y;
        pointer.y = e.clientY;
        
        // Calculate delta y and use the same scrolling logic as two-finger scrolling
        const dy = pointer.y - prevY;
        scrollbarScrollAccumulator += dy * scrollSpeed * 0.2;
        if (Math.abs(scrollbarScrollAccumulator) >= SCROLL_THRESHOLD) {
            const scrollAmount = Math.round(scrollbarScrollAccumulator);
            sendCommand('scroll', { dx: 0, dy: scrollAmount });
            scrollbarScrollAccumulator -= scrollAmount;
        }
        return;
    }
    
    // Fast path for single pointer gesture (cursor movement)
    if (activePointers.size === 1 && singlePointerGesture) {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        
        const dx = pointer.x - singlePointerGesture.lastX;
        const dy = pointer.y - singlePointerGesture.lastY;
        singlePointerGesture.lastX = pointer.x;
        singlePointerGesture.lastY = pointer.y;
        
        const totalMovement = Math.sqrt(
            Math.pow(pointer.x - singlePointerGesture.startX, 2) +
            Math.pow(pointer.y - singlePointerGesture.startY, 2)
        );
        
        if (totalMovement > moveThreshold) {
            singlePointerGesture.isMoving = true;
            const acceleratedDx = applyAcceleration(dx);
            const acceleratedDy = applyAcceleration(dy);
            sendCommand('move', { dx: acceleratedDx * mouseSpeed, dy: acceleratedDy * mouseSpeed });
        }
        return;
    }
    
    // Update pointer position for multi-touch gestures
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    activePointers.set(e.pointerId, pointer);
    
    // Handle two-finger gestures
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
                } else if (angle > (90 - ANGLE_THRESHOLD) && angle < (90 + ANGLE_THRESHOLD)) {
                    twoFingerGesture.gestureType = 'scroll';
                }
            }
            return; // Don't process any gestures during detection phase
        }

        // Process the gesture based on its type
        if (twoFingerGesture.gestureType === 'scroll') {
            // Scale down the scroll amount for smoother scrolling
            scrollAccumulator += dy * scrollSpeed * 0.2;
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
    }
}

function pointerupHandler(e) {
    if (!activePointers.has(e.pointerId)) return;
    
    const wasScrollbarTouch = activePointers.get(e.pointerId).isScrollbarTouch;
    activePointers.delete(e.pointerId);
    
    // Fast path for scrollbar gestures
    if (wasScrollbarTouch && activePointers.size === 0) {
        isScrollbarGesture = false;
        scrollbarScrollAccumulator = 0;
        return;
    }
    
    // Fast path for single pointer gestures
    if (activePointers.size === 0 && singlePointerGesture) {
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
        return;
    }
    
    // Handle two-finger gesture ending
    if (activePointers.size < 2 && twoFingerGesture) {
        // If no gesture type was determined (movement was less than detection distance),
        // treat it as a two-finger tap (right click)
        if (!twoFingerGesture.gestureType) {
            sendCommand('rightClick');
        }
        twoFingerGesture = null;
        scrollAccumulator = 0;
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
    // Only send if the connection is open
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ command, ...data }));
    } else if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        // If connection is closed, try to reconnect immediately
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectWebSocket, 100);
    }
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
    stopHeartbeat(); // Clear any existing heartbeat first
    heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ command: 'heartbeat' }));
        } else if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            // If connection is closed during heartbeat, try to reconnect
            clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(connectWebSocket, 100);
        }
    }, 30000);
}

function stopHeartbeat() {
    clearInterval(heartbeatInterval);
}

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
    // Close existing connection if open
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
    }
    
    // Clear any pending reconnect timeouts
    clearTimeout(reconnectTimeout);
    
    // Reset reconnect attempts and connect immediately
    reconnectAttempts = 0;
    connectWebSocket();
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

// Add event listener for scrollbar width setting
document.getElementById('scrollbarWidth').addEventListener('input', (e) => {
    scrollbarWidth = parseInt(e.target.value);
    SCROLLBAR_WIDTH = scrollbarWidth;
    saveSettings();
});

// Setup input sync for scrollbar width
setupInputSync('scrollbarWidth', 'scrollbarWidthNumber');

// Function to adjust scroll content height
function adjustScrollContentHeight() {
    // Make scroll content at least 3x the viewport height to ensure scrolling is possible
    const viewportHeight = window.innerHeight;
    scrollContent.style.height = `${viewportHeight * 3}px`;
}

window.addEventListener('load', adjustScrollContentHeight);
window.addEventListener('resize', adjustScrollContentHeight);
// Mobile Keyboard Shortcut Bar
const keyboardShortcutBar = document.getElementById('keyboardShortcutBar');
const bottomBar = document.getElementById('bottomBar');
const shortcutKeys = document.querySelectorAll('.shortcut-key');
const kbShortcutsButton = document.getElementById('kbShortcutsButton');

// Active modifiers state
const activeModifiers = {
    control: false,
    alt: false
};

// Track the last input value to detect changes
let lastInputValue = '';
let isInteractingWithShortcutBar = false;

// Initialize keyboard shortcut bar
function initKeyboardShortcutBar() {
    // Toggle keyboard shortcuts with the button
    kbShortcutsButton.addEventListener('click', () => {
        if (kbShortcutsButton.classList.contains('active')) {
            // Currently active, so hide it
            keyboardShortcutBar.style.display = 'none';
            kbShortcutsButton.classList.remove('active');
        } else {
            // Currently hidden, so show it
            keyboardShortcutBar.style.display = 'flex';
            kbShortcutsButton.classList.add('active');
        }
    });

    // Set up shortcut key event handlers
    shortcutKeys.forEach(key => {
        key.addEventListener('touchstart', (e) => {
            e.preventDefault();
            handleShortcutKeyPress(key);
        });
        
        key.addEventListener('mousedown', (e) => {
            e.preventDefault();
            handleShortcutKeyPress(key);
        });
    });

    // Use input event to catch all text changes
    textField.addEventListener('input', handleTextFieldInput);
    
    // Handle key events in text field
    textField.addEventListener('keydown', handleTextFieldKeyDown);
}

// Handle shortcut key press
function handleShortcutKeyPress(key) {
    const keyType = key.dataset.key;
    
    isInteractingWithShortcutBar = true;
    setTimeout(() => {
        isInteractingWithShortcutBar = false;
    }, 1000);

    // Handle special keys with direct action
    if (['up', 'down', 'left', 'right'].includes(keyType)) {
        sendCommand('shortcut', { keys: [keyType] });
        return;
    }

    // Handle modifier keys
    if (['control', 'alt'].includes(keyType)) {
        // Toggle modifier state
        activeModifiers[keyType] = !activeModifiers[keyType];
        
        // Update UI
        if (activeModifiers[keyType]) {
            key.classList.add('active');
            textField.classList.add('shortcut-active');
        } else {
            key.classList.remove('active');
            if (!Object.values(activeModifiers).some(value => value)) {
                textField.classList.remove('shortcut-active');
            }
        }
        
        // Save the current text field value
        lastInputValue = textField.value;
    }
}

// Handle input events in text field to catch all changes
function handleTextFieldInput(e) {
    const hasActiveModifiers = Object.values(activeModifiers).some(value => value);
    
    if (hasActiveModifiers) {
        const newValue = e.target.value;
        let addedChar = '';
        
        if (newValue.length > lastInputValue.length) {
            addedChar = newValue.slice(lastInputValue.length);
        }
        
        // Restore the previous value to prevent text entry
        e.target.value = lastInputValue;
        
        if (addedChar) {
            // Build the shortcut keys
            const keys = [];
            if (activeModifiers.control) keys.push('control');
            if (activeModifiers.alt) keys.push('alt');
            keys.push(addedChar.toLowerCase());
            
            // Send the shortcut command
            sendCommand('shortcut', { keys });
            
            // Reset modifiers after use
            setTimeout(resetModifiers, 500);
        }
    } else {
        // Update the last input value if no modifiers are active
        lastInputValue = e.target.value;
    }
}

// Handle key press in text field when modifiers are active
function handleTextFieldKeyDown(e) {
    const hasActiveModifiers = Object.values(activeModifiers).some(value => value);
    
    if (hasActiveModifiers) {
        // Handle non-printing keys like Enter, Backspace, etc.
        if (e.key.length > 1 && !['Unidentified'].includes(e.key)) {
            e.preventDefault();
            
            // Build array of keys for the shortcut
            const keys = [];
            if (activeModifiers.control) keys.push('control');
            if (activeModifiers.alt) keys.push('alt');
            
            // Map common non-printing keys
            const keyMap = {
                'ArrowUp': 'up',
                'ArrowDown': 'down',
                'ArrowLeft': 'left',
                'ArrowRight': 'right',
                'Enter': 'enter',
                'Backspace': 'backspace',
                'Tab': 'tab',
                'Escape': 'escape'
            };
            
            keys.push(keyMap[e.key] || e.key.toLowerCase());
            
            // Send shortcut command
            sendCommand('shortcut', { keys });
            
            // Reset all modifiers after use
            setTimeout(resetModifiers, 500);
        } else {
            // For regular keys and Unidentified, let the input event handle it
            e.preventDefault();
        }
        
        return false;
    }
    
    return true;
}

// Reset all active modifiers
function resetModifiers() {
    shortcutKeys.forEach(key => {
        const keyType = key.dataset.key;
        if (['control', 'alt'].includes(keyType)) {
            activeModifiers[keyType] = false;
            key.classList.remove('active');
        }
    });
    textField.classList.remove('shortcut-active');
}

// Adjust position on keyboard visibility changes
window.visualViewport?.addEventListener('resize', () => {
    const keyboardHeight = window.innerHeight - window.visualViewport.height;
    
    // Always move both bars when the keyboard is visible
    bottomBar.style.transform = keyboardHeight > 50 ? `translateY(-${keyboardHeight}px)` : 'translateY(0)';
    keyboardShortcutBar.style.transform = bottomBar.style.transform;
    
    // Update the button state if the keyboard appears or disappears
    if (keyboardHeight > 50) {
        // Show keyboard shortcuts bar when keyboard is visible
        if (keyboardShortcutBar.style.display !== 'flex') {
            keyboardShortcutBar.style.display = 'flex';
            kbShortcutsButton.classList.add('active');
        }
    } else {
        // Hide keyboard shortcuts bar when keyboard is hidden
        if (keyboardShortcutBar.style.display !== 'none') {
            keyboardShortcutBar.style.display = 'none';
            kbShortcutsButton.classList.remove('active');
        }
    }
});

// Initialize keyboard shortcut bar when the page loads
window.addEventListener('load', initKeyboardShortcutBar);

// Add Android-specific focus handler
textField.addEventListener('focus', () => {
    // Force show keyboard shortcut bar when text field is focused
    setTimeout(() => {
        // Check for keyboard height and update positions
        const keyboardHeight = window.innerHeight - window.visualViewport.height;
        if (keyboardHeight > 50) {
            bottomBar.style.transform = `translateY(-${keyboardHeight}px)`;
            keyboardShortcutBar.style.transform = bottomBar.style.transform;
            
            // Show the keyboard shortcuts bar
            keyboardShortcutBar.style.display = 'flex';
            kbShortcutsButton.classList.add('active');
        }
    }, 300); // Delay needed for Android keyboard to appear
});

// Add handler for orientation change
window.addEventListener('orientationchange', () => {
    // After orientation change, check the keyboard state
    setTimeout(() => {
        const keyboardHeight = window.innerHeight - window.visualViewport.height;
        
        if (keyboardHeight > 50) {
            // Keyboard is visible after orientation change
            bottomBar.style.transform = `translateY(-${keyboardHeight}px)`;
            keyboardShortcutBar.style.transform = bottomBar.style.transform;
            keyboardShortcutBar.style.display = 'flex';
            kbShortcutsButton.classList.add('active');
        } else {
            // Keyboard is hidden after orientation change
            bottomBar.style.transform = 'translateY(0)';
            keyboardShortcutBar.style.transform = 'translateY(0)';
            keyboardShortcutBar.style.display = 'none';
            kbShortcutsButton.classList.remove('active');
        }
    }, 500); // Longer delay for orientation change
});
