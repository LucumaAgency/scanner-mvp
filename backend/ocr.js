/**
 * OCR de PDFs escaneados, 100% en JavaScript (sin binarios de sistema):
 *   - pdfjs-dist        → rasteriza cada página a imagen
 *   - @napi-rs/canvas   → canvas nativo prebuilt (sin libs de sistema)
 *   - tesseract.js      → reconocimiento óptico (WASM), español
 *
 * Diseñado para hosting restringido (Plesk): todo se instala vía npm.
 * El buffer del PDF vive en memoria y se descarta — nunca toca disco.
 *
 * Si alguna pieza no está instalada/disponible, lanza OcrUnavailableError
 * para que el endpoint degrade con gracia y el usuario siga en modo manual.
 */

export class OcrUnavailableError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "OcrUnavailableError";
  }
}

const MAX_PAGINAS = 12; // copias literales típicas: 3–10 páginas
const SCALE = 2.0; // resolución de render (mayor = más preciso, más lento)
const LANG = process.env.OCR_LANG || "spa";
// Permite vendorizar el traineddata offline (OCR_LANG_PATH) o dejar que
// tesseract.js lo descargue del CDN en el primer uso (default).
const LANG_PATH = process.env.OCR_LANG_PATH || undefined;

let _mods = null;
async function loadModules() {
  if (_mods) return _mods;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = await import("@napi-rs/canvas");
    const Tesseract = (await import("tesseract.js")).default;
    _mods = { pdfjs, createCanvas, Tesseract };
    return _mods;
  } catch (e) {
    throw new OcrUnavailableError(
      "Motor OCR no disponible (faltan deps: pdfjs-dist, @napi-rs/canvas, tesseract.js). " +
        "Instalá dependencias en el servidor. Detalle: " + e.message
    );
  }
}

/** Factory mínima de canvas para pdfjs sobre @napi-rs/canvas. */
function makeCanvasFactory(createCanvas) {
  return {
    create(w, h) {
      const canvas = createCanvas(Math.ceil(w), Math.ceil(h));
      return { canvas, context: canvas.getContext("2d") };
    },
    reset(cc, w, h) {
      cc.canvas.width = Math.ceil(w);
      cc.canvas.height = Math.ceil(h);
    },
    destroy(cc) {
      cc.canvas.width = 0;
      cc.canvas.height = 0;
    },
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
  const { pdfjs, createCanvas, Tesseract } = await loadModules();

  const canvasFactory = makeCanvasFactory(createCanvas);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    canvasFactory,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  const nPaginas = Math.min(doc.numPages, MAX_PAGINAS);

  const worker = await Tesseract.createWorker(LANG, 1, {
    langPath: LANG_PATH,
    cacheMethod: "readOnly",
    gzip: true,
  });

  let texto = "";
  try {
    for (let i = 1; i <= nPaginas; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: SCALE });
      const cc = canvasFactory.create(viewport.width, viewport.height);
      await page.render({ canvasContext: cc.context, viewport, canvasFactory })
        .promise;
      const png = cc.canvas.toBuffer("image/png");
      canvasFactory.destroy(cc);
      page.cleanup();

      const { data } = await worker.recognize(png);
      texto += "\n" + (data.text || "");
    }
  } finally {
    await worker.terminate();
    await doc.destroy();
  }

  return { text: texto, pages: nPaginas };
}
