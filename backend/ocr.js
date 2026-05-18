/**
 * OCR de PDFs escaneados, 100% en JavaScript (sin binarios de sistema):
 *   - pdfjs-dist        → rasteriza cada página a imagen
 *   - @napi-rs/canvas   → canvas nativo prebuilt (sin libs de sistema)
 *   - tesseract.js      → reconocimiento óptico (WASM), español
 *
 * El buffer del PDF vive en memoria y se descarta — nunca toca disco.
 * Si alguna pieza no está disponible, lanza OcrUnavailableError.
 */

// pdfjs-dist v4 usa APIs de Node 22+ que el server (Node 21.7.3) no tiene.
// Polyfills obligatorios ANTES de importar pdfjs:
import { createRequire } from "node:module";

if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function withResolvers() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// process.getBuiltinModule(id): añadido en Node 22.3 — equivale a require(id)
// para módulos nativos.
if (typeof process.getBuiltinModule !== "function") {
  const _req = createRequire(import.meta.url);
  process.getBuiltinModule = (id) => {
    try {
      return _req(id);
    } catch {
      return _req(String(id).replace(/^node:/, ""));
    }
  };
}

export class OcrUnavailableError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "OcrUnavailableError";
  }
}

const MAX_PAGINAS = 12;
const SCALE = 2.0;
const LANG = process.env.OCR_LANG || "spa";
const LANG_PATH = process.env.OCR_LANG_PATH || undefined;

let _mods = null;
async function loadModules() {
  if (_mods) return _mods;
  try {
    const canvasMod = await import("@napi-rs/canvas");
    // pdfjs necesita estos globals para rasterizar en Node.
    for (const k of ["DOMMatrix", "Path2D", "ImageData"]) {
      if (canvasMod[k] && !globalThis[k]) globalThis[k] = canvasMod[k];
    }
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const Tesseract = await import("tesseract.js");
    _mods = {
      createCanvas: canvasMod.createCanvas,
      pdfjs,
      createWorker: Tesseract.createWorker || Tesseract.default?.createWorker,
    };
    return _mods;
  } catch (e) {
    throw new OcrUnavailableError(
      "Motor OCR no disponible (deps): " + (e?.message || e)
    );
  }
}

function makeCanvasFactory(createCanvas) {
  return class NodeCanvasFactory {
    create(w, h) {
      const canvas = createCanvas(Math.ceil(w) || 1, Math.ceil(h) || 1);
      return { canvas, context: canvas.getContext("2d") };
    }
    reset(cc, w, h) {
      cc.canvas.width = Math.ceil(w);
      cc.canvas.height = Math.ceil(h);
    }
    destroy(cc) {
      if (cc.canvas) {
        cc.canvas.width = 0;
        cc.canvas.height = 0;
      }
      cc.canvas = null;
      cc.context = null;
    }
  };
}

/**
 * @param {Buffer} pdfBuffer
 * @returns {Promise<{ text: string, pages: number }>}
 */
export async function ocrPdfBuffer(pdfBuffer) {
  if (!pdfBuffer || !pdfBuffer.length) {
    throw new OcrUnavailableError("PDF vacío");
  }
  const { pdfjs, createCanvas, createWorker } = await loadModules();
  if (typeof createWorker !== "function") {
    throw new OcrUnavailableError("tesseract.js: createWorker no disponible");
  }

  const CanvasFactory = makeCanvasFactory(createCanvas);
  const canvasFactory = new CanvasFactory();

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    canvasFactory,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: true,
  }).promise;

  const nPaginas = Math.min(doc.numPages, MAX_PAGINAS);

  // cacheMethod por defecto ('write') para que pueda traer/cachear el idioma.
  const worker = await createWorker(LANG, 1, {
    langPath: LANG_PATH,
    gzip: true,
  });

  let texto = "";
  try {
    for (let i = 1; i <= nPaginas; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: SCALE });
      const cc = canvasFactory.create(viewport.width, viewport.height);
      await page.render({ canvasContext: cc.context, viewport }).promise;
      const png = cc.canvas.toBuffer("image/png");
      canvasFactory.destroy(cc);
      page.cleanup();

      const { data } = await worker.recognize(png);
      texto += "\n" + (data?.text || "");
    }
  } finally {
    await worker.terminate();
    await doc.destroy();
  }

  return { text: texto, pages: nPaginas };
}
