const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Track active ffmpeg processes for cancellation
const activeProcesses = new Map();

// Helper functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTime(seconds) {
    if (seconds < 60) return Math.round(seconds) + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + Math.round(seconds % 60) + 's';
    return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
}

/**
 * Downloads an M3U8 stream and converts it to MP4
 * @param {Object} options 
 * @param {string} options.url - M3U8 URL
 * @param {string} options.output - Full path for output .mp4
 * @param {Object} options.headers - Custom headers for the request
 * @param {Function} options.onProgress - Progress callback
 * @param {string} options.episodeId - Unique episode ID for tracking
 */
async function downloadEpisode({ url, output, headers = {}, onProgress, episodeId }) {
    return new Promise((resolve, reject) => {
        // Ensure directory exists
        const dir = path.dirname(output);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Check if file already exists and is valid
        if (fs.existsSync(output)) {
            const stats = fs.statSync(output);
            if (stats.size > 1024) { // > 1KB indicates valid file
                console.log('File already exists, skipping download:', output);
                onProgress && onProgress(100);
                resolve(output);
                return;
            }
            // Remove empty/corrupted file
            fs.unlinkSync(output);
        }

        console.log('========== DOWNLOAD START ==========');
        console.log('URL:', url);
        console.log('Output:', output);
        console.log('Headers:', JSON.stringify(headers, null, 2));

        // Create temp file path for atomic download
        // Use path.resolve and normalize to handle spaces properly
        const normalizedOutput = path.resolve(output);
        const tempOutput = normalizedOutput + '.tmp';
        
        // Remove any existing temp file
        if (fs.existsSync(tempOutput)) {
            fs.unlinkSync(tempOutput);
        }

        // Set up ffmpeg command
        const command = ffmpeg(url);

        // User agent handling
        const userAgent = headers['User-Agent'] || headers['user-agent'] || 
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

        // Build input options
        const inputOptions = [
            '-user_agent', userAgent,
            '-analyzeduration', '10000000',
            '-probesize', '10000000'
        ];

        // Add headers (skip User-Agent as it's set separately)
        const headerEntries = Object.entries(headers).filter(([k]) => 
            !k.toLowerCase().includes('user-agent')
        );
        
        if (headerEntries.length > 0) {
            const headerString = headerEntries
                .map(([k, v]) => `${k}: ${v}`)
                .join('\r\n');
            inputOptions.push('-headers', headerString + '\r\n');
        }

        // Add protocol whitelist for m3u8
        inputOptions.push(
            '-protocol_whitelist', 'file,http,https,tcp,tls,crypto'
        );

        command.inputOptions(inputOptions);

        // Output options - copy codecs for speed
        // Explicitly specify format as mp4 to handle paths with special characters
        command.outputOptions([
            '-f', 'mp4',  // Force MP4 format (handles .tmp extension and special chars)
            '-c', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            '-movflags', '+faststart',
            '-map', '0:v:0',  // Map best video stream
            '-map', '0:a:0',  // Map best audio stream
            '-map', '0:s?',   // Map subtitle streams if available (optional)
            '-c:s', 'mov_text', // Convert subtitles to mov_text format for MP4
            '-y' // Overwrite output
        ]);

        // Quote the output path for Windows paths with special characters
        command.output(tempOutput);

        // Progress tracking
        let lastProgress = 0;
        let lastProgressTime = Date.now();
        let lastBytes = 0;
        let downloadStartTime = Date.now();
        let hasReceivedData = false;
        let totalDuration = 0;

        command.on('start', (cmdLine) => {
            console.log('FFmpeg command:', cmdLine);
            downloadStartTime = Date.now();
        });

        command.on('stderr', (line) => {
            // Log important messages, filter progress spam
            if (line.includes('Error') || line.includes('error') || 
                line.includes('failed') || line.includes('Failed') ||
                line.includes('Opening') || line.includes('Stream')) {
                console.log('FFmpeg:', line);
            }
            
            // Parse duration info for accurate progress
            if (line.includes('Duration:')) {
                hasReceivedData = true;
                console.log('FFmpeg:', line);
                // Parse duration: "Duration: 00:24:15.03"
                const match = line.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
                if (match) {
                    totalDuration = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
                    console.log('Total duration:', totalDuration, 'seconds');
                }
            }
        });

        command.on('progress', (progress) => {
            hasReceivedData = true;
            
            let percent = 0;
            let currentSeconds = 0;
            
            // Parse timemark (HH:MM:SS.ms) - most reliable
            if (progress.timemark) {
                const parts = progress.timemark.split(':');
                if (parts.length === 3) {
                    currentSeconds = parseInt(parts[0]) * 3600 + 
                                   parseInt(parts[1]) * 60 + 
                                   parseFloat(parts[2]);
                    
                    if (totalDuration > 0) {
                        percent = Math.min(Math.round((currentSeconds / totalDuration) * 100), 99);
                    } else {
                        // Estimate assuming ~24 min episode
                        percent = Math.min(Math.round((currentSeconds / 1440) * 100), 99);
                    }
                }
            } else if (progress.percent && progress.percent > 0) {
                percent = Math.min(Math.round(progress.percent), 99);
            }

            // Calculate speed
            const now = Date.now();
            const elapsedSec = (now - downloadStartTime) / 1000;
            let speed = 0;
            let speedText = '';
            
            // Estimate bytes based on progress (assuming ~300MB for HD episode)
            const estimatedTotalBytes = 300 * 1024 * 1024;
            const currentBytes = (percent / 100) * estimatedTotalBytes;
            
            if (elapsedSec > 0) {
                speed = currentBytes / elapsedSec; // bytes per second
                if (speed > 1024 * 1024) {
                    speedText = (speed / (1024 * 1024)).toFixed(1) + ' MB/s';
                } else if (speed > 1024) {
                    speedText = (speed / 1024).toFixed(0) + ' KB/s';
                } else {
                    speedText = speed.toFixed(0) + ' B/s';
                }
            }

            // Calculate ETA
            let eta = '';
            if (percent > 0 && speed > 0) {
                const remainingBytes = estimatedTotalBytes - currentBytes;
                const remainingSec = remainingBytes / speed;
                if (remainingSec < 60) {
                    eta = Math.round(remainingSec) + 's';
                } else if (remainingSec < 3600) {
                    eta = Math.round(remainingSec / 60) + 'm ' + Math.round(remainingSec % 60) + 's';
                } else {
                    eta = Math.round(remainingSec / 3600) + 'h ' + Math.round((remainingSec % 3600) / 60) + 'm';
                }
            }

            // Only send updates when progress changes or every 2 seconds
            if (percent > lastProgress || (now - lastProgressTime > 2000)) {
                lastProgress = percent;
                lastProgressTime = now;
                onProgress && onProgress({
                    percent,
                    speed: speedText,
                    eta,
                    downloaded: formatBytes(currentBytes),
                    elapsed: formatTime(elapsedSec)
                });
                console.log(`Progress: ${percent}% | Speed: ${speedText} | ETA: ${eta}`);
            }
        });

        command.on('error', (err, stdout, stderr) => {
            console.error('========== DOWNLOAD ERROR ==========');
            console.error('Error:', err.message);
            if (stderr) console.error('Stderr:', stderr.slice(-500));
            
            // Clean up temp file
            if (fs.existsSync(tempOutput)) {
                try { fs.unlinkSync(tempOutput); } catch (e) {}
            }
            
            activeProcesses.delete(episodeId);
            reject(err);
        });

        command.on('end', () => {
            console.log('========== DOWNLOAD END ==========');
            
            // Check if temp file exists and has content
            if (!fs.existsSync(tempOutput)) {
                reject(new Error('Download failed: No output file created'));
                return;
            }

            const stats = fs.statSync(tempOutput);
            console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

            if (stats.size < 1024) { // Less than 1KB is definitely wrong
                fs.unlinkSync(tempOutput);
                reject(new Error('Download failed: File is too small'));
                return;
            }

            // Move temp file to final location
            try {
                fs.renameSync(tempOutput, normalizedOutput);
                console.log('Download completed:', normalizedOutput);
                onProgress && onProgress(100);
                activeProcesses.delete(episodeId);
                resolve(normalizedOutput);
            } catch (err) {
                console.error('Failed to move file:', err);
                reject(err);
            }
        });

        // Store process reference for cancellation
        if (episodeId) {
            activeProcesses.set(episodeId, command);
        }

        // Start download with timeout check
        command.run();
        
        // Timeout check - if no data received in 30 seconds, something is wrong
        setTimeout(() => {
            if (!hasReceivedData) {
                console.error('Download timeout - no data received in 30 seconds');
                try {
                    command.kill('SIGKILL');
                } catch (e) {}
            }
        }, 30000);
    });
}

