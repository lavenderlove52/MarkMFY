const IMAGE_EXTENSIONS = new Set([
  "apng",
  "avif",
  "bmp",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
]);

/** 是否为编辑器可直接预览的图片文件。 */
export function isImageFilePath(filePath: string | null | undefined): boolean {
  if (!filePath) return false;
  const base = filePath.replace(/^.*[/\\]/, "");
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return false;
  return IMAGE_EXTENSIONS.has(base.slice(dot + 1).toLowerCase());
}
