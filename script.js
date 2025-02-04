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

let lastX, lastY, startX, startY, isMoving = false, rightClickTimer;
let mouseSpeed = 4, moveThreshold = 5, rightClickDelay = 500, acceleration = 1.0;
let isLocked = false;
let heartbeatInterval;
let lastClickTime = 0;
const doubleClickDelay = 300; // milliseconds between clicks to count as double-click

function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('touchpadSettings')) || {};
    mouseSpeed = settings.mouseSpeed || 4;
    moveThreshold = settings.moveThreshold || 5;
    rightClickDelay = settings.rightClickDelay || 500;
    acceleration = settings.acceleration || 1.0;
    
    mouseSpeedInput.value = mouseSpeed * 10;
    moveThresholdInput.value = moveThreshold;
    rightClickDelayInput.value = rightClickDelay;
    accelerationInput.value = acceleration * 10;
    darkModeToggle.checked = settings.darkMode || false;
    
    document.getElementById('doubleClickDelay').value = doubleClickDelay;
    
    document.body.classList.toggle('dark-theme', darkModeToggle.checked);
}

function saveSettings() {
    const settings = {
        mouseSpeed,
        moveThreshold,
        rightClickDelay,
        acceleration,
        darkMode: darkModeToggle.checked
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
            // Keyboard is open - only move up by the keyboard height
            bottomBar.style.transform = `translateY(-${keyboardHeight}px)`;
        } else {
            // Keyboard is closed
            bottomBar.style.transform = 'translateY(0)';
        }
    }
}

// Add viewport change listeners after the textField focus listener
window.visualViewport?.addEventListener('resize', adjustBottomBarPosition);
window.visualViewport?.addEventListener('scroll', adjustBottomBarPosition);

// Update the existing textField focus listener
textField.addEventListener('focus', () => {
    setTimeout(adjustBottomBarPosition, 100);
});

// Add blur listener to ensure bar returns when keyboard is dismissed
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

touchpad.addEventListener('pointerdown', handlePointerDown);
touchpad.addEventListener('pointermove', handlePointerMove);
touchpad.addEventListener('pointerup', handlePointerUp);
leftClick.addEventListener('click', () => sendCommand('leftClick'));
rightClick.addEventListener('click', () => sendCommand('rightClick'));
sendButton.addEventListener('click', sendText);
copyButton.addEventListener('click', copyText);
lockButton.addEventListener('click', toggleLock);

document.getElementById('ctrlC').addEventListener('click', () => sendCommand('shortcut', { keys: ['control', 'c'] }));
document.getElementById('ctrlV').addEventListener('click', () => sendCommand('shortcut', { keys: ['control', 'v'] }));
document.getElementById('ctrlA').addEventListener('click', () => sendCommand('shortcut', { keys: ['control', 'a'] }));

function handlePointerDown(e) {
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    isMoving = false;
    
    const currentTime = new Date().getTime();
    const timeDiff = currentTime - lastClickTime;
    
    if (timeDiff < doubleClickDelay) {
        // Double click detected - start drag mode
        e.preventDefault(); // Prevent the second click
        isLocked = true;
        lockButton.innerHTML = '<i class="fas fa-lock"></i>';
        sendCommand('mouseDown');
        isMoving = true; // Prevent the click from registering
    } else {
        // Single click handling
        if (!isLocked) {
            rightClickTimer = setTimeout(() => {
                if (!isMoving) {
                    sendCommand('rightClick');
                    isMoving = true;
                }
            }, rightClickDelay);
        }
    }
    
    lastClickTime = currentTime;
}

function handlePointerMove(e) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const totalMovement = Math.sqrt(Math.pow(e.clientX - startX, 2) + Math.pow(e.clientY - startY, 2));

    if (totalMovement > moveThreshold) {
        isMoving = true;
        if (!isLocked) {
            clearTimeout(rightClickTimer);
        }
        const acceleratedDx = applyAcceleration(dx);
        const acceleratedDy = applyAcceleration(dy);
        sendCommand('move', { dx: acceleratedDx * mouseSpeed, dy: acceleratedDy * mouseSpeed });
    }

    lastX = e.clientX;
    lastY = e.clientY;
}

function handlePointerUp() {
    if (!isLocked) {
        clearTimeout(rightClickTimer);
        if (!isMoving) {
            sendCommand('leftClick');
        }
        isMoving = false;
    } else if (isLocked && new Date().getTime() - lastClickTime > doubleClickDelay) {
        // Release drag mode only if we're not in a double-click sequence
        isLocked = false;
        lockButton.innerHTML = '<i class="fas fa-lock-open"></i>';
        sendCommand('mouseUp');
    }
}

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
    }, 30000); // Send heartbeat every 30 seconds
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

// Add this event listener after the other textField event listeners
textField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Prevent newline
        if (textField.value === '') {
            // If input is empty, send Enter key
            sendCommand('shortcut', { keys: ['enter'] });
        } else {
            // If input has text, send the text
            sendText();
        }
    } else if (e.key === 'Backspace' && textField.value === '') {
        e.preventDefault(); // Prevent default backspace
        sendCommand('shortcut', { keys: ['backspace'] });
    }
});

reloadButton.addEventListener('click', () => {
    location.reload();
});