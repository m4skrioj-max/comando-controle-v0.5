/* COMANDO DE CONTROLE — v0.5
   Dados locais: IndexedDB. Sem API externa e sem monitoramento de outros aplicativos. */
const DB_NAME="comandoControleDB", DB_VERSION=2, KEY="campaign";
const defaults={
  profile:{xp:0,credits:0,medals:0,power:100,precision:10,defense:10,energy:100},
  inventory:{scrap:0,cores:0,intel:0,plates:0},
  equipment:{armor:1,terminal:1,uniform:1,reinforcedArmor:0,advancedTerminal:0,intelSystem:0},
  mission:{claimed:false,progress:{theory:false,mapping:false,review:false,battery:false}},
  history:[],
  discipline:{
    settings:{reminderTime:"04:30",days:[1,2,3,4,5,6],dailyTarget:180,staleMinutes:45,notifications:false},
    sessions:[],interruptions:[],activeSession:null,activeInterruption:null,claimedMissions:[]
  }
};
let state, tickHandle=null, reminderHandle=null, staleNotifiedFor=null;
const $=id=>document.getElementById(id);
const clone=o=>JSON.parse(JSON.stringify(o));
function merge(base,saved){
  const s=saved||{};
  return {...clone(base),...s,
    profile:{...base.profile,...s.profile},
    inventory:{...base.inventory,...s.inventory},
    equipment:{...base.equipment,...s.equipment},
    mission:{...base.mission,...s.mission,progress:{...base.mission.progress,...(s.mission?.progress||{})}},
    history:Array.isArray(s.history)?s.history:[],
    discipline:{...base.discipline,...s.discipline,
      settings:{...base.discipline.settings,...(s.discipline?.settings||{})},
      sessions:Array.isArray(s.discipline?.sessions)?s.discipline.sessions:[],
      interruptions:Array.isArray(s.discipline?.interruptions)?s.discipline.interruptions:[],
      claimedMissions:Array.isArray(s.discipline?.claimedMissions)?s.discipline.claimedMissions:[]}
  };
}
function openDB(){return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains("records"))req.result.createObjectStore("records")};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
async function loadState(){const db=await openDB();return new Promise((resolve,reject)=>{
  const tx=db.transaction("records","readonly"),req=tx.objectStore("records").get(KEY);
  req.onsuccess=()=>resolve(merge(defaults,req.result||{}));req.onerror=()=>reject(req.error);
});}
async function saveState(){const db=await openDB();return new Promise((resolve,reject)=>{
  const tx=db.transaction("records","readwrite");tx.objectStore("records").put(state,KEY);
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
});}
function showToast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2800);}
function escapeHTML(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function levelInfo(xp){let level=1,threshold=500,remaining=xp;while(remaining>=threshold){remaining-=threshold;level++;threshold+=50;}return {level,within:remaining,next:threshold};}
function durationMs(session){return (session.segments||[]).reduce((sum,seg)=>sum+Math.max(0,(seg.end||Date.now())-seg.start),0);}
function fmtTime(ms){let sec=Math.floor(Math.max(0,ms)/1000),h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return [h,m,s].map(v=>String(v).padStart(2,"0")).join(":");}
function fmtHours(ms){let mins=Math.floor(ms/60000);return `${Math.floor(mins/60)}h${String(mins%60).padStart(2,"0")}`;}
function dayStart(d=new Date()){return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();}
function inRange(ts,start,end){return ts>=start&&ts<end;}
function sessionDurationForDay(session,start,end){
  return (session.segments||[]).reduce((sum,seg)=>{const a=Math.max(seg.start,start),b=Math.min(seg.end||Date.now(),end);return sum+Math.max(0,b-a);},0);
}
function getTodayStats(){
  const start=dayStart(),end=start+86400000;
  const sessions=state.discipline.sessions;
  let studied=sessions.reduce((n,s)=>n+sessionDurationForDay(s,start,end),0);
  if(state.discipline.activeSession)studied+=sessionDurationForDay(state.discipline.activeSession,start,end);
  const interruptions=state.discipline.interruptions.filter(x=>inRange(x.start,start,end));
  const lost=interruptions.reduce((n,x)=>n+Math.max(0,(x.end||Date.now())-x.start),0);
  return {studied,interruptions:interruptions.length,lost};
}
function renderTimer(){
  const d=state.discipline,active=d.activeSession,paused=!!active&&active.status==="paused";
  $("timerDisplay").textContent=active?fmtTime(durationMs(active)):"00:00:00";
  $("timerStatus").textContent=!active?"PRONTO":paused?"PAUSADO":"EM ESTUDO";
  $("timerContext").textContent=active?`${active.subject} · ${active.activity}`:"Selecione a matéria e inicie uma sessão.";
  $("timerStart").disabled=!!active;$("timerPause").disabled=!active||paused;
  $("timerResume").hidden=!paused;$("timerStop").disabled=!active;
}
function renderDiscipline(){
  const d=state.discipline,st=getTodayStats(),s=d.settings;
  $("plannedToday").textContent=fmtHours(s.dailyTarget*60000);
  $("studiedToday").textContent=fmtHours(st.studied);
  $("interruptionsToday").textContent=st.interruptions;
  $("interruptedToday").textContent=Math.round(st.lost/60000)+" min";
  $("reminderTime").value=s.reminderTime;$("dailyTarget").value=s.dailyTarget;$("staleMinutes").value=String(s.staleMinutes);
  document.querySelectorAll("#dayPicker input").forEach(x=>x.checked=s.days.includes(Number(x.value)));
  $("logDistraction").textContent=d.activeInterruption?"Finalizar interrupção":"Iniciar interrupção";
  $("logDistraction").classList.toggle("danger",!!d.activeInterruption);
  $("notificationStatus").textContent=("Notification"in window&&Notification.permission==="granted")?"Notificações autorizadas.":("Notification"in window&&Notification.permission==="denied")?"Notificações bloqueadas nas configurações do navegador.":"Permissão de notificação ainda não concedida.";
  const sessions=d.sessions.slice(-12).reverse();
  $("sessionHistory").innerHTML=sessions.length?sessions.map(x=>`<div class="history-entry"><div><b>${escapeHTML(x.subject)} · ${escapeHTML(x.activity)}</b><small>${new Date(x.startedAt).toLocaleString("pt-BR")} · ${fmtTime(durationMs(x))}</small></div><strong>Concluída</strong></div>`).join(""):'<article class="card muted">Nenhuma sessão concluída.</article>';
  const ints=d.interruptions.slice(-12).reverse();
  $("distractionHistory").innerHTML=ints.length?ints.map(x=>`<div class="history-entry"><div><b>${escapeHTML(x.type)}</b><small>${new Date(x.start).toLocaleString("pt-BR")} · ${Math.max(0,Math.round(((x.end||Date.now())-x.start)/60000))} min ${x.note?'· '+escapeHTML(x.note):''}</small></div><strong>${x.end?'Registrada':'Em andamento'}</strong></div>`).join(""):'<article class="card muted">Nenhuma interrupção registrada.</article>';
  const weekStart=dayStart(new Date(Date.now()-((new Date().getDay()+6)%7)*86400000));
  const weekEnd=weekStart+7*86400000;
  const weekSessions=d.sessions.filter(x=>x.startedAt>=weekStart&&x.startedAt<weekEnd);
  const weekStudy=weekSessions.reduce((n,x)=>n+durationMs(x),0)+(d.activeSession?sessionDurationForDay(d.activeSession,weekStart,weekEnd):0);
  const weekInts=d.interruptions.filter(x=>x.start>=weekStart&&x.start<weekEnd);
  const weekLost=weekInts.reduce((n,x)=>n+Math.max(0,(x.end||Date.now())-x.start),0);
  $("weekStudy").textContent=fmtHours(weekStudy);$("weekInterruptions").textContent=weekInts.length;
  $("weekLost").textContent=Math.round(weekLost/60000)+" min";$("weekSessions").textContent=weekSessions.length;
  renderTimer();
}
function render(){
 const p=state.profile,lv=levelInfo(p.xp);
 $("xpText").textContent=`${lv.within} / ${lv.next} XP · NÍVEL ${lv.level}`;
 $("xpBar").style.width=Math.min(100,lv.within/lv.next*100)+"%";
 $("credits").textContent=p.credits;$("medals").textContent=p.medals;
 $("materials").textContent=Object.values(state.inventory).reduce((a,b)=>a+b,0);
 ["power","precision","defense","energy"].forEach(k=>$(k).textContent=p[k]);
 const m=state.mission.progress,done=Object.values(m).filter(Boolean).length,pct=done*25;
 $("missionPct").textContent=pct+"%";$("missionBar").style.width=pct+"%";
 const labels={theory:"Concluir um bloco de teoria",mapping:"Concluir um mapeamento",review:"Concluir uma revisão",battery:"Resolver uma bateria de questões"};
 $("objectives").innerHTML=Object.entries(labels).map(([k,v])=>`<li class="${m[k]?'done':''}">${m[k]?'✓':'○'} ${v}</li>`).join("");
 const ready=done===4&&!state.mission.claimed;$("claimMission").disabled=!ready;
 $("missionStatus").textContent=state.mission.claimed?"Missão concluída. Recompensa já contabilizada.":ready?"Objetivos cumpridos. Recompensa disponível.":"Aguardando cumprimento dos objetivos.";
 $("inventoryList").innerHTML=[
  ["scrap","Sucata tecnológica","⚙","Melhorias de terminais e equipamentos"],
  ["cores","Núcleos de energia","🔷","Sistemas de energia e proteção"],
  ["intel","Dados de inteligência","▣","Sistemas de análise e desbloqueios"],
  ["plates","Placas de blindagem","🛡","Fabricação e reforço de armaduras"]
 ].map(([k,n,ico,d])=>`<article class="card item"><div class="item-icon">${ico}</div><div><b>${n}</b><small>${d}</small></div><span class="owned">${state.inventory[k]}</span></article>`).join("");
 const recipes=[
  {id:"reinforcedArmor",name:"Armadura reforçada",desc:"Proteção aprimorada para operações de maior risco.",cost:{plates:5,scrap:3},icon:"🛡"},
  {id:"advancedTerminal",name:"Terminal avançado",desc:"Amplia a capacidade tecnológica da base.",cost:{scrap:6,cores:2},icon:"⌨"},
  {id:"intelSystem",name:"Sistema de inteligência",desc:"Estrutura avançada de análise operacional.",cost:{intel:4,cores:2},icon:"▣"}
 ];
 $("recipes").innerHTML=recipes.map(r=>{const owned=state.equipment[r.id]>0,can=Object.entries(r.cost).every(([k,v])=>state.inventory[k]>=v);const cost=Object.entries(r.cost).map(([k,v])=>`${v} ${({scrap:"sucatas",cores:"núcleos",intel:"dados",plates:"placas"})[k]}`).join(" + ");return `<article class="card recipe ${owned?'':'locked'}"><div class="item-icon">${r.icon}</div><h3>${r.name}</h3><p>${r.desc}</p><div class="cost">Custo: ${cost}</div><button class="${can&&!owned?'primary':'secondary'}" data-craft="${r.id}" ${!can||owned?'disabled':''}>${owned?'Fabricado':can?'Fabricar':'Materiais insuficientes'}</button></article>`}).join("");
 $("historyList").innerHTML=state.history.length?state.history.slice().reverse().map(h=>`<div class="history-entry"><div><b>${escapeHTML(h.title)}</b><small>${new Date(h.date).toLocaleString("pt-BR")} · ${escapeHTML(h.notes||"Registro de estudo")}</small></div><strong>+${h.xp} XP</strong></div>`).join(""):'<article class="card muted">Nenhuma operação registrada. Seu histórico aparecerá aqui.</article>';
 $("saveStatus").textContent="Último salvamento local: "+new Date().toLocaleTimeString("pt-BR");
 renderDiscipline();
}
function calcXP(){const pages=+$("pages").value||0,q=+$("questions").value||0,c=+$("correct").value||0,err=+$("corrected").value||0;return pages+q*2+c+err+($("mapping").checked?30:0)+($("review").checked?25:0)+($("booklet").checked?50:0)+($("subject").checked?250:0)+($("simulation").checked?50:0);}
["pages","questions","correct","corrected","mapping","review","booklet","subject","simulation"].forEach(id=>$(id).addEventListener("input",()=>{$("previewXP").textContent=calcXP()+" XP";}));
$("studyForm").addEventListener("submit",async e=>{
 e.preventDefault();const pages=+$("pages").value||0,q=+$("questions").value||0,c=+$("correct").value||0,err=+$("corrected").value||0;
 if(c>q){showToast("Acertos não podem superar o total de questões.");return;}if(err>q-c){showToast("Erros corrigidos não podem superar as questões erradas.");return;}
 const xp=calcXP();if(xp<=0){showToast("Registre uma atividade antes de salvar.");return;}
 state.profile.xp+=xp;state.profile.precision+=c?Math.min(5,Math.floor(c/10)):0;state.profile.defense+=$("review").checked?1:0;
 const flags={theory:pages>0,mapping:$("mapping").checked,review:$("review").checked,battery:q>0};
 Object.keys(flags).forEach(k=>{if(flags[k])state.mission.progress[k]=true;});
 state.history.push({date:new Date().toISOString(),title:"Operação de estudo",notes:$("notes").value.trim(),xp,pages,questions:q,correct:c,corrected:err});
 await saveState();render();e.target.reset();$("previewXP").textContent="0 XP";showToast(`Operação salva: +${xp} XP`);
});
$("claimMission").addEventListener("click",async()=>{
 if(state.mission.claimed||!Object.values(state.mission.progress).every(Boolean))return;
 state.mission.claimed=true;state.profile.xp+=100;state.profile.credits+=50;state.inventory.scrap+=3;state.inventory.intel+=1;
 state.history.push({date:new Date().toISOString(),title:"Missão concluída: Operação Despertar",notes:"Recompensa: 50 créditos, 3 sucatas e 1 dado de inteligência",xp:100});
 await saveState();render();showToast("Missão concluída. Loot e recompensas adicionados.");
});
$("recipes").addEventListener("click",async e=>{
 const id=e.target.dataset.craft;if(!id)return;
 const costs={reinforcedArmor:{plates:5,scrap:3},advancedTerminal:{scrap:6,cores:2},intelSystem:{intel:4,cores:2}},cost=costs[id];
 if(state.equipment[id]||!Object.entries(cost).every(([k,v])=>state.inventory[k]>=v))return;
 Object.entries(cost).forEach(([k,v])=>state.inventory[k]-=v);state.equipment[id]=1;await saveState();render();showToast("Equipamento fabricado.");
});
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
 document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));
 document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("active",x.id===b.dataset.tab));
}));

