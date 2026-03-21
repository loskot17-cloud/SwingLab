import { L, getDrillDef, getIdealPose, gradeLimbs } from './analysis.js';

function lookupState(state){
  if(!state)throw new Error('state required');
  return state;
}

export function drawDrill(state){
  state=lookupState(state);
  const { activeDrill, analysisResult, allFrameData, currentFrameIdx, ctx } = state;
  if(!activeDrill||!analysisResult?.phases) return;
  const aF=allFrameData[analysisResult.phases.address.end];
  const cF=allFrameData[currentFrameIdx];
  if(!aF||!cF)return;
  let p;
  try{p=activeDrill.get(aF.landmarks,cF.landmarks,state.poseCanvas.width,state.poseCanvas.height)}catch(e){return;}
  ctx.save();
  if(activeDrill.type==='vline'){
    ctx.fillStyle=p.col;ctx.fillRect(p.x-p.zw,0,p.zw*2,state.poseCanvas.height);
    ctx.setLineDash([5,4]);ctx.lineWidth=1.5;ctx.strokeStyle=p.col.replace('0.4','0.7');
    ctx.beginPath();ctx.moveTo(p.x,0);ctx.lineTo(p.x,state.poseCanvas.height);ctx.stroke();ctx.setLineDash([]);
    ctx.font='600 9px var(--mono)';ctx.fillStyle=p.col.replace('0.4','0.8');ctx.textAlign='center';ctx.fillText(p.lbl,p.x,16);
  } else if(activeDrill.type==='vzone'){
    ctx.fillStyle=p.col;ctx.strokeStyle=p.bc;ctx.lineWidth=1.5;ctx.setLineDash([4,3]);
    ctx.fillRect(p.x-p.w/2,p.y,p.w,p.h);ctx.strokeRect(p.x-p.w/2,p.y,p.w,p.h);ctx.setLineDash([]);
    ctx.font='600 8px var(--mono)';ctx.fillStyle=p.bc;ctx.textAlign='center';ctx.fillText(p.lbl,p.x,p.y-4);
  } else if(activeDrill.type==='eline'){
    ctx.setLineDash([6,4]);ctx.lineWidth=2;ctx.strokeStyle=p.col;
    ctx.beginPath();ctx.moveTo(p.x1,p.y1);ctx.lineTo(p.x2,p.y2);ctx.stroke();ctx.setLineDash([]);
    ctx.font='600 8px var(--mono)';ctx.fillStyle=p.col.replace('0.4','0.8');ctx.textAlign='center';ctx.fillText(p.lbl,(p.x1+p.x2)/2,Math.min(p.y1,p.y2)-6);
  } else if(activeDrill.type==='slot'){
    const dx=p.x2-p.x1,dy=p.y2-p.y1,l=Math.hypot(dx,dy),nx=-dy/l*p.sw/2,ny=dx/l*p.sw/2;
    ctx.fillStyle=p.col;
    ctx.beginPath();ctx.moveTo(p.x1+nx,p.y1+ny);ctx.lineTo(p.x2+nx,p.y2+ny);ctx.lineTo(p.x2-nx,p.y2-ny);ctx.lineTo(p.x1-nx,p.y1-ny);ctx.closePath();ctx.fill();
    ctx.strokeStyle=p.bc;ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.stroke();ctx.setLineDash([]);
    ctx.font='600 8px var(--mono)';ctx.fillStyle=p.bc;ctx.textAlign='center';ctx.fillText(p.lbl,(p.x1+p.x2)/2+p.sw,(p.y1+p.y2)/2);
  }
  ctx.restore();
}

