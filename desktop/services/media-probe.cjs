'use strict';

const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');

const ffmpegPath = ffmpegInstaller.path;
ffmpeg.setFfmpegPath(ffmpegPath);

// Try to set ffprobe path by looking in the same directory as ffmpeg
const ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
if (fs.existsSync(ffprobePath)) {
    ffmpeg.setFfprobePath(ffprobePath);
}

const STREAM_SUBTITLE_TIMEOUT_MS = 3500;
const STREAM_SUBTITLE_ANALYZE_US = '200000';
const STREAM_SUBTITLE_PROBE_US = '200000';
const STREAM_SUBTITLE_READ_INTERVAL = '0%+300';

/**
 * MediaProbeService — provides metadata and track extraction for media files.
 */
class MediaProbeService {
    constructor(logger) {
        this._logger = logger;
        this._probeCache = new Map();
        this._probeCacheTtlMs = 15000;
        this._missingFfprobeWarned = false;
    }

    /**
     * Probe a media URL/file to get track information.
     * @param {string} url 
     * @returns {Promise<{ success: boolean, tracks?: any, format?: any, error?: string }>}
     */
    async probe(url) {
        return new Promise((resolve) => {
            const cacheKey = String(url || '').trim();
            const cached = this._probeCache.get(cacheKey);
            if (cached && (Date.now() - cached.ts) < this._probeCacheTtlMs) {
                return resolve(cached.value);
            }

            const resolveWithCache = (value) => {
                if (value?.success && Array.isArray(value.tracks) && value.tracks.length > 0) {
                    this._probeCache.set(cacheKey, { ts: Date.now(), value });
                }
                resolve(value);
            };

            // If ffprobe is missing, try to use ffmpeg -i as fallback
            const hasFfprobe = typeof ffmpeg.setFfprobePath === 'function' && fs.existsSync(ffprobePath);

            if (!hasFfprobe) {
                if (!this._missingFfprobeWarned) {
                    this._logger.warn('[MediaProbe] ffprobe missing, falling back to ffmpeg metadata extraction');
                    this._missingFfprobeWarned = true;
                }
                const { spawn } = require('child_process');
                
                // Use more robust arguments for fallback probe
                const proc = spawn(ffmpegPath, [
                    '-hide_banner', 
                    '-analyzeduration', '2000000',
                    '-probesize', '2000000',
                    '-i', url
                ]);
                
                let output = '';
                proc.stderr.on('data', (data) => { output += data.toString(); });
                
                // Timeout after 10s if ffmpeg hangs
                const timeout = setTimeout(() => {
                    proc.kill('SIGKILL');
                    resolveWithCache({ success: false, error: 'Probe timeout' });
                }, 7000);

                proc.on('close', () => {
                    clearTimeout(timeout);
                    const tracks = [];
                    
                    // Improved regex to catch more variations of ffmpeg output
                    const streamRegex = /Stream #\d+:(\d+)(?:\((.*?)\))?: (Audio|Subtitle|Video): (.*)/gi;
                    let match;
                    while ((match = streamRegex.exec(output)) !== null) {
                        const [_, index, lang, type, codecInfo] = match;
                        const tType = type.toLowerCase();
                        
                        // Extract title/language from codec info if possible
                        let title = `${type} track ${index}`;
                        let language = lang || 'und';
                        
                        // Try to find title in metadata lines (usually following the stream line)
                        const metadataMatch = output.slice(match.index).split('Stream #')[0].match(/title\s*:\s*(.*)/i);
                        if (metadataMatch) title = metadataMatch[1].trim();

                        tracks.push({
                            index: parseInt(index),
                            type: tType,
                            codec: codecInfo.split(' ')[0].replace(/,/, ''),
                            language: language,
                            title: title,
                            default: codecInfo.includes('(default)'),
                            forced: codecInfo.includes('(forced)')
                        });
                    }
                    
                    if (tracks.length > 0) {
                        this._logger.info(`[MediaProbe] Fallback detected ${tracks.length} tracks`);
                        resolveWithCache({ success: true, tracks });
                    } else {
                        this._logger.warn('[MediaProbe] Fallback failed to detect tracks. Output sample:', output.slice(0, 200));
                        resolveWithCache({ success: false, error: 'ffprobe missing and ffmpeg fallback failed' });
                    }
                });
                return;
            }

            // Increase analyze duration and probe size for remote/torrent streams
            const options = [
                '-analyzeduration', '3000000',
                '-probesize', '3000000',
                '-timeout', '15000000'           // 15s (microseconds)
            ];
            
            ffmpeg.ffprobe(url, options, (err, metadata) => {
                if (err) {
                    this._logger.error(`[MediaProbe] Probe failed for ${url}:`, err.message);
                    return resolveWithCache({ success: false, error: err.message });
                }

                const tracks = (metadata.streams || []).map((s, idx) => ({
                    index: s.index,
                    type: s.codec_type, // 'video', 'audio', 'subtitle'
                    codec: s.codec_name,
                    language: s.tags?.language || s.tags?.LANGUAGE || 'und',
                    title: s.tags?.title || s.tags?.TITLE || `${s.codec_type} track ${idx}`,
                    default: !!(s.disposition?.default),
                    forced: !!(s.disposition?.forced),
                }));

                resolveWithCache({
                    success: true,
                    tracks,
                    format: metadata.format,
                });
            });
        });
    }

