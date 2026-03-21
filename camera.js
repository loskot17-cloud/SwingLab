import { LEAD_WRIST, TRAIL_WRIST, LEAD_SHOULDER, TRAIL_SHOULDER, LEAD_HIP, TRAIL_HIP, LEAD_ANKLE, TRAIL_ANKLE, LEAD_KNEE, TRAIL_KNEE } from './analysis.js';

export async function startCamera(state){
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}},audio:false});
  } catch(e){
    try { state.cameraStream = await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:false}); }
    catch(e2){ alert('Camera access denied or unavailable.'); return; }
  }
  document.getElementById('uploadZone').style.display='none';
  state.cameraFeed.srcObject=state.cameraStream;
  state.cameraFeed.style.display='block';
  document.getElementById('liveBar').style.display='flex';
  state.liveMode=true; state.swingState='idle'; state.liveFrameBuffer=[]; state.swingFrames=[]; state.preSwingBuffer=[];

  state.cameraFeed.addEventListener('loadeddata',()=>{
    state.poseCanvas.width=state.cameraFeed.videoWidth; state.poseCanvas.height=state.cameraFeed.videoHeight;
    state.syncCameraCanvas();
    initLivePose(state);
  },{once:true});
}

export function stopCamera(state){
  state.liveMode=false;
  if(state.liveAnimFrame) cancelAnimationFrame(state.liveAnimFrame);
  if(state.cameraStream){state.cameraStream.getTracks().forEach(t=>t.stop());state.cameraStream=null;}
  state.cameraFeed.style.display='none';
  document.getElementById('liveBar').style.display='none';
  location.reload();
}

function setLiveStatus(state,msg){document.getElementById('liveStatus').textContent=msg;}

export function resetSwingDetection(state,msg){
  state.swingState='ready'; state.swingFrames=[];
  setLiveStatus(state,msg||'Waiting for swing...');
  document.getElementById('liveIndicator').classList.remove('rec-dot');
  state.swingCooldown=15;
}

