'use strict';

const fs = require('fs');
const path = require('path');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.webm']);

/**
 * Recursively scans a directory for video files.
 * @param {string} dirPath - The directory to scan.
 * @param {string[]} files - Array to accumulate file paths.
 * @returns {Promise<string[]>}
 */
async function scanDirectoryForVideos(dirPath, files = []) {
    try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            // Skip hidden files/directories
            if (entry.name.startsWith('.')) continue;

            if (entry.isDirectory()) {
                await scanDirectoryForVideos(fullPath, files);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (VIDEO_EXTENSIONS.has(ext)) {
                    files.push(fullPath);
                }
            }
        }
    } catch (err) {
        console.error(`[FileScanner] Error scanning directory ${dirPath}:`, err.message);
    }

    return files;
}

module.exports = {
    scanDirectoryForVideos
};
