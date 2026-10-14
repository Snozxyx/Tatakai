/**
 * Narrator prosody — where to pause and for how long.
 *
 * A robotic narrator reads every sentence flat. This module plans expressive
 * pauses before any audio is synthesised (KittenTTS or the speech fallback):
 *
 * - Sentence ends (`. ! ?`) → short beat (320ms), longer for `!`/`?` (420ms)
 * - Ellipses / em-dashes → hesitant pause (550–650ms)
 * - Commas/semicolons/colons → breath (180–260ms)
 * - Quoted dialogue boundaries → beat before/after speech (300ms)
 * - Paragraph breaks → scene breath (700ms), longer after short dramatic lines
 * - Chapter headings / dividers (`***`, `Chapter N`) → full stop (1100ms)
 *
 * The planner outputs utterances (speakable chunks) + the pause AFTER each
 * one, so both the neural backend (KittenTTS inserts silence frames) and the
 * Web Speech fallback (`setTimeout` between `utter()` calls) share one map.
 */

export interface ProsodyUtterance {
  /** Speakable text (trimmed, punctuation kept). */
  text: string;
  /** Paragraph index this utterance came from. */
  paragraph: number;
  /** Silence to insert AFTER this utterance, in ms. */
  pauseAfterMs: number;
  /** True for headings/dividers (slower rate + lower pitch hint). */
  isHeading: boolean;
  /** True when the utterance is quoted dialogue. */
  isDialogue: boolean;
}

const HEADING_RE = /^(chapter|prologue|epilogue|volume|book|part|interlude|side story)\b/i;
const DIVIDER_RE = /^(\*{3,}|-{3,}|·{3,}|◇.*◇)$/;

function pauseForBoundary(char: string): number {
  if (char === '!' || char === '?') return 420;
  if (char === '.') return 320;
  if (char === ';' || char === ':') return 260;
  if (char === ',') return 180;
  if (char === '—' || char === '–') return 600;
  return 300;
}

