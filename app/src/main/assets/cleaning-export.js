(function(root){
'use strict';
const green='FFDDF2E1',red='FFFADADB';
const time=ms=>ms?new Date(ms).toLocaleString('es-ES',{hour12:false}):'';
const safe=s=>/^[\s]*[=+@-]/.test(String(s))?"'"+s:String(s??'');
async function excel(rows,options){
 const book=new root.ExcelJS.Workbook();book.creator=options.company;book.subject='Registro de Limpieza';
 const summary=book.addWorksheet('Resumen de Limpieza'),detail=book.addWorksheet('Registros Detallados');
 const groups=new Map();for(const r of rows){const key=r.date+'\0'+r.area;if(!groups.has(key))groups.set(key,{date:r.date,area:r.area,rows:[]});groups.get(key).rows.push(r);}
 const shifts=[...new Set(rows.filter(r=>r.kind==='daily').map(r=>r.shift))];
 const columns=['Fecha','Área',...shifts,'Periódica'];
 function setup(sheet,heads,widths){
  sheet.mergeCells(1,1,1,heads.length);sheet.getCell(1,1).value=safe(options.company+' · REGISTRO DE LIMPIEZA');
  sheet.mergeCells(2,1,2,heads.length);sheet.getCell(2,1).value=options.from+' — '+options.to;
  sheet.addRow(heads);sheet.columns.forEach((c,i)=>c.width=widths[i]||25);
  sheet.views=[{state:'frozen',ySplit:3}];sheet.autoFilter={from:{row:3,column:1},to:{row:3,column:heads.length}};
  for(const n of [1,3])sheet.getRow(n).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF005AC1'}};});
  sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};
 }
 setup(summary,columns,[16,30]);
 for(const g of groups.values()){
  const entries=[...shifts.map(s=>g.rows.filter(r=>r.kind==='daily'&&r.shift===s)),g.rows.filter(r=>r.kind==='periodic')];
  const line=summary.addRow([g.date,safe(g.area),...entries.map(rs=>rs.length?rs.map(r=>r.status+(r.person?' · '+r.person:'')).join('\n'):'—')]);
  entries.forEach((rs,i)=>{if(rs.length)line.getCell(i+3).fill={type:'pattern',pattern:'solid',fgColor:{argb:rs.every(r=>r.status==='Realizado')?green:red}};});
  line.height=Math.max(30,...entries.map(rs=>rs.length*30));line.alignment={wrapText:true,vertical:'top'};
 }
 setup(detail,['Fecha prevista','Área','Turno','Persona','Estado','Finalización real','Notas','Instrucciones'],[16,28,20,24,18,25,45,45]);
 for(const r of rows){const line=detail.addRow([r.date,safe(r.area),safe(r.shift),safe(r.person),r.status,time(r.completedAt),safe(r.notes),safe(r.instructions)]);line.getCell(5).fill={type:'pattern',pattern:'solid',fgColor:{argb:r.status==='Realizado'?green:red}};line.alignment={wrapText:true,vertical:'top'};}
 return new Uint8Array(await book.xlsx.writeBuffer());
}
async function pdf(rows,options,fontBytes){
 const {PDFDocument,rgb}=root.PDFLib,doc=await PDFDocument.create();doc.registerFontkit(root.fontkit);
 const bytes=fontBytes||new Uint8Array(await (await fetch('cleaning-vendor/NotoSans-Regular.ttf')).arrayBuffer());
 const font=await doc.embedFont(bytes,{subset:true});doc.setTitle('Registro de Limpieza');doc.setAuthor(options.company);doc.setLanguage('es-ES');
 let page,y,pageNo=0;const navy=rgb(.06,.2,.35);
 function draw(s,size=10,color=navy){
  // Wrap by glyph width, including long unbroken notes, without dropping text.
  for(const paragraph of String(s).replace(/[\u0000-\u0008\u000b-\u001f]/g,' ').split('\n')){
   let line='';for(const ch of paragraph){if(font.widthOfTextAtSize(line+ch,size)>519){lineOut(line,size,color);line='';}line+=ch;}lineOut(line,size,color);
  }
 }
 function newPage(){page=doc.addPage([595,842]);pageNo++;y=800;page.drawText('REGISTRO DE LIMPIEZA',{x:38,y,font,size:16,color:navy});y-=26;
  page.drawText(options.from+' — '+options.to,{x:38,y,font,size:10,color:navy});y-=22;
  page.drawText('Página '+pageNo,{x:480,y:25,font,size:9,color:navy});
  draw(options.company,11);
 }
 function lineOut(line,size,color){if(y<55)newPage();page.drawText(line,{x:38,y,font,size,color});y-=size+5;}
 newPage();draw('Controles: '+rows.length);y-=10;
 for(const r of rows){if(y<170)newPage();draw(r.date+' · '+r.area,12);draw('Turno: '+r.shift+' · Previsto: '+(r.kind==='daily'?r.plannedTime:'Periódico'));
  draw('Estado: '+r.status,11,r.status==='Realizado'?rgb(.05,.4,.2):rgb(.7,.06,.06));
  draw('Persona: '+(r.person||'Sin asignar'));draw('Finalización real: '+(time(r.completedAt)||'Sin realizar'));
  if(r.instructions)draw('Instrucciones: '+r.instructions);
  draw('Notas: '+(r.notes||'—'));y-=14;
 }
 if(!rows.length)draw('No hay controles planificados en el intervalo seleccionado.');
 return await doc.save();
}
root.RTCleaningExport={excel,pdf};
})(typeof window!=='undefined'?window:globalThis);
