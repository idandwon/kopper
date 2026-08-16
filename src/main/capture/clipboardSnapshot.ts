export interface NativeImageAdapter {
  isEmpty(): boolean;
  toPNG(): Buffer;
}

export interface NativeImageFactory {
  createFromBuffer(buffer: Buffer): NativeImageAdapter;
}

export interface ClipboardWriteData {
  text?: string;
  html?: string;
  rtf?: string;
  bookmark?: string;
  image?: NativeImageAdapter;
}

export interface ClipboardAdapter {
  availableFormats(): string[];
  readText(): string;
  readHTML(): string;
  readRTF(): string;
  readBookmark(): { title: string; url: string };
  readImage(): NativeImageAdapter;
  clear(): void;
  write(data: ClipboardWriteData): void;
}

export interface ClipboardSnapshot {
  text?: string;
  html?: string;
  rtf?: string;
  bookmark?: { title: string; url: string };
  imagePng?: Buffer;
}

type SupportedFormat = "text" | "html" | "rtf" | "bookmark";

const formatPatterns: Record<SupportedFormat, RegExp[]> = {
  text: [
    /^text\/plain$/i,
    /^public\.(?:utf8|utf16|utf-8|utf-16).*plain-text$/i,
    /^NSStringPboardType$/i,
  ],
  html: [/^text\/html$/i, /^public\.html$/i, /HTML Format/i],
  rtf: [/^text\/rtf$/i, /^public\.rtf$/i, /Rich Text Format/i],
  bookmark: [
    /^public\.url$/,
    /^public\.url-name$/,
    /^NSURLPboardType$/,
  ],
};

function hasFormat(formats: string[], format: SupportedFormat): boolean {
  return formats.some((candidate) =>
    formatPatterns[format].some((pattern) => pattern.test(candidate)),
  );
}

/**
 * Snapshots the representations Electron can read and later write together.
 * Source-specific/custom pasteboard formats are intentionally unsupported and
 * may be replaced when Command+C updates the system pasteboard.
 */
export function snapshotClipboard(clipboard: ClipboardAdapter): ClipboardSnapshot {
  const formats = clipboard.availableFormats();
  const text = clipboard.readText();
  const html = clipboard.readHTML();
  const rtf = clipboard.readRTF();
  const bookmark = clipboard.readBookmark();
  const image = clipboard.readImage();
  const snapshot: ClipboardSnapshot = {};

  if (text.length > 0 || hasFormat(formats, "text")) snapshot.text = text;
  if (html.length > 0 || hasFormat(formats, "html")) snapshot.html = html;
  if (rtf.length > 0 || hasFormat(formats, "rtf")) snapshot.rtf = rtf;
  if (bookmark.url.length > 0 && hasFormat(formats, "bookmark")) {
    snapshot.bookmark = { ...bookmark };
  }
  if (!image.isEmpty()) snapshot.imagePng = Buffer.from(image.toPNG());

  return snapshot;
}

export function restoreClipboard(
  clipboard: ClipboardAdapter,
  snapshot: ClipboardSnapshot,
  nativeImage: NativeImageFactory,
): void {
  const empty =
    !("text" in snapshot) &&
    !("html" in snapshot) &&
    !("rtf" in snapshot) &&
    !("bookmark" in snapshot) &&
    !("imagePng" in snapshot);

  if (empty) {
    clipboard.clear();
    return;
  }

  const restored: ClipboardWriteData = {};
  if ("text" in snapshot) restored.text = snapshot.text;
  if ("html" in snapshot) restored.html = snapshot.html;
  if ("rtf" in snapshot) restored.rtf = snapshot.rtf;
  if (snapshot.bookmark !== undefined) {
    restored.bookmark = snapshot.bookmark.title;
    // Electron's combined write API takes the bookmark URL from `text`.
    restored.text = snapshot.bookmark.url;
  }
  if (snapshot.imagePng !== undefined) {
    restored.image = nativeImage.createFromBuffer(
      Buffer.from(snapshot.imagePng),
    );
  }

  clipboard.write(restored);
}
