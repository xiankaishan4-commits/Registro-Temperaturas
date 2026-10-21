(function(root){
'use strict';
// ExcelJS 4.4.0 is packaged locally into the APK by GitHub Actions; no network required.
const headers=['Equipo','Fecha de medición','Hora de medición','Temperatura (°C)','Responsable','Observaciones'];
const collator=new Intl.Collator('es',{numeric:true,sensitivity:'base'});
function safe(v){let x=String(v==null?'':v).slice(0,32767);return /^[\s\t\r\n]*[=+@]/.test(x)?"'"+x:x;}
function number(v){if(v==null||v==='')return null;const x=Number(typeof v==='string'?v.replace(',','.'):v);return Number.isFinite(x)?x:null;}
function monthInfo(ym){let m=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(ym||''));if(!m)throw Error('Selecciona un mes válido (AAAA-MM)');let year=+m[1],month=+m[2];if(year<1900||year>9998)throw Error('Año fuera de rango');return {key:ym,year,month,days:new Date(Date.UTC(year,month,0)).getUTCDate()};}
function rank(d){const n=Number(d.orden);return d.orden!=null&&d.orden!==''&&Number.isInteger(n)&&n>0?n:Number.MAX_SAFE_INTEGER;}
function normalized(rows){if(!Array.isArray(rows))throw Error('Registros no válidos');return rows.map(r=>({equipo:safe(r.equipo||''),fecha:String(r.fecha||''),hora:String(r.hora||''),temperatura:number(r.temperatura),responsable:safe(r.responsable||''),observaciones:safe(r.observaciones||''),id:String(r.id||'')}));}
function prepare(rows,devices,options={}){
 if(!Array.isArray(devices))throw Error('Equipos no válidos');
 const month=monthInfo(options.month),selected=options.deviceId&&options.deviceId!=='ALL'?String(options.deviceId):null;
 const chosen=selected?devices.filter(d=>String(d.id)===selected):devices;
 const records=normalized(rows).filter(r=>r.fecha.startsWith(month.key+'-')&&/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)&&+r.fecha.slice(8,10)<=month.days);
 if(records.length>25000)throw Error('Demasiados registros: elige un equipo');
 const names=new Map();
 chosen.forEach((d,i)=>{const name=safe(d.nombre||d.name||'').trim();if(!name)return;if(!names.has(name))names.set(name,{name,orden:rank(d),i});else names.get(name).orden=Math.min(names.get(name).orden,rank(d));});
 for(const r of records)if(r.equipo.trim()&&!names.has(r.equipo))names.set(r.equipo,{name:r.equipo,orden:Number.MAX_SAFE_INTEGER,i:names.size});
 const equipments=[...names.values()].sort((a,b)=>a.orden-b.orden||collator.compare(a.name,b.name)||a.i-b.i);
 const buckets=new Map();for(const r of records){if(!names.has(r.equipo)||r.temperatura==null||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora))continue;const key=r.equipo+'\u0000'+r.fecha;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(r);}
 const matrix=equipments.map(d=>({name:d.name,cells:Array.from({length:month.days},(_,j)=>{const date=month.key+'-'+String(j+1).padStart(2,'0');const all=(buckets.get(d.name+'\u0000'+date)||[]).sort((a,b)=>a.hora.localeCompare(b.hora)||a.id.localeCompare(b.id));return {count:all.length,highlight:all.some(r=>r.observaciones.trim()),value:all.map(r=>(all.length===1?r.temperatura.toFixed(1)+'°C ('+r.hora+')':r.hora+': '+r.temperatura.toFixed(1)+'°C')+(r.observaciones.trim()?' — '+r.observaciones.trim():'')).join('\n')};})}));
 const details=records.filter(r=>names.has(r.equipo)).sort((a,b)=>a.fecha.localeCompare(b.fecha)||collator.compare(a.equipo,b.equipo)||a.hora.localeCompare(b.hora)||a.id.localeCompare(b.id));
 return {month,equipments,matrix,details,headers};
}
const navy='FF183B62',head='FF2A6196',pale='FFF2F6FB',yellow='FFFFEFBE';
function styleHeader(c){c.font={bold:true,name:'Aptos',color:{argb:'FFFFFFFF'},size:11};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:head}};c.alignment={vertical:'middle',horizontal:'center',wrapText:true};}
function dateValue(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);return m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):null;}
function timeValue(h){const m=/^(\d{2}):(\d{2})$/.exec(h);return m&&+m[1]<24&&+m[2]<60?(+m[1]*60 + +m[2])/1440:null;}
async function build(rows,devices,options={}){
 const ExcelJS=root.ExcelJS;if(!ExcelJS||!ExcelJS.Workbook)throw Error('ExcelJS no está disponible en el APK.');
 const model=prepare(rows,devices,options),book=new ExcelJS.Workbook();book.creator='SHANFOODSGROUP';book.subject='Registro de temperaturas';book.created=new Date();
 const month=book.addWorksheet('Resumen Mensual',{views:[{state:'frozen',xSplit:1,ySplit:3,topLeftCell:'B4'}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
 const maxCol=model.month.days+1;
 month.mergeCells(1,1,1,maxCol);const title=month.getCell(1,1);title.value='REGISTRO DE TEMPERATURAS · '+model.month.key;title.font={bold:true,size:16,color:{argb:'FFFFFFFF'}};title.fill={type:'pattern',pattern:'solid',fgColor:{argb:navy}};title.alignment={vertical:'middle',indent:1};month.getRow(1).height=34;
 month.mergeCells(2,1,2,maxCol);month.getCell(2,1).value=model.equipments.length+' equipos · '+model.details.length+' registros · Casillas en blanco = sin medición';month.getCell(2,1).font={italic:true,size:11,color:{argb:navy}};month.getRow(2).height=25;
 const h=month.getRow(3);h.getCell(1).value='Equipo';for(let n=1;n<=model.month.days;n++)h.getCell(n+1).value=String(n).padStart(2,'0');h.eachCell(styleHeader);h.height=29;
 month.getColumn(1).width=39;for(let n=1;n<=model.month.days;n++)month.getColumn(n+1).width=23;
 model.matrix.forEach((item,i)=>{const row=month.getRow(i+4);const left=row.getCell(1);left.value=item.name;left.font={bold:true,color:{argb:navy}};left.alignment={vertical:'middle',wrapText:true};if(i%2)left.fill={type:'pattern',pattern:'solid',fgColor:{argb:pale}};let count=1;item.cells.forEach((entry,j)=>{const c=row.getCell(j+2);if(entry.value)c.value=safe(entry.value);if(entry.highlight)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:yellow}};else if(i%2)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:pale}};c.alignment={vertical:'middle',wrapText:true};count=Math.max(count,entry.count);});row.height=Math.min(140,Math.max(28,20*count));});
 month.autoFilter={from:{row:3,column:1},to:{row:3+model.matrix.length,column:maxCol}};
 const detail=book.addWorksheet('Registro Detallado',{views:[{state:'frozen',ySplit:1,topLeftCell:'A2'}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
 [39,23,19,22,28,55].forEach((w,i)=>detail.getColumn(i+1).width=w);
 const hr=detail.getRow(1);headers.forEach((name,i)=>{const c=hr.getCell(i+1);c.value=name;styleHeader(c);});hr.height=29;
 model.details.forEach((r,i)=>{const row=detail.getRow(i+2);row.values=[safe(r.equipo),dateValue(r.fecha),timeValue(r.hora),r.temperatura,safe(r.responsable),safe(r.observaciones)];row.getCell(2).numFmt='dd/mm/yyyy';row.getCell(3).numFmt='hh:mm';row.getCell(4).numFmt='0.0';row.getCell(6).alignment={wrapText:true,vertical:'middle'};row.height=23;if(i%2)for(let c=1;c<=6;c++)row.getCell(c).fill={type:'pattern',pattern:'solid',fgColor:{argb:pale}};if(r.observaciones.trim())row.getCell(6).fill={type:'pattern',pattern:'solid',fgColor:{argb:yellow}};});
 detail.autoFilter={from:'A1',to:'F'+Math.max(2,model.details.length+1)};
 return new Uint8Array(await book.xlsx.writeBuffer());
}
root.RTExcel={build,prepare,monthInfo,number,normalized,headers};
})(typeof window!=='undefined'?window:globalThis);