export async function initLivePose(state){
  setLiveStatus(state,'Loading AI model...');
  const livePose = new Pose({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${f}`});
  state.livePose = livePose;
  livePose.setOptions({modelComplexity:1,smoothLandmarks:true,enableSegmentation:false,minDetectionConfidence:0.5,minTrackingConfidence:0.5});
  livePose.onResults(results => onLiveResults(results,state));
  livePose.initialize().then(()=>{
    setLiveStatus(state,'Waiting for swing — get in position');
    state.swingState='ready';
    liveProcessLoop(state);
  }).catch(e=>setLiveStatus(state,'Model failed: '+e));
}

let liveProcessing=false;
export function liveProcessLoop(state){
  if(!state.liveMode) return;
  if(!liveProcessing){
    liveProcessing=true;
    state.livePose.send({image:state.cameraFeed}).then(()=>{liveProcessing=false}).catch(()=>{liveProcessing=false});
  }
  state.liveAnimFrame = requestAnimationFrame(()=>liveProcessLoop(state));
}

export function completeSwingCapture(state){
  if(state.swingFrames.length<state.MIN_SWING_FRAMES){
    resetSwingDetection(state,'Too few frames — try again');
    return;
  }

  document.getElementById('liveIndicator').classList.remove('rec-dot');
  setLiveStatus(state,`Captured ${state.swingFrames.length} frames — analyzing...`);
  state.liveMode=false;
  if(state.liveAnimFrame) cancelAnimationFrame(state.liveAnimFrame);

  const t0=state.swingFrames[0].time;
  state.allFrameData = state.swingFrames.map(f=>({time:f.time-t0,landmarks:f.landmarks}));
  state.currentFrameIdx=0;

  state.cameraFeed.style.display='none';
  if(state.cameraStream){state.cameraStream.getTracks().forEach(t=>t.stop());state.cameraStream=null;}
  document.getElementById('liveBar').style.display='none';

  state.videoElement.style.display='none';
  document.getElementById('controlsBar').classList.add('visible');
  document.getElementById('overlayBar').classList.add('visible');
  document.getElementById('drawerToggle').style.display='flex';

  state.poseCanvas.style.position='relative';
  state.poseCanvas.style.top='auto';state.poseCanvas.style.left='auto';
  state.poseCanvas.style.transform='none';
  state.poseCanvas.style.width='100%';state.poseCanvas.style.height='100%';

  document.getElementById('statusPill').textContent='Live capture';
  document.getElementById('statusPill').classList.add('active');
  document.getElementById('frameLbl').textContent=`F1/${state.allFrameData.length}`;

  state._cameraMode=true;
  state.runAnalysis();
}

function onLiveResults(results, state){
  if(!state.liveMode) return;
  state.syncCameraCanvas();
  const ctx=state.ctx, w=state.poseCanvas.width, h=state.poseCanvas.height;
  ctx.clearRect(0,0,w,h);
  if(!results.poseLandmarks) return;
  const lm=results.poseLandmarks;
  const conn=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
  ctx.lineCap='round';ctx.lineWidth=2;ctx.strokeStyle='rgba(74,222,128,0.6)';
  for(const [a,b] of conn){
    if(lm[a].visibility>0.3&&lm[b].visibility>0.3){ctx.beginPath();ctx.moveTo(lm[a].x*w,lm[a].y*h);ctx.lineTo(lm[b].x*w,lm[b].y*h);ctx.stroke();}
  }
  for(const i of [11,12,13,14,15,16,23,24,25,26,27,28]){if(lm[i].visibility>0.3){ctx.beginPath();ctx.arc(lm[i].x*w,lm[i].y*h,3,0,Math.PI*2);ctx.fillStyle='rgba(74,222,128,0.8)';ctx.fill();}}

  const frameData={time:performance.now()/1000,landmarks:lm.map(p=>({x:p.x,y:p.y,z:p.z,visibility:p.visibility}))};
  const wristY=Math.min(lm[LEAD_WRIST(state.handedness)].y,lm[TRAIL_WRIST(state.handedness)].y);
  const shoulderY=(lm[LEAD_SHOULDER(state.handedness)].y+lm[TRAIL_SHOULDER(state.handedness)].y)/2;
  const wristRelative=shoulderY-wristY;
  state.wristSmooth=state.wristSmooth*0.7+wristRelative*0.3;
  const motion=state.lastWristY!==null?Math.abs(wristY-state.lastWristY):0;
  state.motionSmooth=state.motionSmooth*0.6+motion*0.4;
  state.lastWristY=wristY;

  if(state.swingCooldown>0){state.swingCooldown--;return;}

  state.preSwingBuffer.push(frameData);
  if(state.preSwingBuffer.length>state.PRE_BUFFER_SIZE)state.preSwingBuffer.shift();

  if(state.swingState==='ready'){
    if(state.wristSmooth>0.05&&state.motionSmooth>0.008){
      state.swingState='backswing'; state.swingFrames=[...state.preSwingBuffer];
      setLiveStatus(state,'Swing detected — recording...');
      document.getElementById('liveIndicator').classList.add('rec-dot');
    }
  } else if(state.swingState==='backswing'){
    state.swingFrames.push(frameData);
    if(state.wristSmooth<0.1&&state.swingFrames.length>5){
      state.swingState='downswing';
      let extraFrames=0;
      const captureExtra=()=>{
        if(extraFrames<5&&state.liveMode){extraFrames++;setTimeout(captureExtra,80);} else {completeSwingCapture(state);}
      };
      captureExtra();
      return;
    }
    if(state.swingFrames.length>45){resetSwingDetection(state,'Swing too long — resetting');}
  } else if(state.swingState==='downswing'){
    state.swingFrames.push(frameData);
    if(state.motionSmooth<0.004&&state.wristSmooth<0.02&&state.swingFrames.length>=state.MIN_SWING_FRAMES){
      state.swingState='finish';
      let extraFrames=0;
      const captureExtra=()=>{if(extraFrames<5&&state.liveMode){extraFrames++;setTimeout(captureExtra,80);} else {completeSwingCapture(state);}};
      captureExtra();
      return;
    }
    if(state.swingFrames.length>60){resetSwingDetection(state,'Swing too long — resetting');}
  } else if(state.swingState==='finish'){
    state.swingFrames.push(frameData);
  }
}
