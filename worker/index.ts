/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const READER_RUNTIME_VERSION = "30.1";

async function serveReaderWithRuntimeFixes(request: Request, env: Env): Promise<Response | null> {
  const asset = await env.ASSETS.fetch(request);
  if (!asset.ok) return null;

  const contentType = asset.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return asset;

  let html = await asset.text();
  const runtimeTag = `<script src="/reader-master-fixes.js?v=${READER_RUNTIME_VERSION}"></script>`;
  if (!html.includes("/reader-master-fixes.js")) {
    html = html.includes("</body>") ? html.replace("</body>", `${runtimeTag}\n</body>`) : `${html}\n${runtimeTag}`;
  }

  const headers = new Headers(asset.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-cache, must-revalidate");
  headers.set("x-mafateeh-version", READER_RUNTIME_VERSION);
  headers.delete("content-length");
  headers.delete("etag");

  return new Response(html, { status: asset.status, statusText: asset.statusText, headers });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/reader.html") {
      const reader = await serveReaderWithRuntimeFixes(request, env);
      if (reader) return reader;
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
