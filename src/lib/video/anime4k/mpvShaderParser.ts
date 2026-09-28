// MPV "user shader" (.glsl hook format) parser.
//
// The Anime4K shaders shipped by bloc97 (https://github.com/bloc97/Anime4K, MIT)
// are written as MPV user shaders: a sequence of passes, each introduced by a
// block of `//!` directive lines followed by a desktop-GLSL body that defines
// `vec4 hook()`. This module turns such a file into a list of `Pass` objects
// plus a tiny evaluator for the `WIDTH`/`HEIGHT` size expressions.
//
// Only the directive/expression forms that actually occur in the Restore CNN
// (S/M) and Upscale CNN x2 (S/M) shaders are handled — see the notes on
// `evalSizeExpr` for the exact grammar.

/** A size expression from a `//!WIDTH` / `//!HEIGHT` directive, kept as raw tokens. */
export type SizeExpr = {
  /** The original expression text, e.g. `"MAIN.w"` or `"conv2d_last_tf.w 2 *"`. */
  readonly raw: string;
  /** Whitespace-separated tokens of the expression. */
  readonly tokens: readonly string[];
};

/** A single parsed pass of an MPV user shader. */
export interface Pass {
  /** `//!DESC` text (empty string when absent). */
  readonly desc: string;
  /** The hook point (`//!HOOK`), always `"MAIN"` for Anime4K. */
  readonly hook: string;
  /** Textures this pass samples (`//!BIND`). `MAIN` = the working texture. */
  readonly binds: readonly string[];
  /** `//!SAVE` target name, or `null` when the pass renders back into MAIN. */
  readonly save: string | null;
  /** Output width expression (`//!WIDTH`); defaults to `MAIN.w`. */
  readonly width: SizeExpr;
  /** Output height expression (`//!HEIGHT`); defaults to `MAIN.h`. */
  readonly height: SizeExpr;
  /** Component count (`//!COMPONENTS`), defaults to 4 (RGBA). */
  readonly components: number;
  /** `//!WHEN` conditional expression, or `null`. Preserved but not evaluated. */
  readonly when: string | null;
  /** Verbatim GLSL body (its own `#define`s plus `vec4 hook()`). */
  readonly body: string;
}

/** Dimensions of a named texture, used when evaluating size expressions. */
export interface TexSize {
  readonly w: number;
  readonly h: number;
}

const DIRECTIVE_PREFIX = "//!";

function makeSizeExpr(raw: string): SizeExpr {
  const trimmed = raw.trim();
  const tokens = trimmed.length === 0 ? [] : trimmed.split(/\s+/);
  return { raw: trimmed, tokens };
}

/**
 * Parse a full MPV user-shader string into its ordered list of passes.
 *
 * A pass begins at the first `//!` directive line and its body runs until the
 * next directive block. Leading license/comment lines before the first
 * directive are ignored. Directive lines never appear inside a GLSL body, so
 * the transition body -> directive marks a new pass.
 */