export function redraw(state){
  state=lookupState(state);
  const {ctx,poseCanvas,allFrameData,currentFrameIdx,showSkeleton,showPlane,showAngles,showGhost,detectedView,videoElement,_cameraMode,analysisResult} = state;
  ctx.clearRect(0,0,poseCanvas.width,poseCanvas.height);
  if(_cameraMode){
    ctx.fillStyle='#0b0e0c';ctx.fillRect(0,0,poseCanvas.width,poseCanvas.height);
    ctx.strokeStyle='rgba(255,255,255,0.03)';ctx.lineWidth=1;
    for(let x=0;x<poseCanvas.width;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,poseCanvas.height);ctx.stroke()}
    for(let y=0;y<poseCanvas.height;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(poseCanvas.width,y);ctx.stroke()}
  } else {
    if(videoElement){
      const r=videoElement.getBoundingClientRect();
      poseCanvas.style.width=r.width+'px';poseCanvas.style.height=r.height+'px';poseCanvas.style.left=r.left+'px';poseCanvas.style.top=r.top+'px';
    }
  }
  if(!allFrameData.length)return;
  const fd=allFrameData[currentFrameIdx];if(!fd)return;
  const lm=fd.landmarks,w=poseCanvas.width,h=poseCanvas.height;

  if(showGhost&&analysisResult){
    const phase=state.getPhase(currentFrameIdx);
    const idealLm=getIdealPose(analysisResult,allFrameData,detectedView,phase,state.handedness);
    if(idealLm){
      const conn=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
      ctx.save();ctx.globalAlpha=0.50;ctx.lineCap='round';ctx.lineWidth=2;ctx.strokeStyle='#ffffff';ctx.setLineDash([5,4]);
      for(const [a,b] of conn){if(idealLm[a].visibility>0.3 && idealLm[b].visibility>0.3){ctx.beginPath();ctx.moveTo(idealLm[a].x*w,idealLm[a].y*h);ctx.lineTo(idealLm[b].x*w,idealLm[b].y*h);ctx.stroke()}}
      ctx.setLineDash([]);ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.fillStyle='rgba(255,255,255,0.1)';
      for(const i of [11,12,13,14,15,16,23,24,25,26,27,28]){if(idealLm[i].visibility>0.3){ctx.beginPath();ctx.arc(idealLm[i].x*w,idealLm[i].y*h,4,0,Math.PI*2);ctx.fill();ctx.stroke()}}
      ctx.globalAlpha=0.45;ctx.font='500 9px var(--mono)';ctx.fillStyle='#fff';ctx.textAlign='left';
      ctx.fillText('IDEAL '+phase.toUpperCase(),Math.min(idealLm[L.LEFT_SHOULDER].x,idealLm[L.RIGHT_SHOULDER].x)*w,Math.min(idealLm[L.LEFT_SHOULDER].y,idealLm[L.RIGHT_SHOULDER].y)*h-12);
      ctx.restore();
    }
  }

  if(showSkeleton){
    const conn=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[28,30],[29,31],[30,32]];
    const phase=state.getPhase(currentFrameIdx);
    const grades=gradeLimbs(fd,phase,analysisResult,allFrameData,detectedView,state.handedness);
    ctx.lineCap='round';
    for(const [a,b] of conn){
      if(lm[a].visibility>0.3&&lm[b].visibility>0.3){
        const g=grades[a+'-'+b]||'good';
        if(g!=='good'){ctx.lineWidth=6;ctx.strokeStyle=g==='warn'?'rgba(251,191,36,0.1)':'rgba(248,113,113,0.12)';ctx.beginPath();ctx.moveTo(lm[a].x*w,lm[a].y*h);ctx.lineTo(lm[b].x*w,lm[b].y*h);ctx.stroke();}
        ctx.lineWidth=g==='good'?1.8:2.2;
        ctx.strokeStyle=g==='good'?'rgba(74,222,128,0.75)':g==='warn'?'rgba(251,191,36,0.8)':'rgba(248,113,113,0.8)';
        ctx.beginPath();ctx.moveTo(lm[a].x*w,lm[a].y*h);ctx.lineTo(lm[b].x*w,lm[b].y*h);ctx.stroke();
      }
    }
    const jg={};
    for(const [a,b] of conn){const g=grades[a+'-'+b]||'good';const rk={bad:0,warn:1,good:2}; for(const j of [a,b]) if(!jg[j]||rk[g]<rk[jg[j]]) jg[j]=g;}
    for(const i of [11,12,13,14,15,16,23,24,25,26,27,28]){
      if(lm[i].visibility>0.3){const g=jg[i]||'good';ctx.beginPath();ctx.arc(lm[i].x*w,lm[i].y*h,g==='good'?2.5:3.5,0,Math.PI*2);ctx.fillStyle=g==='good'?'rgba(74,222,128,0.9)':g==='warn'?'rgba(251,191,36,0.9)':'rgba(248,113,113,0.9)';ctx.fill();}
    }
  }

  if(showPlane&&detectedView==='dtl'&&analysisResult?.phases){
    const aF=allFrameData[analysisResult.phases.address.end];
    if(aF){
      ctx.save();
      const hp=aF.landmarks[L.RIGHT_HIP],sh=aF.landmarks[L.RIGHT_SHOULDER],dx=sh.x-hp.x,dy=sh.y-hp.y,ln=Math.hypot(dx,dy);
      if(ln>0.01){const ex=dx/ln,ey=dy/ln;ctx.setLineDash([6,5]);ctx.lineWidth=1.2;ctx.strokeStyle='rgba(167,139,250,0.45)';
      ctx.beginPath();ctx.moveTo((hp.x-ex*0.3)*w,(hp.y-ey*0.3)*h);ctx.lineTo((sh.x+ex*0.5)*w,(sh.y+ey*0.5)*h);ctx.stroke();ctx.setLineDash([]);}
      ctx.restore();
    }
  }

  if(showAngles){
    ctx.font='500 10px var(--mono)';ctx.textAlign='center';
    const phase=state.getPhase(currentFrameIdx),grades=gradeLimbs(fd,phase,analysisResult,allFrameData,detectedView,state.handedness);
    if(lm[L.LEFT_SHOULDER].visibility>0.3&&lm[L.LEFT_ELBOW].visibility>0.3&&lm[L.LEFT_WRIST].visibility>0.3){
      const a=ang(lm[L.LEFT_SHOULDER],lm[L.LEFT_ELBOW],lm[L.LEFT_WRIST]),ex=lm[L.LEFT_ELBOW].x*w,ey=lm[L.LEFT_ELBOW].y*h;
      const g=grades['11-13']||'good',c=g==='good'?'#4ade80':g==='warn'?'#fbbf24':'#f87171';
      ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(ex-16,ey-18,32,14);ctx.fillStyle=c;ctx.fillText(a.toFixed(0)+'°',ex,ey-7);
    }
    if(lm[L.LEFT_SHOULDER].visibility>0.3&&lm[L.LEFT_HIP].visibility>0.3&&lm[L.LEFT_KNEE].visibility>0.3){
      const a=ang(lm[L.LEFT_SHOULDER],lm[L.LEFT_HIP],lm[L.LEFT_KNEE]),ex=lm[L.LEFT_HIP].x*w,ey=lm[L.LEFT_HIP].y*h;
      const g=grades['11-23']||'good',c=g==='good'?'#4ade80':g==='warn'?'#fbbf24':'#f87171';
      ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(ex-16,ey-18,32,14);ctx.fillStyle=c;ctx.fillText(a.toFixed(0)+'°',ex,ey-7);
    }
    if(lm[L.RIGHT_HIP].visibility>0.3&&lm[L.RIGHT_KNEE].visibility>0.3&&lm[L.RIGHT_ANKLE].visibility>0.3){
      const a=ang(lm[L.RIGHT_HIP],lm[L.RIGHT_KNEE],lm[L.RIGHT_ANKLE]),ex=lm[L.RIGHT_KNEE].x*w,ey=lm[L.RIGHT_KNEE].y*h;
      const g=grades['24-26']||'good',c=g==='good'?'#4ade80':g==='warn'?'#fbbf24':'#f87171';
      ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(ex-16,ey+4,32,14);ctx.fillStyle=c;ctx.fillText(a.toFixed(0)+'°',ex,ey+15);
    }
  }

  drawDrill(state);
}

