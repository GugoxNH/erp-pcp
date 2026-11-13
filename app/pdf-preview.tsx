"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { ChevronLeft, ChevronRight } from "lucide-react";
export default function PdfPreview({file,page,onPage}:{file:File;page:number;onPage:(page:number)=>void}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null);
  const [zoom,setZoom]=useState(1);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    setPdf(null);setLoading(true);setError("");
    let cancelled=false;let task:import("pdfjs-dist").PDFDocumentLoadingTask|undefined;
    (async()=>{try{
      const api=await import("pdfjs-dist");if(cancelled)return;
      api.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
      const data=new Uint8Array(await file.arrayBuffer());if(cancelled)return;
      task=api.getDocument({data,standardFontDataUrl:"/pdf-fonts/",wasmUrl:"/pdf-wasm/"});
      const doc=await task.promise;if(!cancelled)setPdf(doc);
    }catch{if(!cancelled){setError("No se pudo previsualizar este PDF.");setLoading(false);}}})();
    return()=>{cancelled=true;void task?.destroy();};
  },[file]);
  useEffect(()=>{
    if(!pdf)return;
    let cancelled=false;let render:RenderTask|undefined;
    setLoading(true);setError("");
    (async()=>{try{
      const p=await pdf.getPage(page);if(cancelled||!canvas.current)return;
      const viewport=p.getViewport({scale:1.5*zoom});const target=canvas.current;
      target.width=viewport.width;target.height=viewport.height;
      const context=target.getContext("2d");if(!context)throw new Error("Canvas unavailable");
      render=p.render({canvas:target,canvasContext:context,viewport});await render.promise;
    }catch(e){if(!cancelled&&!(e instanceof Error&&e.name==="RenderingCancelledException"))setError("No se pudo mostrar esta página.");}
    finally{if(!cancelled)setLoading(false);}})();
    return()=>{cancelled=true;render?.cancel();};
  },[pdf,page,zoom]);
  return <aside className="preview" aria-label="Previsualización del PDF">
    <div className="preview-title"><h2>Documento original</h2><span>Validación visual</span></div>
    <div className="preview-controls"><button type="button" title="Página anterior" aria-label="Página anterior" disabled={!pdf||page<=1} onClick={()=>onPage(page-1)}><ChevronLeft size={17}/></button><span>Página {page} de {pdf?.numPages??"…"}</span><button type="button" title="Página siguiente" aria-label="Página siguiente" disabled={!pdf||page>=pdf.numPages} onClick={()=>onPage(page+1)}><ChevronRight size={17}/></button><select aria-label="Zoom del PDF" value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={1}>Ajustar ancho</option><option value={1.5}>150%</option><option value={2}>200%</option></select></div>
    {loading&&<p className="preview-status" role="status">Cargando página…</p>}{error&&<p role="alert" className="error">{error}</p>}
    <div className="canvas-scroll"><canvas ref={canvas} style={{width:`${zoom*100}%`}} aria-label={`Página ${page} del PDF ${file.name}`}/></div>
  </aside>;
}