/**
 * Cancel an active download
 * @param {string} episodeId - Episode ID to cancel
 */
function cancelDownload(episodeId) {
    const process = activeProcesses.get(episodeId);
    if (process) {
        try {
            process.kill('SIGKILL');
            activeProcesses.delete(episodeId);
            return true;
        } catch (err) {
            console.error('Failed to cancel download:', err);
            return false;
        }
    }
    return false;
}

/**
 * Downloads a file (poster/subtitle) to a local path
 * @param {string} url - URL to download from
 * @param {string} outputPath - Local file path to save to
 * @param {Object} options - Additional options (headers, timeout, etc.)
 */
async function downloadFile(url, outputPath, options = {}) {
    console.log('Downloading file:', { url, outputPath });
    
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Skip if file already exists and is not empty
    if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 0) {
            console.log('File already exists, skipping:', outputPath);
            return outputPath;
        }
    }

    const writer = fs.createWriteStream(outputPath);
    
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: options.timeout || 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                ...options.headers
            },
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 400
        });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                // Verify file was downloaded successfully
                if (fs.existsSync(outputPath)) {
                    const stats = fs.statSync(outputPath);
                    if (stats.size > 0) {
                        console.log(`File downloaded successfully: ${outputPath} (${stats.size} bytes)`);
                        resolve(outputPath);
                    } else {
                        console.error('Downloaded file is empty');
                        fs.unlinkSync(outputPath);
                        reject(new Error('Downloaded file is empty'));
                    }
                } else {
                    reject(new Error('File not found after download'));
                }
            });
            
            writer.on('error', (err) => {
                console.error('Write error:', err);
                // Clean up partial file
                if (fs.existsSync(outputPath)) {
                    try {
                        fs.unlinkSync(outputPath);
                    } catch (cleanupErr) {
                        console.error('Failed to clean up partial file:', cleanupErr);
                    }
                }
                reject(err);
            });

            response.data.on('error', (err) => {
                console.error('Stream error:', err);
                writer.destroy();
                reject(err);
            });
        });
    } catch (error) {
        console.error('Download failed:', error);
        writer.destroy();
        // Clean up partial file
        if (fs.existsSync(outputPath)) {
            try {
                fs.unlinkSync(outputPath);
            } catch (cleanupErr) {
                console.error('Failed to clean up partial file:', cleanupErr);
            }
        }
        throw error;
    }
}

module.exports = {
    downloadEpisode,
    downloadFile,
    cancelDownload
};