export function captureSnaps(state){
  state=lookupState(state);
  const {analysisResult,allFrameData,videoElement,_cameraMode,poseCanvas,stateHook} = state;
  if(!analysisResult?.phases)return;
  const ph=analysisResult.phases;
  const keys=[
    {i:ph.address.end,l:'Address'},{i:Math.floor((ph.address.end+ph.topIdx)/2),l:'Halfway'},{i:ph.topIdx,l:'Top'},{i:Math.floor((ph.topIdx+ph.impactIdx)/2),l:'Transition'},{i:ph.impactIdx,l:'Impact'},{i:Math.min(ph.impactIdx+Math.floor((allFrameData.length-ph.impactIdx)*0.6),allFrameData.length-1),l:'Finish'}
  ];
  const strip=document.getElementById('snapStrip');
  if(!strip)return;
  strip.innerHTML='';
  const tw=_cameraMode?120:Math.round(120*(videoElement.videoWidth/videoElement.videoHeight||0.75));
  const th=120;

  for(const kf of keys){
    const fi=Math.max(0,Math.min(kf.i,allFrameData.length-1)),fd=allFrameData[fi];
    if(!fd)continue;
    if(!_cameraMode){
      state.seekTo(videoElement,fd.time).then(()=>{});
    }
    const wr=document.createElement('div');wr.className='snap-f';
    const c=document.createElement('canvas');c.width=tw;c.height=th;const cx=c.getContext('2d');
    if(_cameraMode){cx.fillStyle='#0b0e0c';cx.fillRect(0,0,tw,th);} else {cx.drawImage(videoElement,0,0,videoElement.videoWidth,videoElement.videoHeight,0,0,tw,th);}
    const lm=fd.landmarks;
    const phase=state.getPhase(fi);
    const grades=gradeLimbs(fd,phase,analysisResult,allFrameData,state.detectedView,state.handedness);
    const conn=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
    cx.lineCap='round';
    for(const [a,b] of conn){
      if(lm[a].visibility>0.3&&lm[b].visibility>0.3){
        const g=grades[a+'-'+b]||'good';cx.lineWidth=1.5;
        cx.strokeStyle=g==='good'?'rgba(74,222,128,0.7)':g==='warn'?'rgba(251,191,36,0.7)':'rgba(248,113,113,0.7)';
        cx.beginPath();cx.moveTo(lm[a].x*tw,lm[a].y*th);cx.lineTo(lm[b].x*tw,lm[b].y*th);cx.stroke();
      }
    }
    for(const i of [11,12,15,16,23,24,25,26]){
      if(lm[i].visibility>0.3){cx.beginPath();cx.arc(lm[i].x*tw,lm[i].y*th,1.5,0,Math.PI*2);cx.fillStyle='#fff';cx.fill();}
    }
    wr.appendChild(c);
    const lb=document.createElement('div');lb.className='snap-lbl';lb.textContent=kf.l;wr.appendChild(lb);
    wr.addEventListener('click',()=>{state.currentFrameIdx=fi;if(!_cameraMode){videoElement.currentTime=fd.time;}state.redraw();});
    strip.appendChild(wr);
  }

  if(!_cameraMode && allFrameData[state.currentFrameIdx]) videoElement.currentTime=allFrameData[state.currentFrameIdx].time;
}

