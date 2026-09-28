/**
 * Shared helpers for accepting images via drag-and-drop and clipboard paste.
 * Composers inject their own upload path (comment bucket vs. post bucket); these
 * only handle validation and pulling the File out of a drop/paste event so the
 * behaviour stays identical everywhere.
 */

export const IMAGE_MAX_MB = 8;

/** Returns a human-readable error if the file isn't an acceptable image, else null. */
export function validateImageFile(file: File, maxMB = IMAGE_MAX_MB): string | null {
  if (!file.type.startsWith('image/')) return 'Please choose an image file';
  if (file.size > maxMB * 1024 * 1024) return `Image must be ${maxMB}MB or smaller`;
  return null;
}

type TransferLike = { files?: FileList | null; items?: DataTransferItemList | null } | null | undefined;

/**
 * First image `File` out of a drag-and-drop `dataTransfer` or a paste
 * `clipboardData`. Falls back to `items` for sources (e.g. images copied from a
 * browser) that expose the file only through the items list.
 */
export function imageFileFromTransfer(dt: TransferLike): File | null {
  if (!dt) return null;
  const fromFiles = dt.files ? Array.from(dt.files).find((f) => f.type.startsWith('image/')) : undefined;
  if (fromFiles) return fromFiles;
  if (dt.items) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) return f;
      }
    }
  }
  return null;
}

/** True when a drag event is carrying files (so we can show a drop affordance). */
export function dragHasFiles(dt: TransferLike): boolean {
  if (!dt) return false;
  const anyDt = dt as DataTransfer;
  if (anyDt.types && Array.from(anyDt.types).includes('Files')) return true;
  return !!(dt.files && dt.files.length);
}
