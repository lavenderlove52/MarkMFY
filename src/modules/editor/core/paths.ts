/** 从文件完整路径中取出所在目录（保留原始路径分隔符风格）。 */
export function dirName(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return idx === -1 ? "" : filePath.slice(0, idx);
}

/** 将相对路径拼接到目录下；如果传入的已经是绝对路径/URL 则原样返回。 */
export function joinPath(dir: string, relative: string): string {
  const cleanedInput = relative.trim().replace(/^<|>$/g, "");
  if (/^[a-zA-Z]:[/\\]/.test(cleanedInput) || cleanedInput.startsWith("/") || /^[a-z]+:\/\//i.test(cleanedInput)) {
    return cleanedInput;
  }

  const sep = dir.includes("\\") ? "\\" : "/";
  const dirParts = dir.split(/[/\\]/).filter((p, i) => p !== "" || i === 0);
  const relParts = cleanedInput.replace(/^\.[/\\]/, "").split(/[/\\]/);
  const stack = [...dirParts];

  for (const part of relParts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      if (stack.length > 0 && !/^[a-zA-Z]:$/.test(stack[stack.length - 1] ?? "")) {
        stack.pop();
      }
      continue;
    }
    stack.push(part);
  }

  if (/^[a-zA-Z]:$/.test(stack[0] ?? "")) {
    return `${stack[0]}\\${stack.slice(1).join("\\")}`;
  }
  if (dir.startsWith("/")) {
    return `/${stack.filter(Boolean).join("/")}`;
  }
  return stack.join(sep);
}
