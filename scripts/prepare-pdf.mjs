import { mkdir, copyFile, cp, readdir } from "node:fs/promises";
await mkdir(new URL("../public/", import.meta.url), { recursive: true });
await copyFile(new URL("../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), new URL("../public/pdf.worker.min.mjs", import.meta.url));
await cp(new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url), new URL("../public/pdf-fonts/", import.meta.url), { recursive: true });
await mkdir(new URL("../public/ocr/core/",import.meta.url),{recursive:true});
await mkdir(new URL("../public/ocr/lang/",import.meta.url),{recursive:true});
await copyFile(new URL("../node_modules/tesseract.js/dist/worker.min.js",import.meta.url),new URL("../public/ocr/worker.min.js",import.meta.url));
for(const name of await readdir(new URL("../node_modules/tesseract.js-core/",import.meta.url))) {
  if(/\.wasm(?:\.js)?$/.test(name))await copyFile(new URL(`../node_modules/tesseract.js-core/${name}`,import.meta.url),new URL(`../public/ocr/core/${name}`,import.meta.url));
}
await copyFile(new URL("../node_modules/@tesseract.js-data/spa/4.0.0/spa.traineddata.gz",import.meta.url),new URL("../public/ocr/lang/spa.traineddata.gz",import.meta.url));

await cp(new URL("../node_modules/pdfjs-dist/wasm/", import.meta.url), new URL("../public/pdf-wasm/", import.meta.url), { recursive: true });
