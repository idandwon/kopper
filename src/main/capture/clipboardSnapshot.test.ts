import { describe, expect, it, vi } from "vitest";

import {
  snapshotClipboard,
  restoreClipboard,
  type ClipboardAdapter,
  type NativeImageAdapter,
  type NativeImageFactory,
} from "./clipboardSnapshot";

function image(bytes: Buffer, empty = false): NativeImageAdapter {
  return {
    isEmpty: () => empty,
    toPNG: () => bytes,
  };
}

function makeClipboard(
  overrides: Partial<ClipboardAdapter> = {},
): ClipboardAdapter {
  return {
    availableFormats: vi.fn(() => []),
    readText: vi.fn(() => ""),
    readHTML: vi.fn(() => ""),
    readRTF: vi.fn(() => ""),
    readBookmark: vi.fn(() => ({ title: "", url: "" })),
    readImage: vi.fn(() => image(Buffer.alloc(0), true)),
    clear: vi.fn(),
    write: vi.fn(),
    ...overrides,
  };
}

describe("clipboard snapshots", () => {
  it("clones every supported representation, including image bytes", () => {
    const sourceBytes = Buffer.from([1, 2, 3]);
    const clipboard = makeClipboard({
      availableFormats: vi.fn(() => [
        "public.utf8-plain-text",
        "public.html",
        "public.rtf",
        "public.url-name",
        "public.tiff",
      ]),
      readText: vi.fn(() => "plain"),
      readHTML: vi.fn(() => "<b>plain</b>"),
      readRTF: vi.fn(() => "{\\rtf1 plain}"),
      readBookmark: vi.fn(() => ({
        title: "Example",
        url: "https://example.test/",
      })),
      readImage: vi.fn(() => image(sourceBytes)),
    });

    const snapshot = snapshotClipboard(clipboard);
    sourceBytes[0] = 9;

    expect(snapshot).toEqual({
      text: "plain",
      html: "<b>plain</b>",
      rtf: "{\\rtf1 plain}",
      bookmark: { title: "Example", url: "https://example.test/" },
      imagePng: Buffer.from([1, 2, 3]),
    });
  });

  it.each(["public.url", "public.url-name", "NSURLPboardType"])(
    "snapshots a valid bookmark from recognized format %s",
    (format) => {
      const clipboard = makeClipboard({
        availableFormats: vi.fn(() => [format]),
        readBookmark: vi.fn(() => ({
          title: "Example",
          url: "https://example.test/",
        })),
      });

      const snapshot = snapshotClipboard(clipboard);

      expect(snapshot).toEqual({
        bookmark: { title: "Example", url: "https://example.test/" },
      });
    },
  );

  it("ignores unrelated custom formats containing bookmark", () => {
    const clipboard = makeClipboard({
      availableFormats: vi.fn(() => [
        "public.utf8-plain-text",
        "com.example.bookmark-metadata",
      ]),
      readText: vi.fn(() => "original text"),
      readBookmark: vi.fn(() => ({ title: "", url: "" })),
    });

    const snapshot = snapshotClipboard(clipboard);

    expect(snapshot).toEqual({ text: "original text" });

    restoreClipboard(clipboard, snapshot, { createFromBuffer: vi.fn() });
    expect(clipboard.write).toHaveBeenCalledWith({ text: "original text" });
  });

  it("does not snapshot a recognized URL format without a bookmark URL", () => {
    const clipboard = makeClipboard({
      availableFormats: vi.fn(() => [
        "public.utf8-plain-text",
        "public.url",
      ]),
      readText: vi.fn(() => "original text"),
      readBookmark: vi.fn(() => ({ title: "Empty URL", url: "" })),
    });

    const snapshot = snapshotClipboard(clipboard);

    expect(snapshot).toEqual({ text: "original text" });
  });

  it("restores supported representations in one combined write", () => {
    const clipboard = makeClipboard();
    const rebuiltImage = image(Buffer.from([8]));
    const nativeImage: NativeImageFactory = {
      createFromBuffer: vi.fn(() => rebuiltImage),
    };

    restoreClipboard(
      clipboard,
      {
        text: "plain",
        html: "<b>plain</b>",
        rtf: "{\\rtf1 plain}",
        bookmark: { title: "Example", url: "https://example.test/" },
        imagePng: Buffer.from([1, 2, 3]),
      },
      nativeImage,
    );

    expect(nativeImage.createFromBuffer).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
    );
    expect(clipboard.write).toHaveBeenCalledTimes(1);
    expect(clipboard.write).toHaveBeenCalledWith({
      text: "https://example.test/",
      html: "<b>plain</b>",
      rtf: "{\\rtf1 plain}",
      bookmark: "Example",
      image: rebuiltImage,
    });
    expect(clipboard.clear).not.toHaveBeenCalled();
  });

  it("clears the clipboard when the snapshot is truly empty", () => {
    const clipboard = makeClipboard();
    const snapshot = snapshotClipboard(clipboard);

    expect(snapshot).toEqual({});

    restoreClipboard(clipboard, snapshot, {
      createFromBuffer: vi.fn(),
    });

    expect(clipboard.clear).toHaveBeenCalledOnce();
    expect(clipboard.write).not.toHaveBeenCalled();
  });

  it("preserves the presence of supported empty string representations", () => {
    const clipboard = makeClipboard({
      availableFormats: vi.fn(() => [
        "public.utf8-plain-text",
        "public.html",
        "public.rtf",
      ]),
    });
    const snapshot = snapshotClipboard(clipboard);

    expect(snapshot).toEqual({ text: "", html: "", rtf: "" });

    restoreClipboard(clipboard, snapshot, { createFromBuffer: vi.fn() });
    expect(clipboard.write).toHaveBeenCalledWith({
      text: "",
      html: "",
      rtf: "",
    });
    expect(clipboard.clear).not.toHaveBeenCalled();
  });
});
