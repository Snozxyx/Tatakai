const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const logDir = path.join(app.getPath('userData'), 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'app.log');

// Rotation: If log file is > 5MB, rename it to app.old.log
try {
    if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > 5 * 1024 * 1024) {
            const oldLog = path.join(logDir, 'app.old.log');
            if (fs.existsSync(oldLog)) fs.unlinkSync(oldLog);
            fs.renameSync(logFile, oldLog);
        }
    }
} catch (e) {
    console.error('Failed to rotate logs:', e);
}

function formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [${level}] ${message}`;
    if (data) {
        try {
            logLine += ` ${JSON.stringify(data)}`;
        } catch (e) {
            logLine += ` [Circular/Unserializable]`;
        }
    }
    return logLine + '\n';
}

function write(level, message, data) {
    const line = formatMessage(level, message, data);
    
    // Also print to console for dev
    if (process.env.NODE_ENV === 'development') {
        console.log(line.trim());
    }

    try {
        fs.appendFileSync(logFile, line);
    } catch (e) {
        console.error('Failed to write to log file:', e);
    }
}

module.exports = {
    info: (msg, data) => write('INFO', msg, data),
    error: (msg, data) => write('ERROR', msg, data),
    warn: (msg, data) => write('WARN', msg, data),
    debug: (msg, data) => write('DEBUG', msg, data),
    getLogPath: () => logFile
};
