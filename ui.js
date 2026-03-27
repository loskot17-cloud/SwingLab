import * as A from './analysis.js';
import * as R from './rendering.js';
import * as C from './camera.js';

const $=id=>document.getElementById(id);

let deferredInstallPrompt = null;

const state = {
  L:A.L,
  pose:null,allFrameData:[],currentFrameIdx:0,detectedView:'unknown',analysisResult:null,
  showSkeleton:true,showPlane:true,showAngles:true,showGhost:false,activeDrill:null,
  handedness:'right',viewOverride:'auto',
  faultSensitivity:{'Head Movement':1.0,'Hip Slide':1.0,'Lead Arm':1.0,'Weight Transfer':1.0,'Trail Knee':1.0,'Finish':1.0,'Early Extension':1.0,'Posture':1.0,'Flat Backswing':1.0,'Over the Top':1.0,'Chicken Wing':1.0},
  videoElement:$('videoElement'),poseCanvas:$('poseCanvas'),ctx:$('poseCanvas').getContext('2d'),cameraFeed:$('cameraFeed'),
  speeds:[0.25,0.5,1,1.5],spdI:2,
  cameraStream:null,livePose:null,liveMode:false,liveAnimFrame:null,swingState:'idle',liveFrameBuffer:[],swingFrames:[],preSwingBuffer:[],
  PRE_BUFFER_SIZE:15,MIN_SWING_FRAMES:8,lastWristY:null,wristSmooth:0,motionSmooth:0,swingCooldown:0,
  _cameraMode:false,selectedClub:'Driver',previousLandmarks:[]
};

state.getPhase = function(idx){
  if(!state.analysisResult?.phases) return 'unknown';
  const p=state.analysisResult.phases;
  if(idx<=p.address.end)return'address';
  if(idx<=p.backswing.end)return'backswing';
  if(idx<=p.downswing.start)return'top';
  if(idx<=p.downswing.end)return'downswing';
  if(idx<=p.impact.end+1)return'impact';
  return'follow';
};

state.syncCanvasSize = function(){
  const r=state.videoElement.getBoundingClientRect();
  state.poseCanvas.style.width=r.width+'px';
  state.poseCanvas.style.height=r.height+'px';
  state.poseCanvas.style.left=r.left+'px';
  state.poseCanvas.style.top=r.top+'px';
};

state.syncCameraCanvas = function(){
  const r=state.cameraFeed.getBoundingClientRect();
  state.poseCanvas.style.width=r.width+'px';state.poseCanvas.style.height=r.height+'px';
  state.poseCanvas.style.left=r.left+'px';state.poseCanvas.style.top=r.top+'px';
};

state.setAz=function(t,s){const a=$('azT'),b=$('azS');if(a)a.textContent=t; if(b&&s!==undefined)b.textContent=s;console.log('[SL]',t,s||'');};

function loadSettings(){
  try{const s=JSON.parse(localStorage.getItem('swinglab_settings'));if(s){state.handedness=s.hand||'right';state.viewOverride=s.view||'auto';if(s.sens)Object.assign(state.faultSensitivity,s.sens)}}catch(e){}
}
function saveSettings(){localStorage.setItem('swinglab_settings',JSON.stringify({hand:state.handedness,view:state.viewOverride,sens:state.faultSensitivity}));}
loadSettings();

// Drawer
function openDrawer(){$('drawer').classList.add('open');$('scrim').classList.add('open');}
function closeDrawer(){$('drawer').classList.remove('open');$('scrim').classList.remove('open');}
state.closeDrawer = closeDrawer;
$('drawerToggle').addEventListener('click',()=>{$('drawer').classList.contains('open')?closeDrawer():openDrawer()});
$('drawerClose').addEventListener('click',closeDrawer);$('scrim').addEventListener('click',closeDrawer);

function initSettingsUI(){
  document.querySelectorAll('#handCtrl .seg-opt').forEach(o=>{if(o.dataset.v===state.handedness)o.classList.add('active');else o.classList.remove('active');o.addEventListener('click',()=>{document.querySelectorAll('#handCtrl .seg-opt').forEach(x=>x.classList.remove('active'));o.classList.add('active');state.handedness=o.dataset.v;saveSettings();});});
  document.querySelectorAll('#viewCtrl .seg-opt').forEach(o=>{if(o.dataset.v===state.viewOverride)o.classList.add('active-blue');else o.classList.remove('active-blue');o.addEventListener('click',()=>{document.querySelectorAll('#viewCtrl .seg-opt').forEach(x=>x.classList.remove('active-blue'));o.classList.add('active-blue');state.viewOverride=o.dataset.v;saveSettings();});});
  document.querySelectorAll('#globalSensCtrl .seg-opt').forEach(o=>{o.addEventListener('click',()=>{document.querySelectorAll('#globalSensCtrl .seg-opt').forEach(x=>x.classList.remove('active-purple'));o.classList.add('active-purple');const vals={strict:0.6,normal:1.0,lenient:1.4};const v=vals[o.dataset.v]||1.0;Object.keys(state.faultSensitivity).forEach(k=>{state.faultSensitivity[k]=v});saveSettings();renderSensSliders();});});
  renderSensSliders();
  $('reanalyzeBtn').addEventListener('click',()=>{if(!state.allFrameData.length)return;document.querySelectorAll('.dtab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.dpanel').forEach(p=>p.classList.remove('active'));document.querySelector('[data-t="results"]').classList.add('active');$('p-results').classList.add('active');runAnalysis();});
}

