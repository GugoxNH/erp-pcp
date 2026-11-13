"use client";
import {useEffect,useState} from "react";
import {parseConsignmentHtml,readHtmlFile} from "../lib/consignment-html";
export default function HtmlPreview({file}:{file:File}) {
  const [data,setData]=useState<ReturnType<typeof parseConsignmentHtml>|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{let active=true;setData(null);setError("");readHtmlFile(file).then(text=>{if(active)setData(parseConsignmentHtml(text));}).catch(()=>{if(active)setError("No se pudo abrir el HTML.");});return ()=>{active=false;};},[file]);
  return <aside className="preview"><div className="preview-title"><h2>Documento HTML</h2></div><div className="html-order-preview">{error||(!data?"Cargando documento…":null)}{data&&<><div>{data.lines.slice(0,data.lines.indexOf("Proveedor")).map((line,i)=><p key={i}>{line}</p>)}</div><table><tbody>{data.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></>}</div></aside>;
}
