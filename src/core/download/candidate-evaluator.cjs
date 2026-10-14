'use strict';
const { scoreAutoDownloadCandidate } = require('./candidate-scorer.cjs');

function evaluateCandidates(rule, candidates, episode, titles = []) {
    const profile = rule.scoringProfile;
    const preferences = { ...rule, preferredQuality: profile === 'balanced' ? '1080p' : profile === 'data-saver' ? '720p' : profile === 'best-quality' ? 'auto' : rule.preferredQuality || '1080p' };
    const order = rule.sourceExtensionIds?.length ? rule.sourceExtensionIds : rule.providerPriority || [];
    const ranked = candidates.map(item => {
        const candidate = item.candidate;
        const rejected = [];
        if (candidate.episodeNumber !== episode + Number(rule.episodeOffset || 0)) rejected.push('episode-mismatch');
        if (rule.seasonNumber != null && candidate.seasonNumber !== rule.seasonNumber) rejected.push('season-mismatch');
        // Eligibility is checked before scoring: an invalid episode must never
        // receive an "episode-match" bonus in the simulation report.
        const scored = rejected.length ? { score: 0, reasons: [] } : scoreAutoDownloadCandidate(preferences, candidate, titles);
        if (rejected.length) return { ...item, score: 0, reasons: [], rejected, accepted: false };
        if (!scored.reasons.includes('title-match')) rejected.push('title-mismatch');
        for (const reason of scored.reasons) if (/mismatch|excluded|below-minimum/.test(reason)) rejected.push(reason);
        if (scored.score < (rule.minimumScore || 0)) rejected.push('below-minimum-score');
        if (rule.languageFallbackMode === 'error' && !scored.reasons.some(r => /preferred-language|fallback-language/.test(r))) rejected.push('language-mismatch');
        return { ...item, score: scored.score, reasons: scored.reasons, rejected: [...new Set(rejected)], accepted: rejected.length === 0 };
    });
    const priority = candidate => { const i = order.indexOf(candidate.providerId); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
    ranked.sort((a, b) => Number(b.accepted) - Number(a.accepted) || b.score - a.score ||
        (profile === 'best-quality' ? (Number(String(b.candidate.quality).match(/\d+/)?.[0]) || 0) - (Number(String(a.candidate.quality).match(/\d+/)?.[0]) || 0) : 0) ||
        priority(a.candidate) - priority(b.candidate) || a.id.localeCompare(b.id));
    return { ranked, selected: ranked.find(item => item.accepted) || null };
}
module.exports = { evaluateCandidates };
