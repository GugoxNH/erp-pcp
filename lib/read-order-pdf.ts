import { extractOrder, makeRows, type Row } from "./extract-order";
import { isPilgrims } from "./pilgrims";
import { binarize, recognizeRows, ocrScale, removeTableLines } from "./ocr";

export async function readOrderPdf(selected: File, company: string, onProgress: (status: string) => void) {
  if (!/\.pdf$/i.test(selected.name) || selected.size > 25 * 1024 * 1024) throw new Error("Selecciona un PDF de hasta 25 MB.");
    let task:import("pdfjs-dist").PDFDocumentLoadingTask|undefined;
    let ocr:import("tesseract.js").Worker|undefined;
    const scannedPages:number[]=[];
    try{
      const api=await import("pdfjs-dist");api.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
      task=api.getDocument({data:new Uint8Array(await selected.arrayBuffer()),standardFontDataUrl:"/pdf-fonts/",wasmUrl:"/pdf-wasm/"});
      const pdf=await task.promise;
      const rows:Row[]=[];
      for(let n=1;n<=pdf.numPages;n++){
        onProgress(`Analizando página ${n} de ${pdf.numPages}…`);
        const p=await pdf.getPage(n);const viewport=p.getViewport({scale:1});const content=await p.getTextContent();
        const words=content.items.filter(i=>"str" in i).map(i=>({text:i.str,x:i.transform[4]/viewport.width,y:i.transform[5],width:i.width/viewport.width}));
        if(words.some(w=>w.text.trim()))rows.push(...makeRows(words,n));
        else {
          scannedPages.push(n);
          onProgress(`OCR local · página ${n} de ${pdf.numPages}…`);
          if(!ocr){const {createWorker}=await import("tesseract.js");ocr=await createWorker("spa",1,{workerPath:"/ocr/worker.min.js",corePath:"/ocr/core",langPath:"/ocr/lang",logger:m=>{if(m.status==="recognizing text")onProgress(`OCR local · página ${scannedPages.at(-1)} · ${Math.round(m.progress*100)} %`);}});}
          const scale=ocrScale(company,viewport.width,viewport.height);
          const view=p.getViewport({scale});const canvas=document.createElement("canvas");canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
          const context=canvas.getContext("2d");if(!context)throw new Error("Canvas unavailable");
          await p.render({canvas,canvasContext:context,viewport:view}).promise;
          const originalCanvas=["Grupo Abrego","Nutribaq"].includes(company)?document.createElement("canvas"):undefined;
          if(originalCanvas){originalCanvas.width=canvas.width;originalCanvas.height=canvas.height;originalCanvas.getContext("2d")!.drawImage(canvas,0,0);}
          const pixels=context.getImageData(0,0,canvas.width,canvas.height);binarize(pixels.data);
          if(isPilgrims(company))removeTableLines(pixels.data,canvas.width,canvas.height);
          context.putImageData(pixels,0,0);
          rows.push(...await recognizeRows(ocr,canvas,canvas.width,canvas.height,scale,n,company,originalCanvas));canvas.width=canvas.height=0;if(originalCanvas)originalCanvas.width=originalCanvas.height=0;
        }
        p.cleanup();
      }
      const extracted=extractOrder(company,rows,{usedOcr:scannedPages.length>0});
      if(scannedPages.length)extracted.warnings.unshift(`Texto reconocido con OCR local (páginas ${scannedPages.join(", ")}). Revisa especialmente códigos, fechas e importes; el OCR puede confundir caracteres.`);
      onProgress(`${pdf.numPages} páginas analizadas${scannedPages.length?" · OCR local":""}`);
      return extracted;
    }catch(cause){throw new Error(cause instanceof Error&&cause.name==="PasswordException"?"El PDF está protegido. Selecciona una copia sin contraseña.":"No se pudo leer el PDF. Comprueba el archivo e inténtalo nuevamente.");}
    finally{try{await ocr?.terminate();}catch{}try{await task?.destroy();}catch{}}
}