/** Last sentence-terminal punctuation, skipping trailing quotes/brackets. */
function terminalChar(sentence: string): string {
  const m = sentence.trim().match(/[.?!;,:\u2014\u2013]["”'’)\]]*$/);
  if (!m) return sentence.trim().slice(-1);
  return m[0][0];
}

/** Split a paragraph into sentence-level utterances, keeping delimiters. */
function splitSentences(paragraph: string): string[] {
  const out: string[] = [];
  // Protect abbreviations so "Mr. Smith" doesn't split.
  const protectedText = paragraph.replace(
    /\b(Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|vs|etc|i\.e|e\.g)\./g,
    (_, abbr: string) => `${abbr}∯`,
  );
  const re = /[^.!?…—]+[.!?…—]+["”'’)]*|\S[^.!?…—]*$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(protectedText)) !== null) {
    const s = m[0].replace(/∯/g, '.').trim();
    if (s) out.push(s);
  }
  if (out.length === 0 && paragraph.trim()) out.push(paragraph.trim());
  return out;
}

const DIALOGUE_RE = /["“][^"”]+["”]/g;

export function planProsody(paragraphs: string[]): ProsodyUtterance[] {
  const utterances: ProsodyUtterance[] = [];
  paragraphs.forEach((raw, pIndex) => {
    const text = String(raw || '').trim();
    if (!text) return;
    const isHeading = HEADING_RE.test(text) || DIVIDER_RE.test(text) || (text.length < 60 && /^[A-Z0-9 \-:—·*◇]+$/.test(text) && /chapter|part|volume/i.test(text));
    if (isHeading) {
      utterances.push({ text, paragraph: pIndex, pauseAfterMs: 1100, isHeading: true, isDialogue: false });
      return;
    }
    const sentences = splitSentences(text).flatMap(sentence => {
      const parts: string[] = []; let current = '';
      for (const word of sentence.split(/\s+/)) {
        if (current && current.length + word.length + 1 > 260) { parts.push(current); current = ''; }
        current = current ? `${current} ${word}` : word;
      }
      if (current) parts.push(current);
      return parts;
    });
    const isShortDramatic = text.length < 80 && sentences.length <= 1;
    sentences.forEach((sentence, sIdx) => {
      const isDialogue = DIALOGUE_RE.test(sentence);
      DIALOGUE_RE.lastIndex = 0;
      const lastChar = terminalChar(sentence);
      let pause = pauseForBoundary(lastChar);
      // Ellipses hesitate.
      if (/\.\.\.|…/.test(sentence)) pause = Math.max(pause, 600);
      // Em-dash interruptions hang in the air.
      if (/—/.test(sentence)) pause = Math.max(pause, 550);
      // Last sentence of the paragraph → paragraph breath instead.
      const isLast = sIdx === sentences.length - 1;
      if (isLast) {
        pause = isShortDramatic ? 900 : 700;
      }
      utterances.push({
        text: sentence,
        paragraph: pIndex,
        pauseAfterMs: pause,
        isHeading: false,
        isDialogue,
      });
    });
  });
  return utterances;
}

/** Total estimated listen time (ms) at rate 1, ~850 chars/min narration pace. */
export function estimateListenMs(utterances: ProsodyUtterance[]): number {
  const chars = utterances.reduce((n, u) => n + u.text.length, 0);
  const speech = (chars / 850) * 60_000;
  const pauses = utterances.reduce((n, u) => n + u.pauseAfterMs, 0);
  return Math.round(speech + pauses);
}

export interface ProsodyGroup {
  /** Speakable text — one paragraph (or a merged run of short lines). */
  text: string;
  /** Utterance indexes covered, for progress mapping. */
  utteranceIndexes: number[];
  /** First paragraph in the group (highlight target). */
  paragraph: number;
  /** Last paragraph in the group. */
  endParagraph: number;
  /** Silence after the group, in ms (only paragraph-level breaths survive). */
  pauseAfterMs: number;
  isHeading: boolean;
}

/**
 * Group utterances for NEURAL synthesis. A neural voice already breathes
 * inside a paragraph — sending it sentence-by-sentence with a fixed pause
 * after each one is what makes narration feel halting and robotic.
 *
 * So for neural backends we synthesize whole paragraphs at once (merged to
 * ~380 chars max, KittenTTS's sweet spot) and keep only paragraph-level
 * breaths between groups. The per-sentence pause map stays the domain of the
 * system-voice backend, which needs it.
 */
export function groupUtterances(
  utterances: ProsodyUtterance[],
  maxChars = 360,
): ProsodyGroup[] {
  const groups: ProsodyGroup[] = [];
  let current: ProsodyUtterance[] = [];
  let currentIndexes: number[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const first = current[0];
    const last = current[current.length - 1];
    // The paragraph breath comes from the LAST utterance's pause, softened
    // for neural (the model already leaves room tone).
    const pause = first.isHeading ? 800 : last.paragraph !== first.paragraph ? 500 : 400;
    groups.push({
      text: current.map((u) => u.text).join(' '),
      utteranceIndexes: currentIndexes,
      paragraph: first.paragraph,
      endParagraph: last.paragraph,
      pauseAfterMs: pause,
      isHeading: current.some((u) => u.isHeading),
    });
    current = [];
    currentIndexes = [];
  };

  utterances.forEach((u, index) => {
    // Headings always stand alone (they get their own slower delivery).
    if (u.isHeading) {
      flush();
      current = [u];
      currentIndexes = [index];
      flush();
      return;
    }
    const prospective =
      current.reduce((n, c) => n + c.text.length + 1, 0) + u.text.length;
    // New paragraph or size budget reached → new group.
    const lastPara = current.length > 0 ? current[current.length - 1].paragraph : u.paragraph;
    if (current.length > 0 && (u.paragraph !== lastPara || prospective > maxChars)) {
      flush();
    }
    current.push(u);
    currentIndexes.push(index);
  });
  flush();
  return groups;
}
