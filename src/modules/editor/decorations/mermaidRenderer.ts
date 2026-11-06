/**
 * Mermaid 渲染单例：避免每个 Widget 重复 import / initialize，
 * 并用队列 + SVG 缓存降低打开含多图文档时的卡顿。
 */

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
};

let mermaidPromise: Promise<MermaidApi> | null = null;
let lastFontSize = -1;
let chain: Promise<void> = Promise.resolve();

const svgCache = new Map<string, string>();
const MAX_CACHE = 40;

function cacheKey(source: string, fontSize: number): string {
  return `${fontSize}\n${source}`;
}

function trimCache(): void {
  if (svgCache.size <= MAX_CACHE) return;
  const first = svgCache.keys().next().value;
  if (first !== undefined) svgCache.delete(first);
}

async function getMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => m.default as MermaidApi);
  }
  return mermaidPromise;
}

function ensureInitialized(api: MermaidApi, fontSize: number): void {
  if (lastFontSize === fontSize) return;
  api.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "neutral",
    themeVariables: {
      fontSize: `${fontSize}px`,
    },
    flowchart: {
      htmlLabels: true,
      padding: Math.round(fontSize * 0.5),
      nodeSpacing: Math.round(fontSize * 3),
      rankSpacing: Math.round(fontSize * 3),
    },
  });
  lastFontSize = fontSize;
}

/**
 * 串行渲染（同字体配置只 initialize 一次），命中缓存则立即返回。
 */
export function renderMermaidSvg(source: string, fontSize: number): Promise<string> {
  const key = cacheKey(source, fontSize);
  const hit = svgCache.get(key);
  if (hit) return Promise.resolve(hit);

  const run = async (): Promise<string> => {
    const cached = svgCache.get(key);
    if (cached) return cached;

    const api = await getMermaid();
    ensureInitialized(api, fontSize);
    const id = `mm-mermaid-${Math.random().toString(36).slice(2, 10)}`;
    const { svg } = await api.render(id, source);
    svgCache.set(key, svg);
    trimCache();
    return svg;
  };

  const next = chain.then(run, run);
  // 队列继续，错误不堵后续图
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