export function parseMpvShader(source: string): Pass[] {
  const lines = source.split(/\r?\n/);
  const passes: Pass[] = [];

  // Accumulators for the pass currently being built.
  let desc = "";
  let hook = "MAIN";
  let binds: string[] = [];
  let save: string | null = null;
  let widthRaw = "";
  let heightRaw = "";
  let components = 4;
  let when: string | null = null;
  let bodyLines: string[] = [];

  let inPass = false; // have we seen the first directive of a pass yet?
  let inBody = false; // are we past the directive block, reading the body?

  const flush = (): void => {
    if (!inPass) return;
    passes.push({
      desc,
      hook,
      binds,
      save,
      width: makeSizeExpr(widthRaw || "MAIN.w"),
      height: makeSizeExpr(heightRaw || "MAIN.h"),
      components,
      when,
      body: bodyLines.join("\n"),
    });
  };

  const reset = (): void => {
    desc = "";
    hook = "MAIN";
    binds = [];
    save = null;
    widthRaw = "";
    heightRaw = "";
    components = 4;
    when = null;
    bodyLines = [];
  };

  for (const line of lines) {
    const isDirective = line.startsWith(DIRECTIVE_PREFIX);

    if (isDirective) {
      // A directive after body content closes the previous pass.
      if (inBody) {
        flush();
        reset();
        inBody = false;
      }
      inPass = true;

      const rest = line.slice(DIRECTIVE_PREFIX.length).trim();
      const spaceIdx = rest.search(/\s/);
      const keyword = (spaceIdx === -1 ? rest : rest.slice(0, spaceIdx)).toUpperCase();
      const value = spaceIdx === -1 ? "" : rest.slice(spaceIdx + 1).trim();

      switch (keyword) {
        case "DESC":
          desc = value;
          break;
        case "HOOK":
          hook = value || "MAIN";
          break;
        case "BIND":
          if (value) binds.push(value);
          break;
        case "SAVE":
          save = value || null;
          break;
        case "WIDTH":
          widthRaw = value;
          break;
        case "HEIGHT":
          heightRaw = value;
          break;
        case "COMPONENTS": {
          const n = parseInt(value, 10);
          components = Number.isFinite(n) && n > 0 ? n : 4;
          break;
        }
        case "WHEN":
          when = value;
          break;
        default:
          // Unknown directive — ignore (keeps the parser forward-compatible).
          break;
      }
      continue;
    }

    if (!inPass) {
      // Still in the license header before the first directive; skip.
      continue;
    }

    // Non-directive line belonging to a pass body.
    if (!inBody) {
      // Skip blank lines between the directive block and the real body start.
      if (line.trim() === "") continue;
      inBody = true;
    }
    bodyLines.push(line);
  }

  flush();
  return passes;
}

/**
 * Evaluate a `WIDTH`/`HEIGHT` size expression against known texture sizes.
 *
 * Supported grammar (exactly what the CNN Restore S/M and Upscale x2 S/M
 * shaders use):
 *   - `NAME.w` / `NAME.h`  — a bound texture's width/height (e.g. `MAIN.w`).
 *   - numeric literals     — e.g. `2`, `1.5`.
 *   - binary operators `+ - * /` in reverse-polish order, e.g.
 *     `conv2d_last_tf.w 2 *` (double the width).
 * A simple 3-token infix form (`A op B`) is also normalized to RPN as a
 * convenience, but the shipped shaders only use RPN / single-token forms.
 *
 * Returns a rounded integer (texture dimensions are whole pixels), clamped to
 * a minimum of 1.
 */
export function evalSizeExpr(expr: SizeExpr, sizes: Readonly<Record<string, TexSize>>): number {
  let tokens = expr.tokens.slice();
  if (tokens.length === 0) return 1;

  // Normalize a lone `A op B` infix triple to RPN (`A B op`).
  if (tokens.length === 3 && isOperator(tokens[1]) && !isOperator(tokens[0]) && !isOperator(tokens[2])) {
    tokens = [tokens[0], tokens[2], tokens[1]];
  }

  const stack: number[] = [];
  for (const tok of tokens) {
    if (isOperator(tok)) {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) {
        throw new Error(`Malformed size expression "${expr.raw}": operator "${tok}" without two operands`);
      }
      stack.push(applyOp(a, b, tok));
      continue;
    }
    stack.push(resolveTerm(tok, sizes, expr.raw));
  }

  if (stack.length !== 1) {
    throw new Error(`Malformed size expression "${expr.raw}": leftover stack ${JSON.stringify(stack)}`);
  }
  return Math.max(1, Math.round(stack[0]));
}

function isOperator(tok: string): boolean {
  return tok === "+" || tok === "-" || tok === "*" || tok === "/";
}

function applyOp(a: number, b: number, op: string): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return a / b;
    default:
      throw new Error(`Unknown operator "${op}"`);
  }
}

function resolveTerm(tok: string, sizes: Readonly<Record<string, TexSize>>, raw: string): number {
  const dot = tok.indexOf(".");
  if (dot !== -1) {
    const name = tok.slice(0, dot);
    const field = tok.slice(dot + 1).toLowerCase();
    const size = sizes[name];
    if (!size) {
      throw new Error(`Size expression "${raw}" references unknown texture "${name}"`);
    }
    if (field === "w") return size.w;
    if (field === "h") return size.h;
    throw new Error(`Size expression "${raw}" references unknown field ".${field}"`);
  }
  const num = Number(tok);
  if (Number.isFinite(num)) return num;
  throw new Error(`Size expression "${raw}" has unresolved term "${tok}"`);
}