function renderSensSliders(){
  const el=$('sensSliders');if(!el)return;el.innerHTML='';
  Object.entries(state.faultSensitivity).forEach(([name,val])=>{
    const row=document.createElement('div');row.className='sens-row';
    const label=document.createElement('span');label.className='sens-name';label.textContent=name;
    const slider=document.createElement('input');slider.type='range';slider.className='sens-slider';slider.min='0.3';slider.max='1.7';slider.step='0.1';slider.value=val;
    const valLbl=document.createElement('span');valLbl.className='sens-val';
    valLbl.textContent=val<=0.6?'Strict':val<=0.9?'Tight':val<=1.1?'Normal':val<=1.4?'Loose':'Lenient';
    slider.addEventListener('input',()=>{state.faultSensitivity[name]=parseFloat(slider.value);valLbl.textContent=slider.value<=0.6?'Strict':slider.value<=0.9?'Tight':slider.value<=1.1?'Normal':slider.value<=1.4?'Loose':'Lenient';saveSettings();});
    row.appendChild(label);row.appendChild(slider);row.appendChild(valLbl);el.appendChild(row);
  });
}
initSettingsUI();

// PWA install prompt
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const installBtn = $('installBtn');
  if (installBtn) {
    installBtn.style.display = 'flex';
    installBtn.title = 'Install SwingLab';
  }
});

const installBtn = $('installBtn');
if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      state.setAz('App install accepted', 'You can open from home screen soon');
    } else {
      state.setAz('App install dismissed', 'Try again later');
    }
    deferredInstallPrompt = null;
    installBtn.style.display = 'none';
  });
}

// Upload
$('uploadBtn').addEventListener('click',e=>{e.stopPropagation();$('fileInput').click()});
$('cameraBtn').addEventListener('click',e=>{e.stopPropagation();C.startCamera(state)});
$('uploadZone').addEventListener('dragover',e=>{e.preventDefault();$('uploadZone').style.borderColor='var(--green)'});
$('uploadZone').addEventListener('dragleave',()=>{$('uploadZone').style.borderColor=''});
$('uploadZone').addEventListener('drop',e=>{e.preventDefault();$('uploadZone').style.borderColor='';if(e.dataTransfer.files.length)handleFile(e.dataTransfer.files[0])});
$('fileInput').addEventListener('change',()=>{if($('fileInput').files.length)handleFile($('fileInput').files[0])});
$('newVideoBtn').addEventListener('click',()=>location.reload());

function handleFile(file){
  if(!file.type.startsWith('video/')&&!file.name.match(/\.(mp4|mov|webm|avi|mkv)$/i)){alert('Upload a video file.');return;}
  $('uploadZone').style.display='none';$('analyzing').classList.add('visible');state.setAz('Loading video...',file.name);
  const err={1:'ABORTED',2:'NETWORK',3:'DECODE',4:'SRC_NOT_SUPPORTED'};
  state.videoElement.onerror=()=>{const e=state.videoElement.error;state.setAz('Video failed — '+(err[e?.code]||'Unknown'),'Try MP4 H.264');};
  state.videoElement.addEventListener('loadeddata',()=>{
    if(!state.videoElement.videoWidth){state.setAz('No dimensions','File may be corrupted');return;}
    state.videoElement.style.display='block';
    state.poseCanvas.width=state.videoElement.videoWidth;state.poseCanvas.height=state.videoElement.videoHeight;
    state.syncCanvasSize();
    state.setAz('Video loaded',`${state.videoElement.videoWidth}×${state.videoElement.videoHeight}`);
    initPose();
  },{once:true});
  state.videoElement.src=URL.createObjectURL(file);state.videoElement.load();
}

function fmt(s){return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0')}

// Overlay toggles
$('togSkel').addEventListener('click', () => {
  state.showSkeleton = !state.showSkeleton;
  $('togSkel').classList.toggle('on', state.showSkeleton);
  R.redraw(state);
});
$('togPlane').addEventListener('click', () => {
  state.showPlane = !state.showPlane;
  $('togPlane').classList.toggle('on', state.showPlane);
  R.redraw(state);
});
$('togAng').addEventListener('click', () => {
  state.showAngles = !state.showAngles;
  $('togAng').classList.toggle('on', state.showAngles);
  R.redraw(state);
});
$('togGhost').addEventListener('click', () => {
  state.showGhost = !state.showGhost;
  $('togGhost').classList.toggle('on', state.showGhost);
  R.redraw(state);
}); // to ensure we catch clicks

// Controls
$('playBtn').addEventListener('click',togglePlay);
$('speedLbl').addEventListener('click',()=>{state.spdI=(state.spdI+1)%state.speeds.length;state.videoElement.playbackRate=state.speeds[state.spdI];$('speedLbl').textContent=state.speeds[state.spdI]+'x'});
$('progressBar').addEventListener('click',e=>{const r=$('progressBar').getBoundingClientRect();state.videoElement.currentTime=((e.clientX-r.left)/r.width)*state.videoElement.duration});
$('resetBtn').addEventListener('click',resetToStart);
$('prevBtn').addEventListener('click',()=>stepFrame(-1));
$('nextBtn').addEventListener('click',()=>stepFrame(1));

document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;if(e.key==='ArrowLeft'){e.preventDefault();stepFrame(-1)}else if(e.key==='ArrowRight'){e.preventDefault();stepFrame(1)}else if(e.key===' '){e.preventDefault();togglePlay()}else if(e.key==='Home'){e.preventDefault();resetToStart()}else if(e.key==='Tab'){e.preventDefault();$('drawer').classList.contains('open')?closeDrawer():openDrawer()}});