    /**
     * Extract a subtitle track as VTT.
     * @param {string} url 
     * @param {number} trackIndex 
     * @param {string} outputPath 
     * @returns {Promise<{ success: boolean, path?: string, error?: string }>}
     */
    async extractSubtitle(url, trackIndex, outputPath) {
        return new Promise((resolve) => {
            // Check if URL is a local file path or our local stream servers
            const isLocalFile = fs.existsSync(url);
            const isLocalTorrentStream = typeof url === 'string' && (url.includes('127.0.0.1:8888') || url.includes('localhost:8888'));
            // Our local media stream server (ipc-library.cjs) runs on port 18989
            const isLocalMediaStream = typeof url === 'string' && (url.includes('127.0.0.1:18989') || url.includes('localhost:18989'));
            const isAnyLocalStream = isLocalTorrentStream || isLocalMediaStream;

            const inputOptions = isLocalFile
                ? [
                    '-analyzeduration',
                    '750000',
                    '-probesize',
                    '750000'
                ]
                : (isAnyLocalStream
                    ? [
                        '-analyzeduration', '3000000',
                        '-probesize', '3000000',
                        '-fflags', '+nobuffer',
                        '-rw_timeout', '10000000',
                        '-timeout', '10000000'
                      ]
                    : [
                        '-analyzeduration', STREAM_SUBTITLE_ANALYZE_US,
                        '-probesize', STREAM_SUBTITLE_PROBE_US,
                        '-read_intervals', STREAM_SUBTITLE_READ_INTERVAL,
                        '-fflags', '+nobuffer',
                        '-rw_timeout', '4000000',
                        '-timeout', '4000000'
                    ]);

            // Optimization: For local files, we can extract much faster
            // For remote/stream URLs, cap runtime and probe size to avoid long waits.
            const command = ffmpeg(url)
                .inputOptions(inputOptions)
                .outputOptions([
                    `-map 0:${trackIndex}`,
                    '-f webvtt',
                    '-v quiet',
                    '-map_metadata -1',
                    '-map_chapters -1'
                ]);

            const hasRealSubtitles = () => {
                try {
                    if (!fs.existsSync(outputPath)) return false;
                    const stat = fs.statSync(outputPath);
                    if (stat.size < 30) return false; // Too small to contain any cues
                    // Check if the file contains actual subtitle cues (timestamps with -->)
                    const content = fs.readFileSync(outputPath, 'utf8');
                    return content.includes('-->');
                } catch {
                    return false;
                }
            };

            let settled = false;
            const finalize = (result) => {
                if (settled) return;
                settled = true;
                resolve(result);
            };

            let timeoutId = null;
            if (!isLocalFile) {
                const timeoutMs = isAnyLocalStream ? 15000 : STREAM_SUBTITLE_TIMEOUT_MS;
                timeoutId = setTimeout(() => {
                    try { command.kill('SIGKILL'); } catch (_) {}
                    if (hasRealSubtitles()) {
                        finalize({ success: true, path: outputPath });
                        return;
                    }
                    finalize({ success: false, error: 'timeout_no_cues' });
                }, timeoutMs);
            }

            command
                .output(outputPath)
                .on('end', () => {
                    if (timeoutId) clearTimeout(timeoutId);
                    if (hasRealSubtitles()) {
                        finalize({ success: true, path: outputPath });
                    } else {
                        finalize({ success: false, error: 'empty_subtitle_file' });
                    }
                })
                .on('error', (err) => {
                    if (timeoutId) clearTimeout(timeoutId);
                    this._logger.error('[MediaProbe] Subtitle extraction failed:', err.message);
                    if (hasRealSubtitles()) {
                        finalize({ success: true, path: outputPath });
                        return;
                    }
                    finalize({ success: false, error: err.message });
                })
                .run();
        });
    }

    /**
     * Extract an audio track as AAC/M4A (progressive, suitable for local playback).
     * @param {string} url
     * @param {number} trackIndex
     * @param {string} outputPath
     * @returns {Promise<{ success: boolean, path?: string, error?: string }>}
     */
    async extractAudioTrack(url, trackIndex, outputPath) {
        return new Promise((resolve) => {
            const isLocalFile = fs.existsSync(url);

            const command = ffmpeg(url)
                .inputOptions([
                    '-analyzeduration',
                    '750000',
                    '-probesize',
                    '750000'
                ])
                .outputOptions([
                    `-map 0:${trackIndex}`,
                    '-vn',
                    '-c:a aac',
                    '-b:a 192k',
                    '-movflags +faststart',
                    '-map_metadata -1',
                    '-map_chapters -1'
                ]);

            if (!isLocalFile) {
                command.inputOptions(['-timeout 10000000']);
            }

            command
                .output(outputPath)
                .on('end', () => {
                    resolve({ success: true, path: outputPath });
                })
                .on('error', (err) => {
                    this._logger.error('[MediaProbe] Audio extraction failed:', err.message);
                    resolve({ success: false, error: err.message });
                })
                .run();
        });
    }
}

module.exports = { MediaProbeService };
