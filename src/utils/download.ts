export interface DownloadResult {
  fileName: string;
  url: string;
}

export function downloadTextFile(fileName: string, content: string, mimeType: string): DownloadResult {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Some embedded browsers start the download asynchronously. Revoking immediately
  // can invalidate the object URL before the browser has consumed it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

  return { fileName, url };
}