function togglePlay(){if(state.videoElement.paused){state.videoElement.play();$('playBtn').textContent='⏸'}else{state.videoElement.pause();$('playBtn').textContent='▶'}}
function resetToStart(){state.videoElement.pause();$('playBtn').textContent='▶';state.currentFrameIdx=0;state.videoElement.currentTime=state.allFrameData.length?state.allFrameData[0].time:0;$('frameLbl').textContent=state.allFrameData.length?`F1/${state.allFrameData.length}`:'';R.redraw(state)}
function stepFrame(d){if(!state.allFrameData.length)return;state.videoElement.pause();$('playBtn').textContent='▶';state.currentFrameIdx=Math.max(0,Math.min(state.allFrameData.length-1,state.currentFrameIdx+d));state.videoElement.currentTime=state.allFrameData[state.currentFrameIdx].time;$('frameLbl').textContent=`F${state.currentFrameIdx+1}/${state.allFrameData.length}`;R.redraw(state)}

state.videoElement.addEventListener('timeupdate',()=>{
  if(!state.videoElement.duration)return;
  $('progressFill').style.width=(state.videoElement.currentTime/state.videoElement.duration*100)+'%';
  $('timeLbl').textContent=fmt(state.videoElement.currentTime)+' / '+fmt(state.videoElement.duration);
  if(state.allFrameData.length){let b=0,bd=Infinity;for(let i=0;i<state.allFrameData.length;i++){const d=Math.abs(state.videoElement.currentTime-state.allFrameData[i].time);if(d<bd){bd=d;b=i}}state.currentFrameIdx=b;$('frameLbl').textContent=`F${b+1}/${state.allFrameData.length}`;}
  R.redraw(state);
});