// CRONÔMETRO OPERACIONAL
function currentSegment(session){return session?.segments?.[session.segments.length-1];}
async function startSession(){
 if(state.discipline.activeSession)return;
 const subject=prompt("Qual matéria você vai estudar?","Direito Constitucional");if(!subject?.trim())return;
 const activity=prompt("Qual atividade? (Teoria, Questões, Revisão, Mapeamento...)","Teoria — leitura do PDF");if(!activity?.trim())return;
 const now=Date.now();
 state.discipline.activeSession={id:crypto.randomUUID?.()||String(now),subject:subject.trim(),activity:activity.trim(),startedAt:now,status:"running",segments:[{start:now,end:null}]};
 staleNotifiedFor=null;await saveState();renderDiscipline();startTicker();showToast("Sessão iniciada. Boa operação.");
}
async function pauseSession(){
 const s=state.discipline.activeSession;if(!s||s.status!=="running")return;
 const seg=currentSegment(s);if(seg&&!seg.end)seg.end=Date.now();s.status="paused";s.pausedAt=Date.now();
 await saveState();renderDiscipline();stopTicker();showToast("Cronômetro pausado.");
}
async function resumeSession(){
 const s=state.discipline.activeSession;if(!s||s.status!=="paused")return;
 const now=Date.now();s.status="running";s.resumedAt=now;s.segments.push({start:now,end:null});
 await saveState();renderDiscipline();startTicker();showToast("Sessão retomada.");
}
async function stopSession(){
 const s=state.discipline.activeSession;if(!s)return;
 if(s.status==="running"){const seg=currentSegment(s);if(seg&&!seg.end)seg.end=Date.now();}
 s.endedAt=Date.now();s.status="completed";s.durationMs=durationMs(s);
 state.discipline.sessions.push(s);state.discipline.activeSession=null;
 if(state.discipline.activeInterruption){state.discipline.activeInterruption.end=Date.now();state.discipline.interruptions.push(state.discipline.activeInterruption);state.discipline.activeInterruption=null;}
 await saveState();render();stopTicker();showToast(`Sessão encerrada: ${fmtTime(s.durationMs)} registrados.`);
}
let lastHeartbeatSave=0;
function startTicker(){stopTicker();tickHandle=setInterval(async()=>{
 if(!state?.discipline?.activeSession)return;
 renderTimer();renderDailyOnly();checkStaleSession();
 if(Date.now()-lastHeartbeatSave>30000){
   const s=state.discipline.activeSession;
   if(s?.status==="running"){s.lastSavedAt=Date.now();lastHeartbeatSave=Date.now();await saveState();}
 }
},1000);}
function stopTicker(){if(tickHandle){clearInterval(tickHandle);tickHandle=null;}}
function renderDailyOnly(){const st=getTodayStats();$("studiedToday").textContent=fmtHours(st.studied);$("interruptionsToday").textContent=st.interruptions;$("interruptedToday").textContent=Math.round(st.lost/60000)+" min";}
$("timerStart").addEventListener("click",startSession);
$("timerPause").addEventListener("click",pauseSession);
$("timerResume").addEventListener("click",resumeSession);
$("timerStop").addEventListener("click",stopSession);

