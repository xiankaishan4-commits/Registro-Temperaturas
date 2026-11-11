(function(root){
'use strict';
const DAY=86400000;
function date(ms=Date.now()){const d=new Date(ms);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function validDate(s){return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
function day(s){if(!validDate(s))throw Error('Fecha no válida');return Date.parse(s+'T00:00:00Z')/DAY;}
function next(s,n=1){return new Date((day(s)+n)*DAY).toISOString().slice(0,10);}
function text(s,max,required=false){if(typeof s!=='string'||s.length>max||(required&&!s.trim()))throw Error('Texto de limpieza no válido');}
function validatePlan(p){
 if(!p||typeof p!=='object')throw Error('Plan no válido');
 for(const key of ['id','taskId'])text(p[key],100,true);
 text(p.area,120,true);text(p.instructions,2000);text(p.assignee,120);
 if(!['daily','periodic'].includes(p.kind)||typeof p.active!=='boolean'||!validDate(p.effectiveFrom)||!validDate(p.startDate)||!Number.isFinite(p.createdAt)||p.createdAt<=0)throw Error('Plan de limpieza no válido');
 if(!['daily','weekly','monthly','interval'].includes(p.frequency))throw Error('Frecuencia no válida');
 if(!Number.isInteger(p.weekday)||p.weekday<0||p.weekday>6||!Number.isInteger(p.monthday)||p.monthday<1||p.monthday>31||!Number.isInteger(p.interval)||p.interval<1||p.interval>3650)throw Error('Frecuencia fuera de rango');
 if(!Array.isArray(p.slots)||!p.slots.length||p.slots.length>12)throw Error('Indica de 1 a 12 turnos');
 const ids=new Set(); for(const s of p.slots){text(s.id,40,true);text(s.name,60,true);if(ids.has(s.id)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time))throw Error('Turno no válido');ids.add(s.id);}
 return p;
}
function validateEvent(e){
 if(!e||typeof e!=='object')throw Error('Registro de limpieza no válido');
 for(const key of ['id','occurrenceId'])text(e[key],400,true);
 text(e.person,120,true);text(e.notes,2000);
 if(!['Realizado','Pendiente'].includes(e.status)||!Number.isFinite(e.recordedAt)||e.recordedAt<=0||
   (e.status==='Realizado' ? e.completedAt!==e.recordedAt : e.completedAt!==null))throw Error('Hora/estado de limpieza no válido');
 return e;
}
function validateBackup(data){
 if(data===undefined)return {schema:1,plans:[],events:[]};
 if(!data||data.schema!==1||!Array.isArray(data.plans)||!Array.isArray(data.events)||data.plans.length>10000||data.events.length>100000)throw Error('Copia de limpieza no válida');
 for(const [rows,check] of [[data.plans,validatePlan],[data.events,validateEvent]]){const ids=new Set();for(const row of rows){check(row);if(ids.has(row.id))throw Error('ID duplicado en limpieza');ids.add(row.id);}}
 return data;
}
function due(p,iso){
 if(iso<p.startDate)return false;
 const d=new Date(iso+'T00:00:00Z');
 if(p.kind==='daily'||p.frequency==='daily')return true;
 if(p.frequency==='weekly')return d.getUTCDay()===p.weekday;
 if(p.frequency==='monthly')return d.getUTCDate()===Math.min(p.monthday,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate());
 return (day(iso)-day(p.startDate))%p.interval===0;
}
function revisions(plans){
 const groups=new Map();for(const p of plans){if(!groups.has(p.taskId))groups.set(p.taskId,[]);groups.get(p.taskId).push(p);}
 for(const group of groups.values())group.sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)||a.createdAt-b.createdAt||a.id.localeCompare(b.id));
 return groups;
}
function latest(plans){return [...revisions(plans).values()].map(g=>g[g.length-1]);}
function rows(plans,events,filter={},today=date()){
 const from=filter.from||today,to=filter.to||today;
 if(!validDate(from)||!validDate(to)||from>to)throw Error('Selecciona un intervalo de fechas válido');
 const eventMap=new Map();
 for(const e of events){const old=eventMap.get(e.occurrenceId);if(!old||(old.status!=='Realizado'&&(e.status==='Realizado'||e.recordedAt>old.recordedAt))||(old.status===e.status&&e.recordedAt===old.recordedAt&&e.id>old.id))eventMap.set(e.occurrenceId,e);}
 const result=[];
 for(const group of revisions(plans).values()){
  const begin=Math.max(day(from),day(group[0].effectiveFrom)),end=Math.min(day(to),day(today));let rev=0;
  for(let n=begin;n<=end;n++){
   const iso=new Date(n*DAY).toISOString().slice(0,10);
   while(rev+1<group.length&&group[rev+1].effectiveFrom<=iso)rev++;
   const p=group[rev]; if(!p.active||!due(p,iso))continue;
   for(const slot of p.kind==='daily'?p.slots:[{id:'periodic',name:'Periódica',time:'00:00'}]){
    const id=p.id+'/'+iso+'/'+slot.id,e=eventMap.get(id);
    const row={id,taskId:p.taskId,planId:p.id,area:p.area,instructions:p.instructions,date:iso,shift:slot.name,kind:p.kind,
     plannedTime:slot.time,status:e?e.status:'Pendiente',person:e?e.person:p.assignee,notes:e?e.notes:'',completedAt:e?e.completedAt:null,recordedAt:e?e.recordedAt:null};
    if(filter.area&&filter.area!==row.area)continue;
    if(filter.person&&!row.person.toLocaleLowerCase('es').includes(filter.person.toLocaleLowerCase('es')))continue;
    if(filter.shift&&filter.shift!==(row.kind==='periodic'?'periodic':row.shift))continue;
    if(filter.status&&filter.status!==row.status)continue;
    result.push(row);if(result.length>50000)throw Error('Más de 50.000 controles. Selecciona un intervalo menor.');
   }
  }
 }
 return result.sort((a,b)=>a.date.localeCompare(b.date)||a.area.localeCompare(b.area,'es')||a.plannedTime.localeCompare(b.plannedTime)||a.id.localeCompare(b.id));
}
root.RTCleaningCore={date,validDate,next,day,validatePlan,validateEvent,validateBackup,due,latest,rows};
})(typeof window!=='undefined'?window:globalThis);