// MediaPipe
let poseResolve=null;
function initPose(){
  state.setAz('Loading AI model...','10-20s first time');$('statusPill').textContent='Loading...';$('statusPill').classList.add('active');
  try{state.pose=new Pose({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${f}`})}catch(e){state.setAz('MediaPipe failed','Use localhost');return}
  state.pose.setOptions({modelComplexity:1,smoothLandmarks:false,enableSegmentation:false,minDetectionConfidence:0.5,minTrackingConfidence:0.5});
  state.pose.onResults(r=>{if(poseResolve){poseResolve(r);poseResolve=null}});
  state.pose.initialize().then(()=>{state.setAz('Model ready','Starting analysis...');extractFrames()}).catch(e=>state.setAz('Init failed',String(e)));
}

function sendFrame(v){return new Promise(res=>{const t=setTimeout(()=>{poseResolve=null;res(null)},5000);poseResolve=r=>{clearTimeout(t);res(r)};state.pose.send({image:v}).catch(()=>{clearTimeout(t);poseResolve=null;res(null)})})}

function seekTo(v,t){return new Promise(res=>{if(Math.abs(v.currentTime-t)<0.01){res();return}const d=()=>{v.removeEventListener('seeked',d);requestAnimationFrame(()=>requestAnimationFrame(res))};v.addEventListener('seeked',d);v.currentTime=t;setTimeout(()=>{v.removeEventListener('seeked',d);res()},2000)})}

async function extractFrames(){
  $('analyzing').classList.add('visible');state.allFrameData=[];
  const dur=state.videoElement.duration,fps=12,total=Math.floor(dur*fps),iv=1/fps;let fails=0;
  state.setAz('Analyzing swing...',`${total+1} frames`);
  for(let i=0;i<=total;i++){
    const t=Math.min(i*iv,dur-0.01);await seekTo(state.videoElement,t);
    const r=await sendFrame(state.videoElement);
    if(r&&r.poseLandmarks)state.allFrameData.push({time:t,landmarks:r.poseLandmarks.map(p=>({x:p.x,y:p.y,z:p.z,visibility:p.visibility}))});else fails++;
    $('azS').textContent=`Frame ${i+1}/${total+1} — ${state.allFrameData.length} detected`;$('progressFill').style.width=Math.round(i/total*100)+'%';
  }
  $('analyzing').classList.remove('visible');
  state.videoElement.currentTime=0;state.videoElement.pause();$('playBtn').textContent='▶';
  $('controlsBar').classList.add('visible');$('overlayBar').classList.add('visible');$('newVideoBtn').style.display='flex';$('drawerToggle').style.display='flex';
  $('kbHint').classList.add('visible');setTimeout(()=>$('kbHint').classList.remove('visible'),3500);
  runAnalysis();
}

// --- LIVE CAMERA ---
state.startCamera = ()=>C.startCamera(state);
state.stopCamera = ()=>C.stopCamera(state);
state.resetSwingDetection = msg=>C.resetSwingDetection(state,msg);
state.completeSwingCapture = ()=>C.completeSwingCapture(state);

// runAnalysis, show/compare and etc
function runAnalysis(){
  if(state.allFrameData.length<5){$('statusPill').textContent='Low data';return;}
  state.detectedView = state.viewOverride==='auto' ? A.detectView(state.allFrameData) : state.viewOverride;
  const phases=A.detectPhases(state.allFrameData);
  const faults=A.analyzeFaults(state.allFrameData,phases,state.detectedView,state.handedness,state.faultSensitivity);
  const metrics=A.computeMetrics(state.allFrameData,phases);
  let score=85;for(const f of faults)score-=f.severity==='high'?12:f.severity==='medium'?7:3;
  score=Math.max(20,Math.min(95,score));
  state.analysisResult={score,faults,metrics,phases,view:state.detectedView,date:new Date().toISOString(),frameCount:state.allFrameData.length};

  $('viewBadge').style.display='block';$('viewBadgeVal').textContent=state.detectedView==='dtl'?'DTL':'Face-On';
  $('statusPill').textContent=`${state.allFrameData.length}f · ${state.detectedView.toUpperCase()}`;$('statusPill').classList.add('active');

  $('scoreSec').style.display='block';
  const ring=$('scoreRing'),circ=2*Math.PI*36;
  ring.style.strokeDashoffset=circ-(score/100)*circ;
  ring.style.stroke=score>=75?'var(--green)':score>=55?'var(--amber)':'var(--red)';
  $('scoreNum').textContent=score;
  $('scoreSummary').textContent=faults.length===0?'No major faults.':faults.length+' issue'+(faults.length>1?'s':'')+'. '+faults.filter(f=>f.severity==='high').length+' high priority.';
  $('viewInfoRow').innerHTML=`<span class="view-chip ${state.detectedView==='dtl'?'dtl':'fo'}">${state.detectedView==='dtl'?'DTL':'FACE-ON'}</span> <span style="font-size:11px;color:var(--text2);margin-left:6px">${state.detectedView==='dtl'?'Down-the-line analysis':'Face-on analysis'}</span>`;
  $('saveBtn').style.display='inline-block';
  $('pdfBtn').style.display='inline-block';

  $('phaseSec').style.display='block';
  const pb=$('phaseBar');pb.innerHTML='';
  const total=state.allFrameData.length;
  const segments=[{n:'ADDR',c:'address',s:phases.address.start,e:phases.backswing.start},{n:'BACK',c:'backswing',s:phases.backswing.start,e:phases.backswing.end},{n:'TOP',c:'top',s:phases.backswing.end,e:phases.downswing.start+1},{n:'DOWN',c:'downswing',s:phases.downswing.start,e:phases.downswing.end},{n:'IMP',c:'impact',s:phases.downswing.end,e:phases.followThrough.start+1},{n:'FIN',c:'follow',s:phases.followThrough.start,e:phases.followThrough.end+1}];
  segments.forEach(p=>{
    const el=document.createElement('div');el.className='ph-seg '+p.c;el.style.flex=Math.max(2,(p.e-p.s)/total*100)+' 0 0';el.textContent=p.n;
    el.addEventListener('click',()=>{if(p.s<state.allFrameData.length){state.currentFrameIdx=p.s;state.videoElement.currentTime=state.allFrameData[p.s].time;}});
    pb.appendChild(el);
  });

  $('metricsSec').style.display='block';const mg=$('metricsGrid');mg.innerHTML='';
  [{l:'Tempo',v:metrics.tempo||'—',u:':1'},{l:'Back',v:metrics.bsTime||'—',u:'ms'},{l:'Down',v:metrics.dsTime||'—',u:'ms'},{l:'Total',v:metrics.total||'—',u:'ms'},{l:'Hip',v:metrics.hipRot||'—',u:'°'},{l:'Shoulder',v:metrics.shRot||'—',u:'°'}].forEach(m=>{const c=document.createElement('div');c.className='m-card';c.innerHTML=`<div class="m-l">${m.l}</div><div class="m-v">${m.v}<span class="m-u">${m.u}</span></div>`;mg.appendChild(c);});

  $('faultsSec').style.display='block';$('faultsLabel').textContent=`Issues (${faults.length})`;
  const fl=$('faultsList');fl.innerHTML='';
  if(!faults.length){fl.innerHTML='<div style="padding:20px;text-align:center;color:var(--green);font-size:12px">No significant faults detected.</div>'} else {
    const ord={high:0,medium:1,low:2};faults.sort((a,b)=>ord[a.severity]-ord[b.severity]);
    faults.forEach((f,i)=>{
      const c=document.createElement('div');c.className='fault-card';c.dataset.idx=i;
      const hasDrill=!!A.getDrillDef(f.name);
      const conf=f.conf||{score:0,label:'Unknown',cls:'low-conf'};
      c.innerHTML=`<div class="f-head"><div class="f-dot ${f.severity}"></div><div class="f-name">${f.name}</div><span class="f-conf ${conf.cls}" title="Detection confidence: ${conf.score}%">${conf.label} ${conf.score}%</span><div class="f-phase">${f.phase}</div><div class="f-expand">▼</div></div><div class="f-details"><div class="f-desc">${f.desc}</div><div class="f-fix">${f.fix}</div><div class="f-actions">${hasDrill?`<button class="f-btn drill" data-f="${f.name}" onclick="event.stopPropagation();window.activateDrill('${f.name.replace(/'/g,"\\'")}')">🎯 Drill</button>`:''}<button class="f-btn" onclick="event.stopPropagation();window.jumpFrame(${f.frameIdx})">▶ Show</button></div></div>`;
      c.addEventListener('click',()=>{c.classList.toggle('expanded');document.querySelectorAll('.fault-card').forEach(x=>x.classList.remove('active-fault'));c.classList.add('active-fault');});
      fl.appendChild(c);
    });
  }

  R.captureSnaps(state);
  R.compareSaved(state);
  openDrawer();
  R.redraw(state);
}

// Snapshots (export and compare functions are in rendering module)
window.exportSnap = ()=>R.captureSnaps(state);

// Clubs
const CLUBS=['Driver','3W','5W','Hybrid','2i','3i','4i','5i','6i','7i','8i','9i','PW','GW','SW','LW','Putter'];
function initClubGrid(){
  const grid=$('clubGrid');grid.innerHTML='';
  CLUBS.forEach(c=>{const el=document.createElement('div');el.className='club-opt'+(c===state.selectedClub?' sel':'');el.textContent=c;el.addEventListener('click',()=>{state.selectedClub=c;grid.querySelectorAll('.club-opt').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');});grid.appendChild(el);});
}
initClubGrid();

function openSaveModal(){if(!state.analysisResult)return; $('saveName').value=`${state.selectedClub} ${state.detectedView==='dtl'?'DTL':'FO'} ${new Date().toLocaleDateString()}`;$('saveModal').style.display='flex';initClubGrid();setTimeout(()=>$('saveName').focus(),100);}
window.closeSaveModal=()=>{$('saveModal').style.display='none'};
window.confirmSave=()=>{const name=$('saveName').value.trim();if(!name){$('saveName').focus();return;}const s=getSaved();s.unshift({...state.analysisResult,name,club:state.selectedClub,id:Date.now()});if(s.length>100)s.length=100;saveSaved(s);closeSaveModal();$('saveBtn').textContent='✓ Saved';setTimeout(()=>$('saveBtn').textContent='💾 Save',2000);};
$('saveName')?.addEventListener('keydown',e=>{if(e.key==='Enter')window.confirmSave()});

function getSaved(){try{return JSON.parse(localStorage.getItem('swinglab_swings')||'[]')}catch{return[]}}
function saveSaved(a){localStorage.setItem('swinglab_swings',JSON.stringify(a))}
$('saveBtn').addEventListener('click',openSaveModal);

$('savedClubFilter').addEventListener('change',()=>renderSaved());

function renderSaved(){const all=getSaved(),filter=$('savedClubFilter').value;const s=filter==='all'?all:all.filter(x=>x.club===filter);
  const clubs=[...new Set(all.map(x=>x.club).filter(Boolean))];
  const sel=$('savedClubFilter');const curVal=sel.value;
  sel.innerHTML='<option value="all">All Clubs ('+all.length+')</option>';
  clubs.forEach(c=>{const count=all.filter(x=>x.club===c).length;sel.innerHTML+=`<option value="${c}">${c} (${count})</option>`});
  sel.value=curVal;
  const el=$('savedList');
  if(!s.length){el.innerHTML='<div class="saved-empty">No saved swings'+(filter!=='all'?' for '+filter:'')+' yet.</div>';return;}
  el.innerHTML='';
  s.forEach(sw=>{const d=new Date(sw.date),c=document.createElement('div');c.className='sv-card';const clubBadge=sw.club?`<span class="club-badge">${sw.club}</span>`:'';
    c.innerHTML=`<div class="sv-head"><div class="sv-name">${sw.name} ${clubBadge}</div><div class="sv-score" style="color:${sw.score>=75?'var(--green)':sw.score>=55?'var(--amber)':'var(--red)'}">${sw.score}</div></div><div class="sv-meta"><span>${d.toLocaleDateString()}</span><span>${sw.view==='dtl'?'DTL':'FO'}</span><span>${sw.faults.length} issues</span>${sw.club?`<span>${sw.club}</span>`:''}</div><div class="sv-tags">${sw.faults.slice(0,3).map(f=>'<span class="sv-tag">'+f.name+'</span>').join('')}</div><div class="sv-acts"><button onclick="event.stopPropagation();cmpWith(${sw.id})">Compare</button><button class="del" onclick="event.stopPropagation();delSaved(${sw.id})">Delete</button></div>`;
    el.appendChild(c);
  });
}

function renderClubInsights(){const all=getSaved();const el=$('clubInsights');const clubs=[...new Set(all.map(x=>x.club).filter(Boolean))];
  if(!clubs.length){el.innerHTML='<div class="ci-empty">Save swings with club tags to see analytics.<br>Use the 💾 Save button after analyzing a swing.</div>';return;}
  el.innerHTML='';
  const summaryCard=document.createElement('div');summaryCard.className='ci-card';summaryCard.innerHTML=`<div class="ci-club-name" style="font-size:12px;color:var(--green)">Overview — ${all.length} swings across ${clubs.length} clubs</div>`;el.appendChild(summaryCard);
  clubs.sort((a,b)=>{const ai=CLUBS.indexOf(a),bi=CLUBS.indexOf(b);return(ai===-1?99:ai)-(bi===-1?99:bi)});
  clubs.forEach(club=>{const swings=all.filter(x=>x.club===club);if(!swings.length)return;const card=document.createElement('div');card.className='ci-card';
    const avgScore=Math.round(swings.reduce((a,s)=>a+s.score,0)/swings.length);
    const avgFaults=(swings.reduce((a,s)=>a+s.faults.length,0)/swings.length).toFixed(1);
    const tempos=swings.map(s=>parseFloat(s.metrics?.tempo)).filter(x=>!isNaN(x));
    const avgTempo=tempos.length?(tempos.reduce((a,v)=>a+v,0)/tempos.length).toFixed(1):'—';
    const bsTimes=swings.map(s=>parseFloat(s.metrics?.bsTime)).filter(x=>!isNaN(x));const avgBs=bsTimes.length?Math.round(bsTimes.reduce((a,v)=>a+v,0)/bsTimes.length):'—';
    const dsTimes=swings.map(s=>parseFloat(s.metrics?.dsTime)).filter(x=>!isNaN(x));const avgDs=dsTimes.length?Math.round(dsTimes.reduce((a,v)=>a+v,0)/dsTimes.length):'—';
    let trendHtml='';if(swings.length>=4){const recent=swings.slice(0,3),earlier=swings.slice(-3);const recentAvg=Math.round(recent.reduce((a,s)=>a+s.score,0)/recent.length);const earlierAvg=Math.round(earlier.reduce((a,s)=>a+s.score,0)/earlier.length);const delta=recentAvg-earlierAvg;const col=delta>0?'var(--green)':delta<0?'var(--red)':'var(--text3)';trendHtml=`<div class="ci-stat-row"><span class="ci-stat-label">Trend</span><span class="ci-stat-val" style="color:${col}">${delta>0?'+':''}${delta} pts (recent vs earlier)</span></div>`;}
    const faultCounts={};swings.forEach(s=>s.faults.forEach(f=>{faultCounts[f.name]=(faultCounts[f.name]||0)+1}));
    const faultEntries=Object.entries(faultCounts).sort((a,b)=>b[1]-a[1]);const totalSwings=swings.length;
    let faultBars='';if(faultEntries.length){faultBars=`<div class="ci-faults-title">Common Faults</div>`;faultEntries.slice(0,5).forEach(([name,count])=>{const pct=Math.round(count/totalSwings*100);const col=pct>=70?'var(--red)':pct>=40?'var(--amber)':'var(--green)';faultBars+=`<div class="ci-fault-bar"><span class="ci-fault-name">${name}</span><div class="ci-bar-bg"><div class="ci-bar-fill" style="width:${pct}%;background:${col}"></div></div><span class="ci-fault-pct">${pct}%</span></div>`;});}
    let postureHint='';if(clubs.length>=2){const otherClubs=clubs.filter(c=>c!==club);const otherSwings=all.filter(x=>otherClubs.includes(x.club));if(otherSwings.length&&swings[0].metrics?.tempo&&otherSwings[0].metrics?.tempo){const thisTempoAvg=tempos.length?tempos.reduce((a,v)=>a+v,0)/tempos.length:null;const otherTempos=otherSwings.map(s=>parseFloat(s.metrics?.tempo)).filter(x=>!isNaN(x));const otherTempoAvg=otherTempos.length?otherTempos.reduce((a,v)=>a+v,0)/otherTempos.length:null;if(thisTempoAvg&&otherTempoAvg){const diff=Math.abs(thisTempoAvg-otherTempoAvg);if(diff<0.3)postureHint=`<div style="margin-top:8px;font-size:9px;color:var(--amber);padding:6px 8px;background:rgba(251,191,36,0.06);border-radius:5px;border:1px solid rgba(251,191,36,0.12)">⚠ Tempo is similar to other clubs (${thisTempoAvg.toFixed(1)} vs ${otherTempoAvg.toFixed(1)}). Consider varying tempo by club length.</div>`;}}}
    const scoreCol=avgScore>=75?'var(--green)':avgScore>=55?'var(--amber)':'var(--red)';
    card.innerHTML=`
      <div class="ci-club-name">${club} <span style="font-size:10px;font-weight:400;color:var(--text3)">${swings.length} swing${swings.length>1?'s':''}</span></div>
      <div class="ci-stat-row"><span class="ci-stat-label">Avg Score</span><span class="ci-stat-val" style="color:${scoreCol}">${avgScore}</span></div>
      <div class="ci-stat-row"><span class="ci-stat-label">Avg Faults</span><span class="ci-stat-val">${avgFaults}</span></div>
      <div class="ci-stat-row"><span class="ci-stat-label">Avg Tempo</span><span class="ci-stat-val">${avgTempo}:1</span></div>
      <div class="ci-stat-row"><span class="ci-stat-label">Avg Backswing</span><span class="ci-stat-val">${avgBs}ms</span></div>
      <div class="ci-stat-row"><span class="ci-stat-label">Avg Downswing</span><span class="ci-stat-val">${avgDs}ms</span></div>
      ${trendHtml}
      ${faultBars}
      ${postureHint}
    `;
    el.appendChild(card);
  });
  if(clubs.length>=2){
    const xCard=document.createElement('div');xCard.className='ci-card';
    const allFaults={};all.forEach(s=>{if(!s.club)return;s.faults.forEach(f=>{if(!allFaults[f.name])allFaults[f.name]={};allFaults[f.name][s.club]=(allFaults[f.name][s.club]||0)+1})});
    let xHtml='<div class="ci-club-name" style="font-size:11px">Cross-Club Fault Patterns</div><div style="font-size:9px;color:var(--text3);margin-bottom:8px">Faults that appear with specific clubs but not others may indicate club-specific issues.</div>';
    const clubCounts={};clubs.forEach(c=>clubCounts[c]=all.filter(x=>x.club===c).length);
    Object.entries(allFaults).forEach(([fault,clubMap])=>{const rates={};Object.entries(clubMap).forEach(([club,count])=>{rates[club]=Math.round(count/clubCounts[club]*100)});const vals=Object.values(rates);const maxRate=Math.max(...vals),minRate=Math.min(...vals);if(maxRate-minRate>=30){const worst=Object.entries(rates).sort((a,b)=>b[1]-a[1])[0];xHtml+=`<div style="font-size:10px;padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--amber)">${fault}</span> <span style="color:var(--text3)">→ ${worst[1]}% with <strong style="color:var(--text)">${worst[0]}</strong> vs avg ${Math.round(vals.reduce((a,v)=>a+v,0)/vals.length)}% overall</span></div>`;}});
    xCard.innerHTML=xHtml;el.appendChild(xCard);
  }
}

window.delSaved=function(id){if(!confirm('Delete?'))return;saveSaved(getSaved().filter(s=>s.id!==id));renderSaved();};
window.cmpWith=function(id){const s=getSaved().find(x=>x.id===id);if(!s||!state.analysisResult)return;R.showCmp(state.analysisResult,s,state);document.querySelectorAll('.dtab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.dpanel').forEach(p=>p.classList.remove('active'));document.querySelector('[data-t="results"]').classList.add('active');$('p-results').classList.add('active');};

window.activateDrill=function(name){if(state.activeDrill?.name===name){clearDrill();return;}const d=A.getDrillDef(name);if(!d)return;state.activeDrill={name,...d};$('drillBanner').classList.add('visible');$('drillBannerText').textContent='🎯 '+d.desc;document.querySelectorAll('.f-btn.drill').forEach(b=>b.classList.toggle('drill-on',b.dataset.f===name));R.redraw(state);};
window.clearDrill=function(){state.activeDrill=null;$('drillBanner').classList.remove('visible');document.querySelectorAll('.f-btn.drill').forEach(b=>b.classList.remove('drill-on'));R.redraw(state);};
window.jumpFrame=function(i){if(!state.allFrameData.length)return;const fi=Math.max(0,Math.min(i,state.allFrameData.length-1));state.currentFrameIdx=fi;state.videoElement.pause();$('playBtn').textContent='▶';state.videoElement.currentTime=state.allFrameData[fi].time;$('frameLbl').textContent=`F${fi+1}/${state.allFrameData.length}`;R.redraw(state);};

// PDF report
window.exportPDF=async function(){
  if(!state.analysisResult||!state.allFrameData.length)return;
  if(!window.jspdf||!window.jspdf.jsPDF){
    alert('PDF export is not available. Make sure jsPDF is loaded and try again after the page finishes loading.');
    return;
  }
  const { jsPDF } = window.jspdf;
  let doc;
  try{doc=new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });}catch(e){
    alert('PDF export failed to initialize: '+e);
    return;
  }
  const W=210,H=297,margin=16;
  const r=state.analysisResult; const dateStr=new Date(r.date).toLocaleDateString('en-CA',{year:'numeric',month:'long',day:'numeric'});
  let y=0;
  const bg=[11,14,12],green=[74,222,128],amber=[251,191,36],red=[248,113,113],blue=[96,165,250];
  const text1=[237,242,238],text2=[156,168,159],text3=[92,105,96];
  doc.setFillColor(...bg);doc.rect(0,0,W,H,'F');
  y=margin;doc.setFont('helvetica','bold');doc.setFontSize(22);doc.setTextColor(...green);doc.text('SwingLab',margin,y+7);
  doc.setFontSize(9);doc.setTextColor(...text2);doc.text('Swing Analysis Report',margin+46,y+7);
  doc.setFontSize(8);doc.setTextColor(...text3);doc.text(dateStr,W-margin,y+7,{align:'right'});
  y+=14;doc.setDrawColor(30,38,34);doc.setLineWidth(0.3);doc.line(margin,y,W-margin,y);
  y+=8;const scoreCx=margin+14,scoreCy=y+14,scoreR=12;
  doc.setDrawColor(30,38,34);doc.setLineWidth(1.5);doc.circle(scoreCx,scoreCy,scoreR);
  const scoreCol=r.score>=75?green:r.score>=55?amber:red;doc.setDrawColor(...scoreCol);doc.setLineWidth(1.8);
  const sa2=-Math.PI/2,ea2=sa2+(r.score/100)*Math.PI*2;
  for(let a=sa2;a<ea2;a+=0.05){const a2=Math.min(a+0.05,ea2);doc.line(scoreCx+Math.cos(a)*scoreR,scoreCy+Math.sin(a)*scoreR,scoreCx+Math.cos(a2)*scoreR,scoreCy+Math.sin(a2)*scoreR)}
  doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(...scoreCol);doc.text(String(r.score),scoreCx,scoreCy+5,{align:'center'});
  const sx=margin+32;
  doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(...text1);doc.text('Swing Score',sx,y+8);
  doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(...text2);
  const sumText=r.faults.length===0?'No major faults detected.':`${r.faults.length} issue${r.faults.length>1?'s':''} detected. ${r.faults.filter(f=>f.severity==='high').length} high priority.`;
  doc.text(sumText,sx,y+15);
  const vt=r.view==='dtl'?'DTL':'FACE-ON';
  doc.setFontSize(8);doc.setFont('helvetica','bold');doc.setTextColor(...(r.view==='dtl'?[167,139,250]:blue));doc.text(vt,sx,y+23);
  doc.setFont('helvetica','normal');doc.setTextColor(...text3);
  doc.text(r.view==='dtl'?'  Down-the-line':'  Face-on',sx+doc.getTextWidth(vt),y+23);
  doc.text(state.handedness==='right'?'Right-handed':'Left-handed',W-margin,y+8,{align:'right'});
  doc.text(`${r.frameCount} frames`+(state.selectedClub?` · ${state.selectedClub}`:''),W-margin,y+15,{align:'right'});
  y+=35;doc.setDrawColor(30,38,34);doc.line(margin,y,W-margin,y);
  y+=6;doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(...text3);doc.text('KEY POSITIONS',margin,y+3);y+=7;
  const snaps=$('snapStrip').querySelectorAll('canvas');
  if(snaps.length){const labels=['Address','Halfway','Top','Transition','Impact','Finish'];const tw2=W-margin*2,gap2=2,fw=(tw2-(snaps.length-1)*gap2)/snaps.length,fh=fw*(snaps[0].height/snaps[0].width);
    snaps.forEach((c,i)=>{const fx=margin+i*(fw+gap2);try{doc.addImage(c.toDataURL('image/jpeg',0.85),'JPEG',fx,y,fw,fh)}catch(e){doc.setFillColor(23,28,25);doc.rect(fx,y,fw,fh,'F')}
      doc.setDrawColor(30,38,34);doc.setLineWidth(0.2);doc.rect(fx,y,fw,fh);doc.setFillColor(0,0,0);doc.rect(fx,y+fh-4,fw,4,'F');doc.setFontSize(5);doc.setTextColor(...text1);doc.text(labels[i]||'',fx+fw/2,y+fh-1,{align:'center'});doc.text;});y+=fh+4;}
  y+=6;doc.setDrawColor(30,38,34);doc.line(margin,y,W-margin,y);
  y+=6;doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(...text3);doc.text('METRICS',margin,y+3);y+=8;
  const mets=[{l:'Tempo',v:r.metrics.tempo||'—',u:':1'},{l:'Backswing',v:r.metrics.bsTime||'—',u:'ms'},{l:'Downswing',v:r.metrics.dsTime||'—',u:'ms'},{l:'Total',v:r.metrics.total||'—',u:'ms'},{l:'Hip Rotation',v:r.metrics.hipRot||'—',u:'°'},{l:'Shoulder',v:r.metrics.shRot||'—',u:'°'}];
  const mcw=(W-margin*2)/mets.length;
  mets.forEach((m,i)=>{const mx=margin+i*mcw;doc.setFillColor(17,20,18);doc.roundedRect(mx+1,y,mcw-2,16,2,2,'F');doc.setFontSize(6);doc.setFont('helvetica','normal');doc.setTextColor(...text3);doc.text(m.l.toUpperCase(),mx+mcw/2,y+5,{align:'center'});doc.setFontSize(11);doc.setFont('helvetica','bold');doc.setTextColor(...text1);doc.text(m.v+m.u,mx+mcw/2,y+13,{align:'center'});});
  y+=26;doc.setDrawColor(30,38,34);doc.line(margin,y,W-margin,y);y+=6;doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(...text3);doc.text(`DETECTED ISSUES (${r.faults.length})`,margin,y+3);y+=8;
  if(!r.faults.length){doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(...green);doc.text('No significant faults detected.',margin,y+5);} else {const ord={high:0,medium:1,low:2};const sorted=[...r.faults].sort((a,b)=>ord[a.severity]-ord[b.severity]);for(const f of sorted){if(y>H-45){doc.addPage();doc.setFillColor(...bg);doc.rect(0,0,W,H,'F');y=margin;}const sevCol=f.severity==='high'?red:f.severity==='medium'?amber:blue;const conf=f.conf||{score:0,label:'—'};const confCol=conf.score>=75?green:conf.score>=45?amber:red;doc.setFillColor(...sevCol);doc.circle(margin+2,y+2,1.5,'F');doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(...text1);doc.text(f.name,margin+7,y+3.5);const confText=`${conf.label} ${conf.score}%`;doc.setFontSize(6);doc.setFont('helvetica','normal');doc.setTextColor(...confCol);doc.text(confText,margin+7+doc.getTextWidth(f.name)+4,y+3);doc.setFontSize(6);doc.setTextColor(...text3);doc.text(f.phase,W-margin,y+3,{align:'right'});y+=7;doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...text2);const dl=doc.splitTextToSize(f.desc,W-margin*2-7);doc.text(dl,margin+7,y);y+=dl.length*3.5+2;doc.setDrawColor(...green);doc.setLineWidth(0.4);doc.line(margin+7,y-0.5,margin+7,y+3);doc.setFontSize(7);doc.setTextColor(...green);const fl2=doc.splitTextToSize(f.fix,W-margin*2-12);doc.text(fl2,margin+10,y+2);y+=fl2.length*3+6;}}
  y=H-12;doc.setDrawColor(30,38,34);doc.line(margin,y-4,W-margin,y-4);doc.setFont('helvetica','normal');doc.setFontSize(6);doc.setTextColor(...text3);doc.text('Generated by SwingLab — AI Golf Swing Analyzer',margin,y);doc.text(dateStr,W-margin,y,{align:'right'});
  doc.save(`SwingLab_Report_${new Date().toISOString().slice(0,10)}.pdf`);
};

// Service worker
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').then(reg=>console.log('[SW] Registered:',reg.scope)).catch(err=>console.log('[SW] Registration failed:',err));});}

// Expose state and helpers globally for inline event handlers
window.SwingLab=state;
window.runAnalysis=runAnalysis;
window.jumpFrame=window.jumpFrame;
window.clearDrill=window.clearDrill;
window.activateDrill=window.activateDrill;
window.cmpWith=window.cmpWith;
window.renderSaved=renderSaved;
window.renderClubInsights=renderClubInsights;
