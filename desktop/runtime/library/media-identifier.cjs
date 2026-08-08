'use strict';

const path = require('path');
const { parseReleaseName } = require('../torrent/naming/release-parser.cjs');

/**
 * Parses video file names to extract anime title, episode, and metadata.
 * @param {string[]} filePaths - Array of absolute file paths.
 * @returns {Array<Object>} Array of parsed media objects.
 */
function identifyMediaFiles(filePaths) {
    const results = [];

    for (const filePath of filePaths) {
        const fileName = path.basename(filePath);
        
        // Use the existing torrent release parser to extract info
        const parsed = parseReleaseName(fileName);
        
        if (parsed.title) {
            results.push({
                absolutePath: filePath,
                fileName: fileName,
                title: parsed.title,
                searchTitle: parsed.searchTitle,
                episode: parsed.episodeNumber !== null ? parsed.episodeNumber : null,
                season: parsed.season,
                quality: parsed.resolution,
                source: parsed.source,
                releaseGroup: parsed.releaseGroup,
                subtitleFormats: parsed.subtitleFormats,
                isBatch: parsed.isBatch,
                fileExtension: path.extname(fileName)
            });
        } else {
            // Fallback for completely unrecognizable files
            results.push({
                absolutePath: filePath,
                fileName: fileName,
                title: fileName.replace(path.extname(fileName), ''),
                searchTitle: fileName.replace(path.extname(fileName), ''),
                episode: null,
                season: null,
                quality: null,
                source: null,
                isBatch: false,
                fileExtension: path.extname(fileName)
            });
        }
    }

    return results;
}

/**
 * Groups identified files by their parsed anime title.
 * @param {Array<Object>} identifiedFiles - Output of identifyMediaFiles.
 * @returns {Record<string, Array<Object>>} Grouped by title.
 */
function groupMediaBySeries(identifiedFiles) {
    const seriesMap = {};

    for (const file of identifiedFiles) {
        // Normalize title for grouping (lowercase, remove punctuation)
        const normalizedTitle = String(file.searchTitle || file.title || '')
            .toLowerCase()
            .replace(/[_\-\.]/g, ' ')
            .replace(/\[.*?\]/g, '')
            .replace(/\(.*?\)/g, '')
            .replace(/\b(s\d{1,2}e\d{1,3}|episode\s*\d{1,3}|ep\.?\s*\d{1,3}|e\d{1,3}|\d{1,4}v\d+)\b/g, ' ')
            .replace(/\b(2160p|1080p|720p|540p|480p|x264|x265|h\.??264|h\.??265|hevc|avc|aac|flac|ac3|dts|truehd|web[- ]?dl|web[- ]?rip|blu[- ]?ray|hdtv)\b/g, ' ')
            .replace(/\b\d{1,4}\b/g, ' ')
            .trim();

        if (!seriesMap[normalizedTitle]) {
            seriesMap[normalizedTitle] = {
                displayTitle: file.title,
                files: []
            };
        }
        seriesMap[normalizedTitle].files.push(file);
    }

    // Sort files in each series by episode number
    for (const key in seriesMap) {
        seriesMap[key].files.sort((a, b) => {
            if (a.episode === null && b.episode === null) return a.fileName.localeCompare(b.fileName);
            if (a.episode === null) return 1;
            if (b.episode === null) return -1;
            return a.episode - b.episode;
        });
    }

    return seriesMap;
}

module.exports = {
    identifyMediaFiles,
    groupMediaBySeries
};
