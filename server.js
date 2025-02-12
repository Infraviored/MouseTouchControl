import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import robotjs from 'robotjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        await handleCommand(data);
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

async function handleCommand(data) {
    switch (data.command) {
        case 'move':
            const mouse = robotjs.getMousePos();
            robotjs.moveMouse(
                Math.round(mouse.x + data.dx),
                Math.round(mouse.y + data.dy)
            );
            break;
        case 'leftClick':
            robotjs.mouseClick();
            console.log('Left click');
            break;
        case 'rightClick':
            robotjs.mouseClick('right');
            console.log('Right click');
            break;
        case 'mouseDown':
            robotjs.mouseToggle('down');
            console.log('Mouse down');
            break;
        case 'mouseUp':
            robotjs.mouseToggle('up');
            console.log('Mouse up');
            break;
        case 'typeAll':
            const clipboardy = await import('clipboardy');
            await clipboardy.default.write(data.text);
            robotjs.keyTap('v', 'control');
            console.log('Pasted all:', data.text);
            break;
        case 'copy':
            const clipboardyCopy = await import('clipboardy');
            await clipboardyCopy.default.write(data.text);
            console.log('Copied to clipboard:', data.text);
            break;
        case 'shortcut':
            if (data.keys && data.keys.length > 1) {
                const modifiers = data.keys.slice(0, -1);
                const key = data.keys[data.keys.length - 1];
                robotjs.keyTap(key, modifiers);
            } else if (data.keys && data.keys.length === 1) {
                robotjs.keyTap(data.keys[0]);
            }
            console.log('Shortcut:', data.keys.join(' + '));
            break;
        case 'scroll':
            robotjs.scrollMouse(data.dx, data.dy);
            console.log('Scrolled by:', data.dx, data.dy);
            break;
        default:
            console.log(`Unknown command: ${data.command}`);
    }
}

const PORT = 1234;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
