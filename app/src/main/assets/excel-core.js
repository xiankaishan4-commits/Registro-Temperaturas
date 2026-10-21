(function (root) {
  'use strict';
  // Excel OOXML without external libraries or network access. Caller packages the
  // returned UTF-8 XML files into the application's existing stored-ZIP writer.
  // This module does not read/write IndexedDB and never modifies temperature data.
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  function xml(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
  }
  function safeText(value) {
    let v = String(value == null ? '' : value);
    // Excel cells beginning with these characters can become formulas in other
    // exporters. All strings here use t=inlineStr (never formula cells) as well.
    if (/^[\s\t]*[=+@]/.test(v) || /^[\s\t]*-(?![\d.,])/.test(v)) v = "'" + v;
    return v.substring(0,32767);
  }
  function label(row, col) { let n=col+1, out=''; while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out+(row+1); }
  function cell(row, col, value, style) {
    const ref=label(row,col), st=' s="'+style+'"';
    if (value == null || value === '') return '<c r="'+ref+'"'+st+'/>';
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return '<c r="'+ref+'"'+st+'/>';
      return '<c r="'+ref+'"'+st+'><v>'+value+'</v></c>';
    }
    return '<c r="'+ref+'"'+st+' t="inlineStr"><is><t xml:space="preserve">'+xml(safeText(value))+'</t></is></c>';
  }
  function excelDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||''))) return null;
    const m=String(iso).split('-').map(Number);
    const day=Date.UTC(m[0],m[1]-1,m[2]);
    const check=new Date(day);
    if(check.getUTCFullYear()!==m[0]||check.getUTCMonth()+1!==m[1]||check.getUTCDate()!==m[2])return null;
    return day/86400000+25569;
  }
  function excelTime(hhmm) {
    const m=/^(\d{2}):(\d{2})$/.exec(String(hhmm||''));
    if(!m||Number(m[1])>23||Number(m[2])>59)return null;
    return (Number(m[1])*60+Number(m[2]))/1440;
  }
  function num(value) {
    if(value==null||value==='')return null;
    const n=Number(String(value).replace(',','.'));
    return Number.isFinite(n) ? n : null;
  }
  const detailHeaders=['Fecha','Equipo','Hora','Temperatura (°C)','Mín. (°C)','Máx. (°C)','Estado','Responsable','Observaciones'];
  function normalized(rows) {
    return rows.map(r=> {
      const val=num(r.temperatura), min=num(r.minTemp), max=num(r.maxTemp);
      const status=val==null?'SIN MEDICIÓN':min!=null&&max!=null&&(val<min||val>max)?'FUERA DE RANGO':min==null||max==null?'SIN RANGO':'CORRECTO';
      return {
        fecha:r.fecha||'',equipo:r.equipo||'',hora:r.hora||'',temperatura:val,
        minTemp:min,maxTemp:max,estado:status,responsable:r.responsable||'',observaciones:r.observaciones||''
      };
    }).sort((a,b)=>b.fecha.localeCompare(a.fecha)||a.equipo.localeCompare(b.equipo,'es')||a.hora.localeCompare(b.hora));
  }
  function excelRows(records) {return records.map(r=>[
    excelDate(r.fecha),r.equipo,excelTime(r.hora),r.temperatura,r.minTemp,r.maxTemp,r.estado,r.responsable,r.observaciones
  ]);}
  function dailyRows(records) {
    const byDate=new Map();
    for(const r of records){
      let item=byDate.get(r.fecha);
      if(!item){item={day:r.fecha,total:0,measured:0,omitted:0,alert:0,equipment:new Set()};byDate.set(r.fecha,item);}
      item.total++; if(r.temperatura==null)item.omitted++;else item.measured++;
      if(r.estado==='FUERA DE RANGO')item.alert++;
      item.equipment.add(r.equipo);
    }
    return Array.from(byDate.values()).sort((a,b)=>b.day.localeCompare(a.day)).map(s=>[
      excelDate(s.day),s.total,s.measured,s.omitted,s.alert,s.equipment.size
    ]);
  }
  function equipmentRows(records) {
    const byName=new Map();
    for(const r of records){
      let item=byName.get(r.equipo);
      if(!item){item={name:r.equipo,total:0,measured:0,omitted:0,alert:0,last:''};byName.set(r.equipo,item);}
      item.total++;if(r.temperatura==null)item.omitted++;else item.measured++;
      if(r.estado==='FUERA DE RANGO')item.alert++;
      if(r.fecha>item.last)item.last=r.fecha;
    }
    return Array.from(byName.values()).sort((a,b)=>a.name.localeCompare(b.name,'es')).map(s=>[
      s.name,s.total,s.measured,s.omitted,s.alert,excelDate(s.last)
    ]);
  }
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS}"><numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="0.0 &quot;°C&quot;"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/><color rgb="FF243447"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF9A3412"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17457A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE5DF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  function worksheet(headers, rows, options) {
    const count=options.widths.length, endCol=label(0,count-1).replace(/\d/g,''), endRow=rows.length+1;
    const widths=options.widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');
    const result=[`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}">`,
      `<dimension ref="A1:${endCol}${endRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${widths}</cols><sheetData>`,
      '<row r="1" ht="26" customHeight="1">'+headers.map((v,i)=>cell(0,i,v,1)).join('')+'</row>'];
    for(let i=0;i<rows.length;i++){
      result.push(`<row r="${i+2}">`+rows[i].map((v,j)=> {
        const style=options.dates.includes(j)?2:options.times.includes(j)?3:options.temps.includes(j)?4:options.statusCol===j&&v==='FUERA DE RANGO'?5:0;
        return cell(i+1,j,v,style);
      }).join('')+'</row>');
    }
    result.push('</sheetData>',`<autoFilter ref="A1:${endCol}${endRow}"/>`);
    result.push(`<pageMargins left="0.3" right="0.3" top="0.55" bottom="0.55" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9"/></worksheet>`);
    return result.join('');
  }
  function build(rows, options={}){
    if(!Array.isArray(rows)||rows.length===0)throw new Error('No hay registros para exportar');
    if(rows.length>25000)throw new Error('Demasiados registros para un solo Excel. Selecciona un mes o un equipo.');
    const records=normalized(rows), months=new Map();
    for(const r of records){const month=r.fecha.slice(0,7);if(!/^\d{4}-\d{2}$/.test(month))continue;
      if(!months.has(month))months.set(month,[]);months.get(month).push(r);}
    const sheets=[
      {name:'Resumen diario',headers:['Fecha','Registros','Mediciones','Sin medición','Fuera de rango','Equipos distintos'],data:dailyRows(records),widths:[18,16,18,19,19,19],dates:[0],times:[],temps:[],statusCol:-1},
      {name:'Resumen equipos',headers:['Equipo','Registros','Mediciones','Sin medición','Fuera de rango','Última fecha'],data:equipmentRows(records),widths:[39,16,18,19,19,18],dates:[5],times:[],temps:[],statusCol:-1},
      {name:'Registros',headers:detailHeaders,data:excelRows(records),widths:[17,39,13,20,17,17,23,23,42],dates:[0],times:[2],temps:[3,4,5],statusCol:6}
    ];
    // With multiple days, month tabs avoid searching a giant sheet. The master
    // 'Registros' sheet always includes every selected record.
    if(months.size<=24){
      for(const month of Array.from(months.keys()).sort().reverse())sheets.push({
        name:month,headers:detailHeaders,data:excelRows(months.get(month)),widths:[17,39,13,20,17,17,23,23,42],dates:[0],times:[2],temps:[3,4,5],statusCol:6
      });
    }
    const bookSheets=sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('');
    const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${bookSheets}</sheets></workbook>`;
    const relationships=sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="${REL}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+
      `<Relationship Id="rId${sheets.length+1}" Type="${REL}/styles" Target="styles.xml"/>`;
    const files=[
      {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
      {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
      {name:'xl/workbook.xml',data:workbook},
      {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`},
      {name:'xl/styles.xml',data:styles}
    ];
    sheets.forEach((s,i)=>files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:worksheet(s.headers,s.data,s)}));
    return files;
  }
  root.RTExcel={build, excelDate, excelTime, normalized, dailyRows, equipmentRows};
})(typeof window !== 'undefined' ? window : globalThis);