// INTERRUPÇÕES E DISTRAÇÕES
$("logDistraction").addEventListener("click",async()=>{
 const d=state.discipline,now=Date.now();
 if(d.activeInterruption){
   d.activeInterruption.end=now;d.interruptions.push(d.activeInterruption);d.activeInterruption=null;
   await saveState();render();renderDisciplineMissions();showToast("Interrupção encerrada e registrada. Retome o cronômetro quando voltar.");return;
 }
 const type=$("distractionType").value,note=$("distractionNote").value.trim();
 if(d.activeSession?.status==="running")await pauseSession();
 d.activeInterruption={id:crypto.randomUUID?.()||String(now),type,note,start:now,end:null};
 await saveState();renderDiscipline();renderDisciplineMissions();
 showToast("Interrupção iniciada. Toque novamente para encerrá-la.");
});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state?.discipline?.activeSession?.status==="running"){renderTimer();checkStaleSession();}});

// ALERTAS RECORRENTES
$("reminderForm").addEventListener("submit",async e=>{
 e.preventDefault();const days=[...document.querySelectorAll("#dayPicker input:checked")].map(x=>Number(x.value));
 state.discipline.settings.reminderTime=$("reminderTime").value;
 state.discipline.settings.days=days;
 state.discipline.settings.dailyTarget=Math.max(15,Math.min(900,Number($("dailyTarget").value)||180));
 state.discipline.settings.staleMinutes=Number($("staleMinutes").value)||45;
 await saveState();scheduleReminder();renderDiscipline();showToast("Configurações operacionais salvas.");
});
$("enableNotifications").addEventListener("click",async()=>{
 if(!("Notification"in window)){showToast("Este navegador não oferece notificações.");return;}
 const result=await Notification.requestPermission();
 state.discipline.settings.notifications=result==="granted";await saveState();renderDiscipline();showToast(result==="granted"?"Notificações autorizadas.":"Permissão não concedida.");
});
function notify(title,body){
 if(!("Notification"in window)||Notification.permission!=="granted")return;
 try{new Notification(title,{body,icon:"icon.svg",tag:"comando-controle-"+title});}catch(e){console.warn("Notificação indisponível",e);}
}
let lastReminderKey="";
function scheduleReminder(){
 if(reminderHandle)clearInterval(reminderHandle);
 reminderHandle=setInterval(()=>{
   const now=new Date(),s=state.discipline.settings,key=now.toDateString()+"-"+s.reminderTime;
   const [h,m]=s.reminderTime.split(":").map(Number);
   if(s.days.includes(now.getDay())&&now.getHours()===h&&now.getMinutes()===m&&now.getSeconds()<12&&lastReminderKey!==key){
     lastReminderKey=key;
     notify("Hora da operação","Seu bloco de estudo está programado. Abra o COMANDO DE CONTROLE para iniciar.");
     showToast("Lembrete: horário programado para estudar.");
   }
   checkStaleSession();
 },15000);
}
function checkStaleSession(){
 const s=state.discipline.activeSession;if(!s||s.status!=="running")return;
 const elapsed=durationMs(s);
 if(elapsed>=state.discipline.settings.staleMinutes*60000&&staleNotifiedFor!==s.id){
   staleNotifiedFor=s.id;notify("Confirme sua sessão","O cronômetro está aberto há algum tempo. Você continua estudando?");
   showToast("Confirme se a sessão continua ativa.");
 }
}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkStaleSession();});

