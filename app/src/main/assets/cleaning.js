(function(root){
'use strict';
const C=root.RTCleaningCore,STORES=['limpiezaPlanes','limpiezaEventos'];
let api,plans=[],events=[],selected=null,busy=false;
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function all(store){return new Promise((resolve,reject)=>{const r=api.db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function refresh(){[plans,events]=await Promise.all(STORES.map(all));}
function snapshot(){return {schema:1,plans,events};}
function add(store,item){return new Promise((resolve,reject)=>{const tx=api.db.transaction(store,'readwrite');tx.objectStore(store).add(item);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('No se pudo guardar'));});}
const uid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
function open(){api.switchView('view-cleaning');refresh().then(render).catch(e=>api.showSnackbar(e.message));}
function filter(){return {from:$('clFrom').value,to:$('clTo').value,area:$('clAreaFilter').value,person:$('clPersonFilter').value.trim(),shift:$('clShiftFilter').value,status:$('clStatusFilter').value};}
function card(r){return `<div class="m3-card cleaning-record"><strong>${esc(r.area)}</strong><p>${r.date} · ${esc(r.shift)} · ${r.plannedTime}</p><p class="${r.status==='Realizado'?'cl-done':'cl-pending'}">${r.status}</p><p>${esc(r.instructions)}</p><p>${esc(r.person||'Sin asignar')}${r.completedAt?' · '+esc(new Date(r.completedAt).toLocaleString('es-ES')):''}</p><p>${esc(r.notes)}</p>${r.status==='Pendiente'?`<button class="m3-btn m3-btn-primary" data-complete="${esc(r.id)}">Registrar limpieza</button>`:''}</div>`;}
function render(){
 const today=C.date(),todayRows=C.rows(plans,events,{from:today,to:today});
 const prior=C.rows(plans,events,{from:plans.map(p=>p.effectiveFrom).sort()[0]||today,to:today}).filter(r=>r.date<today&&r.status==='Pendiente');
 $('clDailyRows').innerHTML=todayRows.filter(r=>r.kind==='daily').map(card).join('')||'<p>No hay controles previstos para hoy.</p>';
 $('clDailyBacklog').textContent=prior.filter(r=>r.kind==='daily').length+' controles diarios anteriores pendientes. Consulta Historial para registrarlos.';
 $('clPeriodicRows').innerHTML=[...prior.filter(r=>r.kind==='periodic'),...todayRows.filter(r=>r.kind==='periodic')].map(card).join('')||'<p>No hay controles periódicos pendientes ni previstos para hoy.</p>';
 const current=C.latest(plans);
 $('clPlans').innerHTML=current.filter(p=>p.active).map(p=>`<div class="m3-card"><strong>${esc(p.area)}</strong> · ${p.kind==='daily'?'Diaria':'Periódica'}<p>${esc(p.instructions)} · ${esc(p.assignee)}</p><p>${p.kind==='daily'?esc(p.slots.map(s=>s.name+' '+s.time).join(' / ')):esc({daily:'Cada día',weekly:'Cada semana',monthly:'Cada mes',interval:'Cada '+p.interval+' días'}[p.frequency])} · Vigente desde ${p.effectiveFrom}</p><button type="button" class="m3-btn m3-btn-outline" data-plan-edit="${esc(p.id)}">Modificar</button> <button type="button" class="m3-btn m3-btn-danger-outline" data-plan-delete="${esc(p.id)}">Eliminar</button></div>`).join('')||'<p>Añade áreas y tareas para empezar.</p>';
 const area=$('clAreaFilter').value,shift=$('clShiftFilter').value;
 $('clAreaFilter').innerHTML='<option value="">Todas las áreas</option>'+[...new Set(plans.map(p=>p.area))].sort().map(a=>`<option>${esc(a)}</option>`).join('');$('clAreaFilter').value=area;
 $('clShiftFilter').innerHTML='<option value="">Todos los turnos</option><option value="periodic">Periódica</option>'+[...new Set(plans.filter(p=>p.kind==='daily').flatMap(p=>p.slots.map(s=>s.name)))].map(s=>`<option>${esc(s)}</option>`).join('');$('clShiftFilter').value=shift;
 $('clPeople').innerHTML=[...new Set([...events.map(e=>e.person),...plans.map(p=>p.assignee)].filter(Boolean))].map(n=>`<option value="${esc(n)}"></option>`).join('');
 renderHistory();
}
function renderHistory(){try{const rows=C.rows(plans,events,filter());$('clHistoryRows').innerHTML=rows.map(card).join('')||'<p>No hay controles en el intervalo.</p>';$('clHistoryCount').textContent=rows.length+' controles (incluye pendientes sin registrar)';}catch(e){$('clHistoryCount').textContent=e.message;}}
function editPlan(p,kind){
 $('clPlanForm').reset();$('clPlanId').value=p?p.id:'';$('clKind').value=p?p.kind:kind;
 $('clPlanArea').value=p?p.area:'';$('clInstructions').value=p?p.instructions:'';$('clAssignee').value=p?p.assignee:'';
 $('clStart').value=p?p.startDate:C.date();$('clStart').min=p?'':C.date();$('clFrequency').value=p?p.frequency:'daily';$('clWeekday').value=p?p.weekday:1;$('clMonthday').value=p?p.monthday:1;$('clInterval').value=p?p.interval:15;
 $('clSlots').value=p?p.slots.map(s=>s.name+' | '+s.time).join('\n'):'Mañana | 09:00\nNoche | 21:00';
 $('clScheduleNotice').textContent=p?'Los cambios se aplican desde mañana. Hoy y el historial se conservan.':'El plan empieza en la fecha indicada; no se inventan controles anteriores.';
 $('clDailyFields').classList.toggle('hidden',$('clKind').value!=='daily');$('clPeriodicFields').classList.toggle('hidden',$('clKind').value!=='periodic');$('clPlanModal').classList.remove('hidden');
}
async function attach(config){
 api=config;await refresh();
 $('cleaningRoot').innerHTML=`
 <div class="m3-card"><button class="m3-btn m3-btn-outline" id="clBack">Volver a Inicio</button><h2>Registro de Limpieza</h2>
 <div class="cl-tabs"><button class="m3-btn m3-btn-tonal" data-cl-tab="clDaily">Limpieza diaria</button><button class="m3-btn m3-btn-tonal" data-cl-tab="clPeriodic">Limpieza periódica</button><button class="m3-btn m3-btn-tonal" data-cl-tab="clHistory">Historial / Exportar Excel / PDF</button><button class="m3-btn m3-btn-outline" data-cl-tab="clAdmin">Administrar áreas y tareas</button></div></div>
 <div id="clDaily" class="cl-panel"><h3>Limpieza diaria · Hoy</h3><p id="clDailyBacklog"></p><div id="clDailyRows"></div></div>
 <div id="clPeriodic" class="cl-panel hidden"><h3>Limpieza periódica · Hoy y pendientes anteriores</h3><div id="clPeriodicRows"></div></div>
 <div id="clHistory" class="cl-panel hidden"><div class="m3-card"><h3>Historial de limpieza</h3><p>Las tareas pendientes se conservan aunque nadie las registre. Los controles futuros no se incluyen.</p>
 <div class="m3-field-row"><div class="m3-field"><label for="clFrom">Desde</label><input type="date" id="clFrom" class="m3-input"></div><div class="m3-field"><label for="clTo">Hasta</label><input type="date" id="clTo" class="m3-input"></div></div>
 <label for="clAreaFilter">Área</label><select id="clAreaFilter" class="m3-select"></select><label for="clPersonFilter">Persona</label><input id="clPersonFilter" class="m3-input" list="clPeople"><label for="clShiftFilter">Turno</label><select id="clShiftFilter" class="m3-select"></select><label for="clStatusFilter">Estado</label><select id="clStatusFilter" class="m3-select"><option value="">Todos</option><option>Realizado</option><option>Pendiente</option></select>
 <p id="clHistoryCount" role="status"></p><button id="clExcel" class="m3-btn m3-btn-primary">Exportar Excel</button> <button id="clPdf" class="m3-btn m3-btn-tonal">Exportar PDF</button><p>Los informes incluyen todos los estados del intervalo, área, persona y turno elegidos, aunque el filtro de pantalla muestre solo realizados.</p></div><div id="clHistoryRows"></div></div>
 <div id="clAdmin" class="cl-panel hidden"><div class="m3-card"><h3>Administración</h3><button id="clAddDaily" class="m3-btn m3-btn-primary">Añadir área diaria</button> <button id="clAddPeriodic" class="m3-btn m3-btn-tonal">Añadir tarea periódica</button><p>Modificar o eliminar cambia el plan desde mañana y conserva el historial. El último día del mes se usa si el día indicado no existe.</p></div><div id="clPlans"></div></div>
 <datalist id="clPeople"></datalist>
 <div id="clPlanModal" class="m3-modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="Plan de limpieza"><div class="m3-modal-sheet"><h3>Área / tarea de limpieza</h3><form id="clPlanForm">
 <input id="clPlanId" type="hidden"><input id="clKind" type="hidden"><label for="clPlanArea">Área *</label><input id="clPlanArea" class="m3-input" maxlength="120" placeholder="Horno, Baño, Panadería…" required>
 <label for="clInstructions">Instrucciones</label><textarea id="clInstructions" class="m3-input" maxlength="2000"></textarea><label for="clAssignee">Persona responsable</label><input id="clAssignee" class="m3-input" maxlength="120" list="clPeople">
 <label for="clStart">Fecha de inicio / referencia</label><input id="clStart" type="date" class="m3-input" required><div id="clDailyFields"><label for="clSlots">Turnos (uno por línea: nombre | HH:MM)</label><textarea id="clSlots" class="m3-input" rows="3"></textarea></div>
 <div id="clPeriodicFields"><label for="clFrequency">Frecuencia</label><select id="clFrequency" class="m3-select"><option value="daily">Cada día</option><option value="weekly">Cada semana</option><option value="monthly">Cada mes</option><option value="interval">Cada N días</option></select><label for="clWeekday">Día semanal</label><select id="clWeekday" class="m3-select"><option value="1">Lunes</option><option value="2">Martes</option><option value="3">Miércoles</option><option value="4">Jueves</option><option value="5">Viernes</option><option value="6">Sábado</option><option value="0">Domingo</option></select><label for="clMonthday">Día mensual (1–31)</label><input id="clMonthday" class="m3-input" type="number" min="1" max="31" value="1"><label for="clInterval">Intervalo en días</label><input id="clInterval" class="m3-input" type="number" min="1" max="3650" value="15"></div>
 <p id="clScheduleNotice"></p><button type="submit" class="m3-btn m3-btn-primary">Guardar plan</button> <button type="button" data-cl-close="clPlanModal" class="m3-btn m3-btn-outline">Cancelar</button></form></div></div>
 <div id="clRecordModal" class="m3-modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="Registrar limpieza"><div class="m3-modal-sheet"><h3 id="clRecordTitle"></h3><form id="clRecordForm"><label for="clPerson">Persona *</label><input id="clPerson" class="m3-input" list="clPeople" maxlength="120" required><label for="clStatus">Estado</label><select id="clStatus" class="m3-select"><option>Realizado</option><option>Pendiente</option></select><label for="clNotes">Notas (opcional)</label><textarea id="clNotes" class="m3-input" maxlength="2000"></textarea><p>La fecha y hora reales se registran automáticamente al confirmar. Un control atrasado mantiene su fecha prevista.</p><button type="submit" class="m3-btn m3-btn-primary">Guardar registro</button> <button type="button" data-cl-close="clRecordModal" class="m3-btn m3-btn-outline">Cancelar</button></form></div></div>`;
 $('clFrom').value=C.date().slice(0,7)+'-01';$('clTo').value=C.date();
 $('btnOpenCleaning').onclick=open;$('clBack').onclick=()=>api.switchView('view-home');
 $('cleaningRoot').addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.clTab){document.querySelectorAll('.cl-panel').forEach(el=>el.classList.toggle('hidden',el.id!==b.dataset.clTab));await refresh();render();}
  if(b.dataset.clClose)$(b.dataset.clClose).classList.add('hidden');
  if(b.dataset.planEdit)editPlan(plans.find(p=>p.id===b.dataset.planEdit));
  if(b.dataset.planDelete&&!busy){const p=plans.find(p=>p.id===b.dataset.planDelete);if(!confirm('¿Eliminar este plan desde mañana? Se conservarán hoy y todo el historial.'))return;busy=true;try{await add(STORES[0],{...p,id:uid(),active:false,effectiveFrom:C.next(C.date()),createdAt:Date.now()});await refresh();render();}catch(err){api.showSnackbar(err.message);}finally{busy=false;}}
  if(b.dataset.complete){const id=b.dataset.complete;selected=C.rows(plans,events,{from:plans.map(p=>p.effectiveFrom).sort()[0],to:C.date()}).find(r=>r.id===id);if(!selected||selected.status==='Realizado')return;
   $('clRecordForm').reset();$('clRecordTitle').textContent=selected.area+' · '+selected.date+' · '+selected.shift;$('clPerson').value=selected.person;$('clNotes').value=selected.notes;$('clRecordModal').classList.remove('hidden');}
 });
 $('clAddDaily').onclick=()=>editPlan(null,'daily');$('clAddPeriodic').onclick=()=>editPlan(null,'periodic');
 $('clPlanForm').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;try{
  const old=plans.find(p=>p.id===$('clPlanId').value),today=C.date(),start=$('clStart').value;
  if(!old&&start<today)throw Error('Un plan nuevo no puede crear controles anteriores a hoy.');
  const slots=$('clSlots').value.trim().split('\n').map((line,i)=>{const [name,time]=line.split('|').map(s=>s.trim());return {id:String(i),name,time};});
  const p=C.validatePlan({id:uid(),taskId:old?old.taskId:uid(),kind:$('clKind').value,area:$('clPlanArea').value.trim(),instructions:$('clInstructions').value.trim(),assignee:$('clAssignee').value.trim(),active:true,createdAt:Date.now(),effectiveFrom:old?C.next(today):start,startDate:start,frequency:$('clFrequency').value,weekday:Number($('clWeekday').value),monthday:Number($('clMonthday').value),interval:Number($('clInterval').value),slots});
  await add(STORES[0],p);await refresh();render();$('clPlanModal').classList.add('hidden');api.showSnackbar('Plan guardado. Historial conservado.');
 }catch(err){api.showSnackbar(err.message);}finally{busy=false;}};
 $('clRecordForm').onsubmit=async e=>{e.preventDefault();if(busy||!selected)return;busy=true;try{
  const now=Date.now(),status=$('clStatus').value;
  const event=C.validateEvent({id:status==='Realizado'?'done:'+selected.id:uid(),occurrenceId:selected.id,person:$('clPerson').value.trim(),notes:$('clNotes').value.trim(),status,recordedAt:now,completedAt:status==='Realizado'?now:null});
  await add(STORES[1],event);await refresh();render();$('clRecordModal').classList.add('hidden');api.showSnackbar('Registro de limpieza guardado');
 }catch(err){api.showSnackbar('No se pudo guardar: '+err.message);}finally{busy=false;}};
 for(const id of ['clFrom','clTo','clAreaFilter','clPersonFilter','clShiftFilter','clStatusFilter'])$(id).oninput=renderHistory;
 async function exportReport(kind){if(busy)return;busy=true;$('clExcel').disabled=$('clPdf').disabled=true;try{await refresh();const f={...filter(),status:''},rows=C.rows(plans,events,f),options={...f,company:api.getCompany()};const bytes=await root.RTCleaningExport[kind](rows,options);await api.saveFile(new Blob([bytes],{type:kind==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`Limpieza_${f.from}_${f.to}.${kind==='pdf'?'pdf':'xlsx'}`);api.showSnackbar('Informe de limpieza preparado');}catch(err){api.showSnackbar('Error de exportación: '+err.message);}finally{busy=false;$('clExcel').disabled=$('clPdf').disabled=false;}}
 $('clExcel').onclick=()=>exportReport('excel');$('clPdf').onclick=()=>exportReport('pdf');
 render();setInterval(()=>{if($('view-cleaning').classList.contains('active'))refresh().then(render).catch(e=>api.showSnackbar(e.message));},60000);
}
root.RTCleaning={attach,refresh,snapshot,validateBackup:C.validateBackup,open};
})(window);
