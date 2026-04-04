import { describe, it, expect } from "vitest";
import { validateFiles, formatFileSize } from "./file-validation";

function makeFile(name: string, size: number, type: string): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

describe("validateFiles", () => {
  it("accepts files with allowed MIME types", () => {
    const file = makeFile("doc.pdf", 1024, "application/pdf");

    const { validFiles, errorMessage } = validateFiles([file]);

    expect(validFiles).toHaveLength(1);
    expect(validFiles[0].file).toBe(file);
    expect(errorMessage).toBeNull();
  });

  it("rejects files exceeding 25MB", () => {
    const file = makeFile("huge.pdf", 26 * 1024 * 1024, "application/pdf");

    const { validFiles, errorMessage } = validateFiles([file]);

    expect(validFiles).toHaveLength(0);
    expect(errorMessage).toContain("huge.pdf");
    expect(errorMessage).toContain("too large");
  });

  it("falls back to extension check when MIME type is empty", () => {
    const file = makeFile("notes.md", 100, "");

    const { validFiles, errorMessage } = validateFiles([file]);

    expect(validFiles).toHaveLength(1);
    expect(errorMessage).toBeNull();
  });

  it("rejects files with disallowed MIME and unknown extension", () => {
    const file = makeFile("binary.exe", 100, "application/octet-stream");

    const { validFiles, errorMessage } = validateFiles([file]);

    expect(validFiles).toHaveLength(0);
    expect(errorMessage).toContain("binary.exe");
  });

  it("accepts image files", () => {
    const png = makeFile("photo.png", 500, "image/png");
    const jpg = makeFile("photo.jpg", 500, "image/jpeg");

    const { validFiles } = validateFiles([png, jpg]);

    expect(validFiles).toHaveLength(2);
  });

  it("generates unique ids for valid files", () => {
    const files = [
      makeFile("a.pdf", 100, "application/pdf"),
      makeFile("b.pdf", 100, "application/pdf"),
    ];

    const { validFiles } = validateFiles(files);

    expect(validFiles[0].id).not.toBe(validFiles[1].id);
    expect(validFiles[0].id).toMatch(/^file-/);
  });

  it("reports last error when multiple files fail", () => {
    const files = [
      makeFile("huge.pdf", 26 * 1024 * 1024, "application/pdf"),
      makeFile("bad.exe", 100, "application/octet-stream"),
    ];

    const { validFiles, errorMessage } = validateFiles(files);

    expect(validFiles).toHaveLength(0);
    expect(errorMessage).toContain("bad.exe");
  });
});

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(512)).toBe("512B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(2048)).toBe("2KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0MB");
  });
});