// MISSÕES DE CONTENÇÃO — sem punições automáticas
const enemyData=[
 ["Enxame de Interferência","Redes sociais, notificações e vídeos curtos. Contramedida: Modo Foco e redução de notificações."],
 ["Armadilha de Imersão","Jogos e entretenimento que ultrapassam o tempo pretendido. Contramedida: limite de lazer definido antes."],
 ["Desvio de Missão","Pesquisas paralelas e tarefas secundárias durante o bloco. Contramedida: anotar para depois e retornar ao foco."]
];
function renderDisciplineMissions(){
 $("disciplineEnemies").innerHTML=enemyData.map((e,i)=>`<article class="card enemy"><b>${escapeHTML(e[0])}</b><p>${escapeHTML(e[1])}</p></article>`).join("");
 const missions=[
  ["focus-block","Protocolo de foco","Concluir uma sessão de estudo de pelo menos 25 minutos.",25],
  ["interruptions-log","Relatório de desvios","Registrar conscientemente uma interrupção, sem punição.",10],
  ["return-to-task","Retorno à missão","Retomar uma sessão pausada e concluir pelo menos 15 minutos.",15]
 ];
 $("disciplineMissions").innerHTML=missions.map(m=>{
  const claimed=state.discipline.claimedMissions.includes(m[0]);
  const eligible=m[0]==="focus-block"?state.discipline.sessions.some(s=>s.durationMs>=25*60000):
    m[0]==="interruptions-log"?state.discipline.interruptions.length>0:
    state.discipline.sessions.some(s=>s.segments.length>1&&s.durationMs>=15*60000);
  return `<article class="card mission-card"><b>${m[1]}</b><p>${m[2]}</p><button class="${eligible&&!claimed?'primary':'secondary'}" data-mission="${m[0]}" ${!eligible||claimed?'disabled':''}>${claimed?'Recompensa resgatada':eligible?'Resgatar +'+m[3]+' créditos':'Em andamento'}</button></article>`;
 }).join("");
}
$("disciplineMissions").addEventListener("click",async e=>{
 const id=e.target.dataset.mission;if(!id||state.discipline.claimedMissions.includes(id))return;
 const rewards={"focus-block":25,"interruptions-log":10,"return-to-task":15};
 state.discipline.claimedMissions.push(id);state.profile.credits+=rewards[id]||0;
 state.history.push({date:new Date().toISOString(),title:"Missão de disciplina: "+id,notes:"Recompensa por objetivo operacional comprovado.",xp:0});
 await saveState();render();showToast("Recompensa de disciplina resgatada.");
});

