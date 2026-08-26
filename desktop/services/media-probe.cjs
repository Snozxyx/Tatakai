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

/**
 * Wall-clock budget for a subtitle extraction, by where the input lives.
 *
 * Extraction is not a header read — it has to walk the container to the end to
 * collect every cue, so the budget is a function of read speed, not file size.
 * A miss is not fatal: the deadline handler keeps whatever cues were already
 * written (see `hasRealSubtitles`), so a generous budget buys completeness while
 * a short one silently truncates the track.
 */
const SUBTITLE_TIMEOUT_LOCAL_STREAM_MS = 60000;
const SUBTITLE_TIMEOUT_REMOTE_MS = 20000;

/** Demuxer budget for reading over a socket, where seeks are expensive. */
const STREAM_SUBTITLE_ANALYZE_US = '10000000';
const STREAM_SUBTITLE_PROBE_US = '10000000';

/**
 * Is this one of our own loopback servers?
 *
 * Deliberately host-based rather than a list of ports. The app runs at least
 * four loopback servers in front of the same media and only one of them has a
 * fixed port: the torrent stream server is 8888, but the HLS remuxer is 8890
 * (`torrent/streaming/hls-remux.cjs`), the media stream server starts at 18989
 * and falls back to `18989 + random(1000)` on EADDRINUSE (`ipc/ipc-library.cjs`),
 * and the local proxy binds port 0 — a different port every launch. A port list
 * therefore misclassified the two most common torrent-playback URLs as *remote*
 * and handed them the small, fast budget meant for a real CDN, which is why
 * torrent subtitle extraction returned `timeout_no_cues` on a file that was
 * sitting on the local disk.
 */
function isLoopbackUrl(value) {
    if (typeof value !== 'string') return false;
    try {
        const host = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, '');
        return host === 'localhost' || host === '::1' || /^127\./.test(host);
    } catch {
        return false;
    }
}

/**
 * An HLS manifest cannot be a subtitle source.
 *
 * The remuxer builds each variant with `-map 0:v -map 0:a:N -c copy`, so the
 * playlist it publishes contains exactly one video and one audio stream and no
 * subtitles at all. Asking it for absolute stream 7 either maps the wrong thing
 * or fails outright, and the failure looks identical to a timeout — worth naming
 * explicitly so the caller can fall back to the container.
 */
function isHlsManifestUrl(value) {
    return typeof value === 'string' && /\.m3u8(?:[?#]|$)/i.test(value);
}

/**
 * `blob:` and `mediasource:` URLs belong to the renderer's MSE buffer, not to
 * anything ffmpeg can open. hls.js sets `video.src` to one of these the moment
 * it calls `attachMedia`, so a caller that reads `video.src` while HLS is
 * playing hands us an un-openable URL.
 */
function isRendererOnlyUrl(value) {
    return typeof value === 'string' && /^(blob|mediasource|data):/i.test(value);
}

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
            if (isRendererOnlyUrl(url)) {
                this._logger.warn('[MediaProbe] Refusing subtitle extraction from a renderer-only URL:', String(url).slice(0, 48));
                return resolve({ success: false, error: 'unopenable_source' });
            }
            if (isHlsManifestUrl(url)) {
                this._logger.warn('[MediaProbe] Refusing subtitle extraction from an HLS manifest — it carries no subtitle streams');
                return resolve({ success: false, error: 'hls_manifest_has_no_subtitles' });
            }

            // A file on disk, or one of our own loopback servers reading from
            // disk — either way the bytes are local and worth a real budget.
            const isLocalFile = fs.existsSync(url);
            const isLocalStream = !isLocalFile && isLoopbackUrl(url);

            const inputOptions = isLocalFile
                ? [
                    '-analyzeduration', '10000000',
                    '-probesize', '10000000'
                ]
                : (isLocalStream
                    ? [
                        '-analyzeduration', STREAM_SUBTITLE_ANALYZE_US,
                        '-probesize', STREAM_SUBTITLE_PROBE_US,
                        '-rw_timeout', '30000000',
                        '-timeout', '30000000'
                      ]
                    : [
                        '-analyzeduration', STREAM_SUBTITLE_ANALYZE_US,
                        '-probesize', STREAM_SUBTITLE_PROBE_US,
                        '-rw_timeout', '15000000',
                        '-timeout', '15000000'
                    ]);

            // `-map 0:s:N?` where the caller passes an absolute stream index is
            // wrong, so the index is used as-is against the whole stream list —
            // it comes straight from `probe()`, which reports `s.index`.
            // The trailing `?` keeps ffmpeg from aborting if the index turns out
            // not to exist in this input, letting the empty-output path report a
            // clearer error than a raw ffmpeg exit.
            const command = ffmpeg(url)
                .inputOptions(inputOptions)
                .outputOptions([
                    `-map 0:${trackIndex}?`,
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

            // Even a local file gets a deadline. A torrent file that is only
            // partially downloaded reads fine up to the first hole and then
            // blocks forever on the piece behind it, and with no timer that hung
            // ffmpeg was never reaped and the promise never settled.
            const timeoutMs = isLocalFile
                ? SUBTITLE_TIMEOUT_LOCAL_STREAM_MS
                : (isLocalStream ? SUBTITLE_TIMEOUT_LOCAL_STREAM_MS : SUBTITLE_TIMEOUT_REMOTE_MS);
            const timeoutId = setTimeout(() => {
                try { command.kill('SIGKILL'); } catch (_) {}
                // Partial cues still beat none — the user gets subtitles for as
                // far as the extraction got, which for a sequential read is the
                // start of the episode.
                if (hasRealSubtitles()) {
                    this._logger.warn(`[MediaProbe] Subtitle extraction hit ${timeoutMs}ms — keeping partial cues`);
                    finalize({ success: true, path: outputPath, partial: true });
                    return;
                }
                finalize({ success: false, error: 'timeout_no_cues' });
            }, timeoutMs);

            command
                .output(outputPath)
                .on('end', () => {
                    clearTimeout(timeoutId);
                    if (hasRealSubtitles()) {
                        finalize({ success: true, path: outputPath });
                    } else {
                        finalize({ success: false, error: 'empty_subtitle_file' });
                    }
                })
                .on('error', (err) => {
                    clearTimeout(timeoutId);
                    if (hasRealSubtitles()) {
                        finalize({ success: true, path: outputPath, partial: true });
                        return;
                    }
                    this._logger.error('[MediaProbe] Subtitle extraction failed:', err.message);
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
