export interface ClipboardResult {
  ok: boolean;
  message: string;
}

function fallbackCopy(text: string): ClipboardResult {
  if (typeof document === 'undefined') {
    return { ok: false, message: 'Clipboard is not available in this environment.' };
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.append(textarea);
  textarea.select();

  try {
    const success = document.execCommand('copy');
    textarea.remove();
    return success
      ? { ok: true, message: 'Copied to clipboard.' }
      : { ok: false, message: 'Clipboard copy was blocked by the browser.' };
  } catch {
    textarea.remove();
    return { ok: false, message: 'Clipboard copy was blocked by the browser.' };
  }
}

export async function copyText(text: string): Promise<ClipboardResult> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, message: 'Copied to clipboard.' };
    } catch {
      return fallbackCopy(text);
    }
  }

  return fallbackCopy(text);
}