export function showCmp(cur,sav,state){
  const cmpSec=document.getElementById('cmpSec');
  const cmpContent=document.getElementById('cmpContent');
  if(!cmpSec||!cmpContent){return;}
  cmpSec.style.display='block';
  const rows=[{l:'Score',c:cur.score,s:sav.score,u:''},{l:'Tempo',c:cur.metrics.tempo,s:sav.metrics?.tempo,u:':1'},{l:'Issues',c:cur.faults.length,s:sav.faults?.length,u:''}];
  let h=`<div style="font-size:10px;color:var(--text3);margin-bottom:8px;font-family:var(--mono)">vs. ${sav.name}</div>`;
  rows.forEach(r=>{const cv=parseFloat(r.c)||0,sv=parseFloat(r.s)||0,d=cv-sv,ok=r.l==='Issues'?d<0:d>0;h+=`<div class="cmp-grid" style="margin-bottom:5px"><div class="cmp-col"><div class="cl">Now</div><div class="cv">${r.c||'—'}${r.u}</div></div><div class="cmp-vs"><div>${r.l}</div><div class="cmp-d ${ok?'pos':'neg'}">${d>0?'+':''}${d.toFixed(r.l==='Tempo'?1:0)}</div></div><div class="cmp-col"><div class="cl">Saved</div><div class="cv">${r.s||'—'}${r.u}</div></div></div>`;});
  cmpContent.innerHTML=h;
}

export function compareSaved(state){
  const saved=JSON.parse(localStorage.getItem('swinglab_swings')||'[]');
  if(!saved.length||!state.analysisResult)return;
  const m=saved.find(x=>x.view===state.detectedView);
  if(m) showCmp(state.analysisResult,m,state);
}