// HISTÓRICO E EXPORTAÇÃO
function downloadJSON(data,name){
 const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$("exportBtn").addEventListener("click",()=>{downloadJSON({app:"COMANDO DE CONTROLE",version:2,exportedAt:new Date().toISOString(),state},"comando-controle-backup-v2.json");showToast("Backup exportado.");});
$("exportReport").addEventListener("click",()=>{
 const st=getTodayStats(),d=state.discipline,weekStart=dayStart(new Date(Date.now()-((new Date().getDay()+6)%7)*86400000)),weekEnd=weekStart+7*86400000;
 const sessions=d.sessions.filter(x=>x.startedAt>=weekStart&&x.startedAt<weekEnd);
 const interruptions=d.interruptions.filter(x=>x.start>=weekStart&&x.start<weekEnd);
 downloadJSON({app:"COMANDO DE CONTROLE",report:"relatorio_semanal_disciplina",generatedAt:new Date().toISOString(),weekStart:new Date(weekStart).toISOString(),weekEnd:new Date(weekEnd).toISOString(),daily:st,sessions,interruptions,settings:d.settings},"relatorio-disciplina-semanal.json");
 showToast("Relatório semanal exportado.");
});
$("importFile").addEventListener("change",async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  const data=JSON.parse(await file.text());if(data.app!=="COMANDO DE CONTROLE"||!data.state)throw new Error("Arquivo inválido");
  if(!confirm("Importar este backup substituirá o progresso atual. Continuar?"))return;
  state=merge(defaults,data.state);await saveState();render();if(state.discipline.activeSession?.status==="running")startTicker();showToast("Backup restaurado.");
 }catch(err){showToast("Não foi possível importar: "+err.message);}e.target.value="";
});
(async()=>{
 try{
  state=await loadState();
  if(state.discipline.activeSession?.status==="running"){
    const s=state.discipline.activeSession,seg=currentSegment(s);
    if(seg&&!seg.end)seg.end=Math.max(seg.start,Math.min(Date.now(),s.lastSavedAt||seg.start));
    s.status="paused";s.recoveredAt=Date.now();await saveState();
  }
  render();renderDisciplineMissions();
  scheduleReminder();
  if("serviceWorker"in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
 }catch(e){console.error(e);showToast("Falha ao iniciar o banco local.");}
})();
