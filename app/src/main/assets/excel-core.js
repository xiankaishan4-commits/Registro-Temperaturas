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

function validDate(s){
 if(!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s||'')))return false;
 const d=new Date(s+'T00:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
}
function prepare(rows,devices,options={}){
 if(!Array.isArray(devices))throw Error('Equipos no válidos');
 const selected=options.deviceId&&options.deviceId!=='ALL'?String(options.deviceId):null;
 const chosen=selected?devices.filter(d=>String(d.id)===selected):devices;
 const all=normalized(rows),recordDates=all.map(r=>r.fecha).filter(validDate).sort();
 const from=options.from||(options.month?options.month+'-01':recordDates[0]);
 const to=options.to||(options.month?options.month+'-'+String(monthInfo(options.month).days).padStart(2,'0'):recordDates[recordDates.length-1]);
 if(!from||!to)throw Error('Selecciona las fechas Desde / Hasta');
 if(!validDate(from)||!validDate(to))throw Error('Fecha no válida (Desde / Hasta)');
 if(from>to)throw Error('La fecha inicial es posterior a la final');
 const first=monthInfo(from.slice(0,7)),last=monthInfo(to.slice(0,7));
 if((last.year-first.year)*12+(last.month-first.month)+1>36)throw Error('Intervalo demasiado largo: máximo 36 meses');
 const names=new Map();
 chosen.forEach((d,i)=>{
  const name=safe(d.nombre||d.name||'').trim();
  if(!name)return;
  if(!names.has(name))names.set(name,{name,orden:rank(d),i});
  else names.get(name).orden=Math.min(names.get(name).orden,rank(d));
 });
 const records=all.filter(r=>validDate(r.fecha)&&r.fecha>=from&&r.fecha<=to&&(!selected||names.has(r.equipo)));
 if(records.length>25000)throw Error('Demasiados registros: selecciona menos fechas o equipos');
 for(const r of records)if(!selected&&r.equipo.trim()&&!names.has(r.equipo))names.set(r.equipo,{name:r.equipo,orden:Number.MAX_SAFE_INTEGER,i:names.size});
 const equipments=[...names.values()].sort((a,b)=>a.orden-b.orden||collator.compare(a.name,b.name)||a.i-b.i);
 const buckets=new Map();
 for(const r of records){
  if(!names.has(r.equipo)||r.temperatura==null||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora))continue;
  const k=r.equipo+'\u0000'+r.fecha;
  if(!buckets.has(k))buckets.set(k,[]);
  buckets.get(k).push(r);
 }
 const months=[];
 for(let y=first.year,m=first.month;y<last.year||(y===last.year&&m<=last.month);){
  const month=monthInfo(String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0'));
  const fromDay=month.key===from.slice(0,7)?Number(from.slice(8)):1;
  const toDay=month.key===to.slice(0,7)?Number(to.slice(8)):month.days;
  month.dateColumns=Array.from({length:toDay-fromDay+1},(_,i)=>i+fromDay);
  month.matrix=equipments.map(dev=>({name:dev.name,cells:month.dateColumns.map(day=>{
   const date=month.key+'-'+String(day).padStart(2,'0');
   const entries=(buckets.get(dev.name+'\u0000'+date)||[]).sort((a,b)=>a.hora.localeCompare(b.hora)||a.id.localeCompare(b.id));
   return {count:entries.length,highlight:entries.some(r=>r.observaciones.trim()),
    value:entries.map(r=>(entries.length===1?r.temperatura.toFixed(1)+'°C ('+r.hora+')':r.hora+': '+r.temperatura.toFixed(1)+'°C')+(r.observaciones.trim()?' — '+r.observaciones.trim():'')).join('\n')};
  })}));
  months.push(month);
  m++;if(m>12){m=1;y++;}
 }
 const details=records.filter(r=>names.has(r.equipo)).sort((a,b)=>a.fecha.localeCompare(b.fecha)||collator.compare(a.equipo,b.equipo)||a.hora.localeCompare(b.hora)||a.id.localeCompare(b.id));
 return {from,to,months,month:months.length===1?months[0]:null,equipments,details,headers};
}
const navy='FF183B62',head='FF2A6196',pale='FFF2F6FB',yellow='FFFFEFBE';
function styleHeader(c){c.font={bold:true,name:'Aptos',color:{argb:'FFFFFFFF'},size:11};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:head}};c.alignment={vertical:'middle',horizontal:'center',wrapText:true};}
function dateValue(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);return m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):null;}
function timeValue(h){const m=/^(\d{2}):(\d{2})$/.exec(h);return m&&+m[1]<24&&+m[2]<60?(+m[1]*60 + +m[2])/1440:null;}
async function build(rows,devices,options={}){
 const ExcelJS=root.ExcelJS;if(!ExcelJS||!ExcelJS.Workbook)throw Error('ExcelJS no está disponible en el APK.');
 const model=prepare(rows,devices,options),book=new ExcelJS.Workbook();book.creator='SHANFOODSGROUP';book.subject='Registro de temperaturas';book.created=new Date();
 model.months.forEach(item=>{
  const sheet=book.addWorksheet(model.months.length===1?'Resumen Mensual':'Resumen '+item.key,{
   views:[{state:'frozen',xSplit:1,ySplit:3,topLeftCell:'B4'}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
  const maxCol=item.dateColumns.length+1;
  sheet.mergeCells(1,1,1,maxCol);const title=sheet.getCell(1,1);
  title.value='REGISTRO DE TEMPERATURAS · '+item.key;
  title.font={bold:true,size:16,color:{argb:'FFFFFFFF'}};
  title.fill={type:'pattern',pattern:'solid',fgColor:{argb:navy}};
  title.alignment={vertical:'middle',indent:1};sheet.getRow(1).height=34;
  sheet.mergeCells(2,1,2,maxCol);
  const count=item.matrix.reduce((sum,r)=>sum+r.cells.reduce((n,c)=>n+c.count,0),0);
  sheet.getCell(2,1).value=model.from+' → '+model.to+' · '+model.equipments.length+' equipos · '+count+' mediciones · Vacío = sin lectura';
  sheet.getCell(2,1).font={italic:true,size:11,color:{argb:navy}};sheet.getRow(2).height=25;
  const h=sheet.getRow(3);h.getCell(1).value='Equipo';
  item.dateColumns.forEach((n,i)=>{h.getCell(i+2).value=String(n).padStart(2,'0');});
  h.eachCell(styleHeader);h.height=29;
  sheet.getColumn(1).width=39;item.dateColumns.forEach((n,i)=>{sheet.getColumn(i+2).width=23;});
  item.matrix.forEach((entry,i)=>{
   const row=sheet.getRow(i+4),left=row.getCell(1);
   left.value=entry.name;left.font={bold:true,color:{argb:navy}};
   left.alignment={vertical:'middle',wrapText:true};
   if(i%2)left.fill={type:'pattern',pattern:'solid',fgColor:{argb:pale}};
   let rowCount=1;
   entry.cells.forEach((cell,j)=>{
    const c=row.getCell(j+2);
    if(cell.value)c.value=safe(cell.value);
    if(cell.highlight)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:yellow}};
    else if(i%2)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:pale}};
    c.alignment={vertical:'middle',wrapText:true};
    rowCount=Math.max(rowCount,cell.count);
   });
   row.height=Math.min(140,Math.max(28,20*rowCount));
  });
  sheet.autoFilter={from:{row:3,column:1},to:{row:3+item.matrix.length,column:maxCol}};
 });
 const detail=book.addWorksheet('Registro Detallado',{views:[{state:'frozen',ySplit:1,topLeftCell:'A2'}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
 [39,23,19,22,28,55].forEach((w,i)=>detail.getColumn(i+1).width=w);
 const hr=detail.getRow(1);headers.forEach((name,i)=>{const c=hr.getCell(i+1);c.value=name;styleHeader(c);});hr.height=29;
 model.details.forEach((r,i)=>{
  const row=detail.getRow(i+2);
  row.values=[safe(r.equipo),dateValue(r.fecha),timeValue(r.hora),r.temperatura,safe(r.responsable),safe(r.observaciones)];
  row.getCell(2).numFmt='dd/mm/yyyy';row.getCell(3).numFmt='hh:mm';row.getCell(4).numFmt='0.0';
  row.getCell(6).alignment={wrapText:true,vertical:'middle'};row.height=23;
  if(i%2)for(let c=1;c<=6;c++)row.getCell(c).fill={type:'pattern',pattern:'solid',fgColor:{argb:pale}};
  if(r.observaciones.trim())row.getCell(6).fill={type:'pattern',pattern:'solid',fgColor:{argb:yellow}};
 });
 detail.autoFilter={from:'A1',to:'F'+Math.max(2,model.details.length+1)};
 return new Uint8Array(await book.xlsx.writeBuffer());
}
root.RTExcel={build,prepare,monthInfo,validDate,number,normalized,headers};
})(typeof window!=='undefined'?window:globalThis);