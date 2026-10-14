import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjs from '../vendor/pdfjs/pdf.legacy.mjs';

// Small synthetic Japanese CID document with no /ToUnicode map, matching
// the font property that breaks iOS-exported MDC statements.
function makeCidPdf() {
  const text='ご利用明細書 お支払日 令和８年１１月１０日 当月ご請求額 52,170円';
  const hex=Buffer.from(text,'utf16le').swap16().toString('hex').toUpperCase();
  const content=Buffer.from('BT /F1 14 Tf 40 750 Td <'+hex+'> Tj ET\n');
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    Buffer.concat([Buffer.from('<< /Length '+content.length+' >>\nstream\n'),content,Buffer.from('endstream')]),
    '<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiMin-W3 /Encoding /UniJIS-UCS2-H /DescendantFonts [6 0 R] >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiMin-W3 /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 2 >> /DW 1000 /FontDescriptor 7 0 R >>',
    '<< /Type /FontDescriptor /FontName /HeiseiMin-W3 /Flags 6 /FontBBox [-123 -257 1001 910] /ItalicAngle 0 /Ascent 723 /Descent -241 /CapHeight 709 /StemV 69 >>'
  ];
  let pdf=Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n','latin1');
  const offsets=[0];
  objects.forEach((obj,i)=>{
    offsets.push(pdf.length);
    pdf=Buffer.concat([pdf,Buffer.from((i+1)+' 0 obj\n'),
      Buffer.isBuffer(obj)?obj:Buffer.from(obj),Buffer.from('\nendobj\n')]);
  });
  const pos=pdf.length;
  pdf=Buffer.concat([pdf,Buffer.from('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n')]);
  for(const off of offsets.slice(1))pdf=Buffer.concat([pdf,Buffer.from(String(off).padStart(10,'0')+' 00000 n \n')]);
  pdf=Buffer.concat([pdf,Buffer.from('trailer\n<< /Root 1 0 R /Size '+(objects.length+1)+' >>\nstartxref\n'+pos+'\n%%EOF\n')]);
  return new Uint8Array(pdf);
}

for(const name of ['Adobe-Japan1-UCS2','UniJIS-UCS2-H']){
  assert.ok(fs.statSync('vendor/pdfjs/cmaps/'+name+'.bcmap').size>20);
}
const doc=await pdfjs.getDocument({
  data:makeCidPdf(), cMapUrl:path.resolve('vendor/pdfjs/cmaps')+path.sep,
  cMapPacked:true, useSystemFonts:true, isEvalSupported:false
}).promise;
try {
  const page=await doc.getPage(1);
  const text=(await page.getTextContent()).items.map(t=>t.str).join(' ');
  assert.match(text,/ご利用明細書/);
  assert.match(text,/当月ご請求額/);
  assert.match(text,/52,170円/);
  console.log('Japanese CID without ToUnicode: PDF.js text extraction passed');
} finally {await doc.destroy();}
const importer=fs.readFileSync('mdc-pdf-import-v136.js','utf8');
assert.ok(importer.includes('cMapPacked:true'));
assert.ok(importer.includes("cMapUrl:'./vendor/pdfjs/cmaps/'"));
assert.ok(!importer.includes('pages.reduce((n,page)=>n+page.items.length,0)<25'));
