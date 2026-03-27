export const L = {
  NOSE:0,LEFT_SHOULDER:11,RIGHT_SHOULDER:12,LEFT_ELBOW:13,RIGHT_ELBOW:14,LEFT_WRIST:15,RIGHT_WRIST:16,
  LEFT_HIP:23,RIGHT_HIP:24,LEFT_KNEE:25,RIGHT_KNEE:26,LEFT_ANKLE:27,RIGHT_ANKLE:28,LEFT_HEEL:29,RIGHT_HEEL:30,
  LEFT_FOOT_INDEX:31,RIGHT_FOOT_INDEX:32
};

export function LEAD_SHOULDER(handedness){return handedness==='right'?L.LEFT_SHOULDER:L.RIGHT_SHOULDER}
export function TRAIL_SHOULDER(handedness){return handedness==='right'?L.RIGHT_SHOULDER:L.LEFT_SHOULDER}
export function LEAD_ELBOW(handedness){return handedness==='right'?L.LEFT_ELBOW:L.RIGHT_ELBOW}
export function TRAIL_ELBOW(handedness){return handedness==='right'?L.RIGHT_ELBOW:L.LEFT_ELBOW}
export function LEAD_WRIST(handedness){return handedness==='right'?L.LEFT_WRIST:L.RIGHT_WRIST}
export function TRAIL_WRIST(handedness){return handedness==='right'?L.RIGHT_WRIST:L.LEFT_WRIST}
export function LEAD_HIP(handedness){return handedness==='right'?L.LEFT_HIP:L.RIGHT_HIP}
export function TRAIL_HIP(handedness){return handedness==='right'?L.RIGHT_HIP:L.LEFT_HIP}
export function LEAD_KNEE(handedness){return handedness==='right'?L.LEFT_KNEE:L.RIGHT_KNEE}
export function TRAIL_KNEE(handedness){return handedness==='right'?L.RIGHT_KNEE:L.LEFT_KNEE}
export function LEAD_ANKLE(handedness){return handedness==='right'?L.LEFT_ANKLE:L.RIGHT_ANKLE}
export function TRAIL_ANKLE(handedness){return handedness==='right'?L.RIGHT_ANKLE:L.LEFT_ANKLE}

export function st(baseThreshold,faultKey,faultSensitivity){
  const s=faultSensitivity?.[faultKey]||1.0;
  return baseThreshold * (2 - s);
}

export function ang(a,b,c){
  const ba={x:a.x-b.x,y:a.y-b.y},bc={x:c.x-b.x,y:c.y-b.y};
  const dot=ba.x*bc.x+ba.y*bc.y;
  const ma=Math.hypot(ba.x,ba.y),mc=Math.hypot(bc.x,bc.y);
  if(!ma||!mc)return 0;
  return Math.acos(Math.max(-1,Math.min(1,dot/(ma*mc))))*180/Math.PI;
}

export function mid(a,b){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2}};

export function detectView(frames){
  if(!frames||!frames.length)return 'unknown';
  const s=frames.slice(0,Math.min(5,frames.length));
  let tx=0;
  for(const f of s){tx+=Math.abs(f.landmarks[L.LEFT_SHOULDER].x-f.landmarks[L.RIGHT_SHOULDER].x)}
  return (tx/s.length)<0.09?'dtl':'face-on';
}

export function detectPhases(frames){
  if(!frames||frames.length<5)return null;
  const wY=frames.map(f=>Math.min(f.landmarks[L.LEFT_WRIST].y,f.landmarks[L.RIGHT_WRIST].y));
  const sY=frames.map(f=>(f.landmarks[L.LEFT_SHOULDER].y+f.landmarks[L.RIGHT_SHOULDER].y)/2);
  let topI=0,minY=wY[0];
  for(let i=1;i<wY.length;i++)if(wY[i]<minY){minY=wY[i];topI=i}
  let impI=topI;
  for(let i=topI;i<frames.length;i++){if(wY[i]>sY[i]-0.03){impI=i;break}}
  if(impI===topI)impI=Math.min(topI+Math.floor((frames.length-topI)*0.5),frames.length-1);
  const addrEnd=Math.max(1,Math.floor(topI*0.15));
  return {
    address:{start:0,end:addrEnd},
    backswing:{start:addrEnd,end:topI},
    top:{start:topI,end:topI},
    downswing:{start:topI,end:impI},
    impact:{start:impI,end:impI},
    followThrough:{start:impI,end:frames.length-1},
    topIdx:topI,
    impactIdx:impI
  };
}

export function faultConfidence(frames, landmarkIndices, frameIndices){
  if(!frames.length||!landmarkIndices.length||!frameIndices.length)return {score:0,label:'Unknown',cls:'low-conf'};
  let totalVis=0,count=0;
  for(const fi of frameIndices){
    if(fi<0||fi>=frames.length)continue;
    const lm=frames[fi].landmarks;
    for(const li of landmarkIndices){
      if(lm[li]){totalVis+=lm[li].visibility;count++;}
    }
  }
  const avg=count>0?(totalVis/count)*100:0;
  if(avg>=75)return {score:Math.round(avg),label:'High',cls:'high-conf'};
  if(avg>=45)return {score:Math.round(avg),label:'Medium',cls:'med-conf'};
  return {score:Math.round(avg),label:'Low',cls:'low-conf'};
}

export function analyzeFaults(frames,phases,view,handedness,faultSensitivity){
  const faults=[];
  if(!phases||frames.length<5)return faults;
  const addr=frames[phases.address.end],top=frames[phases.topIdx],impact=frames[phases.impactIdx],finish=frames[frames.length-1];
  const LS=LEAD_SHOULDER(handedness),TS=TRAIL_SHOULDER(handedness),LE=LEAD_ELBOW(handedness),TE=TRAIL_ELBOW(handedness),LW=LEAD_WRIST(handedness),TW=TRAIL_WRIST(handedness);
  const LH=LEAD_HIP(handedness),TH=TRAIL_HIP(handedness),LK=LEAD_KNEE(handedness),TK=TRAIL_KNEE(handedness),LA=LEAD_ANKLE(handedness),TA=TRAIL_ANKLE(handedness);
  const ai=phases.address.end, ti=phases.topIdx, ii=phases.impactIdx;

  if(view==='face-on'){
    if(addr&&top){
      const s=Math.abs(addr.landmarks[L.NOSE].x-top.landmarks[L.NOSE].x);
      if(s>st(0.06,'Head Movement',faultSensitivity))
        faults.push({name:'Excessive Head Movement',severity:s>st(0.09,'Head Movement',faultSensitivity)?'high':'medium',phase:'Backswing',desc:`Head shifted ${(s*100).toFixed(1)}% laterally — sway not rotation.`,fix:'Drill: Headcover under trail foot. Swing without stepping off it.',frameIdx:ti,conf:faultConfidence(frames,[L.NOSE],[ai,ti])});
    }
    if(addr&&top){
      const hcA=mid(addr.landmarks[LH],addr.landmarks[TH]),hcT=mid(top.landmarks[LH],top.landmarks[TH]);
      const s=Math.abs(hcT.x-hcA.x);
      if(s>st(0.05,'Hip Slide',faultSensitivity))
        faults.push({name:'Hip Slide',severity:s>st(0.08,'Hip Slide',faultSensitivity)?'high':'medium',phase:'Backswing',desc:`Hips shifted ${(s*100).toFixed(1)}% laterally instead of rotating.`,fix:'Drill: Object against trail hip. Turn into it, don\'t slide past.',frameIdx:ti,conf:faultConfidence(frames,[LH,TH],[ai,ti])});
    }
    if(top){
      const e=ang(top.landmarks[LS],top.landmarks[LE],top.landmarks[LW]);
      if(e<st(155,'Lead Arm',faultSensitivity))
        faults.push({name:'Bent Lead Arm',severity:e<st(135,'Lead Arm',faultSensitivity)?'high':'medium',phase:'Top',desc:`Lead elbow ${e.toFixed(0)}° at top (ideal: 170°+).`,fix:'Drill: Alignment stick along lead forearm. Feel extension without tension.',frameIdx:ti,conf:faultConfidence(frames,[LS,LE,LW],[ti])});
    }
    if(addr&&impact){
      const hcA=mid(addr.landmarks[LH],addr.landmarks[TH]),hcI=mid(impact.landmarks[LH],impact.landmarks[TH]);
      const sw=Math.abs(addr.landmarks[LA].x-addr.landmarks[TA].x);
      if(sw>0.01&&Math.abs(hcI.x-hcA.x)/sw<st(0.1,'Weight Transfer',faultSensitivity))
        faults.push({name:'Weight Transfer',severity:'medium',phase:'Impact',desc:'Weight stays centered instead of shifting to lead side.',fix:'Drill: Step-through — trail foot steps toward target after impact.',frameIdx:ii,conf:faultConfidence(frames,[LH,TH,LA,TA],[ai,ii])});
    }
    if(addr&&top){
      const ka=ang(addr.landmarks[TH],addr.landmarks[TK],addr.landmarks[TA]),kt=ang(top.landmarks[TH],top.landmarks[TK],top.landmarks[TA]);
      if(kt-ka>st(15,'Trail Knee',faultSensitivity))
        faults.push({name:'Trail Knee Straightening',severity:'medium',phase:'Backswing',desc:`Trail knee extended ${(kt-ka).toFixed(0)}° during backswing.`,fix:'Drill: Pressure on inside of trail foot. "Sit" into trail hip.',frameIdx:ti,conf:faultConfidence(frames,[TH,TK,TA],[ai,ti])});
    }
    if(finish){
      const hw=Math.abs(finish.landmarks[LH].x-finish.landmarks[TH].x);
      if(hw>st(0.06,'Finish',faultSensitivity)){
        const fi=Math.min(ii+5,frames.length-1);
        faults.push({name:'Incomplete Finish',severity:'low',phase:'Finish',desc:'Hips haven\'t fully rotated through.',fix:'Hold finish 3 seconds. Belt buckle faces target.',frameIdx:fi,conf:faultConfidence(frames,[LH,TH],[fi])});
      }
    }
    if(addr&&top){
      const shA=ang(addr.landmarks[TH],addr.landmarks[LS],addr.landmarks[LH]),shT=ang(top.landmarks[TH],top.landmarks[LS],top.landmarks[LH]),d=shT-shA;
      if(d>st(12,'Reverse Spine',faultSensitivity))
        faults.push({name:'Reverse Spine Angle',severity:d>st(20,'Reverse Spine',faultSensitivity)?'high':'medium',phase:'Backswing → Top',desc:`Spine tilted ${d.toFixed(0)}° toward target at top — should tilt away.`,fix:'Drill: Feel chest rotate away from target. Maintain spine tilt.',frameIdx:ti,conf:faultConfidence(frames,[LS,LH,TH],[ai,ti])});
    }
    if(top&&impact&&phases.downswing.end-phases.downswing.start>2){
      const ei=phases.downswing.start+Math.floor((phases.downswing.end-phases.downswing.start)*0.3);
      if(ei<frames.length){
        const lwT=ang(top.landmarks[LS],top.landmarks[LW],top.landmarks[LE]),lwE=frames[ei]?ang(frames[ei].landmarks[LS],frames[ei].landmarks[LW],frames[ei].landmarks[LE]):lwT;
        if(lwE>lwT+st(8,'Casting',faultSensitivity))
          faults.push({name:'Casting',severity:lwE>lwT+st(15,'Casting',faultSensitivity)?'high':'medium',phase:'Downswing',desc:`Wrist angle opened ${(lwE-lwT).toFixed(0)}° early — premature release.`,fix:'Drill: Trail palm faces target at waist. Delay wrist straightening.',frameIdx:ei,conf:faultConfidence(frames,[LS,LW,LE],[ti,ei])});
      }
    }
    if(top&&impact){
      const nT=top.landmarks[L.NOSE].y,nI=impact.landmarks[L.NOSE].y,dip=nI-nT;
      if(dip>st(0.05,'Head Dip',faultSensitivity))
        faults.push({name:'Head Dip',severity:dip>st(0.1,'Head Dip',faultSensitivity)?'high':'medium',phase:'Downswing → Impact',desc:`Head dropped ${(dip*100).toFixed(1)}% vertically — losing height.`,fix:'Drill: Maintain posture. No ducking into impact — feel tall through ball.',frameIdx:ii,conf:faultConfidence(frames,[L.NOSE],[ti,ii])});
    }
    if(impact&&addr){
      const hcI=mid(impact.landmarks[LH],impact.landmarks[TH]),lA=addr.landmarks[LA];
      const s=Math.abs(hcI.x-lA.x);
      if(s>st(0.04,'Hip Slide Impact',faultSensitivity))
        faults.push({name:'Hip Slide at Impact',severity:s>st(0.06,'Hip Slide Impact',faultSensitivity)?'high':'medium',phase:'Impact',desc:`Hips shifted ${(s*100).toFixed(1)}% past lead ankle at impact.`,fix:'Drill: Lead knee post. Hips stop there; don\'t slide through.',frameIdx:ii,conf:faultConfidence(frames,[LH,TH,LA],[ai,ii])});
    }
    if(addr){
      const dyShoulders=Math.abs(addr.landmarks[LS].y-addr.landmarks[TS].y);
      if(dyShoulders>st(0.04,'Shoulder Tilt',faultSensitivity))
        faults.push({name:'Shoulder Tilt at Address',severity:dyShoulders>st(0.07,'Shoulder Tilt',faultSensitivity)?'high':'medium',phase:'Address',desc:`Shoulders tilted ${(dyShoulders*100).toFixed(1)}% — not level.`,fix:'Drill: Alignment stick across shoulders. Level at address.',frameIdx:ai,conf:faultConfidence(frames,[LS,TS],[ai])});
    }
    if(addr&&top){
      const lkA=ang(addr.landmarks[LH],addr.landmarks[LK],addr.landmarks[LA]),lkT=ang(top.landmarks[LH],top.landmarks[LK],top.landmarks[LA]),d=lkA-lkT;
      if(d>st(10,'Lead Knee Collapse',faultSensitivity))
        faults.push({name:'Lead Knee Collapse',severity:d>st(18,'Lead Knee Collapse',faultSensitivity)?'high':'medium',phase:'Backswing',desc:`Lead knee collapsed inward ${d.toFixed(0)}° — losing stability.`,fix:'Drill: Pressure on inside thigh. Stay over ball. Flex forward knee.',frameIdx:ti,conf:faultConfidence(frames,[LH,LK,LA],[ai,ti])});
    }
    if(addr&&top&&phases.address.end<frames.length){
      const earlyFrame=phases.address.end+Math.floor((ti-phases.address.end)*0.1);
      if(earlyFrame<frames.length){
        const eF=frames[earlyFrame],lwA=ang(addr.landmarks[LS],addr.landmarks[LW],addr.landmarks[LE]),lwE=ang(eF.landmarks[LS],eF.landmarks[LW],eF.landmarks[LE]),d=lwA-lwE;
        if(d>st(12,'Early Wrist Hinge',faultSensitivity))
          faults.push({name:'Early Wrist Hinge',severity:d>st(20,'Early Wrist Hinge',faultSensitivity)?'high':'medium',phase:'Takeaway',desc:`Wrists hinged ${d.toFixed(0)}° too early — no width.`,fix:'Drill: Straight back. Feel lead arm straight line to ball for 2 feet.',frameIdx:earlyFrame,conf:faultConfidence(frames,[LS,LW,LE],[ai,earlyFrame])});
      }
    }
  } else {
    if(addr&&impact){
      const hx=(impact.landmarks[LH].x+impact.landmarks[TH].x)/2-(addr.landmarks[LH].x+addr.landmarks[TH].x)/2;
      if(hx>st(0.03,'Early Extension',faultSensitivity))
        faults.push({name:'Early Extension',severity:hx>st(0.06,'Early Extension',faultSensitivity)?'high':'medium',phase:'Downswing → Impact',desc:`Hips moved ${(hx*100).toFixed(1)}% toward ball.`,fix:'Drill: Glutes against wall through impact. Rotate, don\'t thrust.',frameIdx:ii,conf:faultConfidence(frames,[LH,TH],[ai,ii])});
    }
    if(addr&&impact){
      const sa=ang(addr.landmarks[LS],addr.landmarks[LH],addr.landmarks[LK]),si=ang(impact.landmarks[LS],impact.landmarks[LH],impact.landmarks[LK]),d=si-sa;
      if(d>st(10,'Posture',faultSensitivity))
        faults.push({name:'Loss of Posture',severity:d>st(18,'Posture',faultSensitivity)?'high':'medium',phase:'Downswing → Impact',desc:`Spine opened ${d.toFixed(0)}° from address.`,fix:'Drill: Chest stays over ball. Half swings maintaining bend.',frameIdx:ii,conf:faultConfidence(frames,[LS,LH,LK],[ai,ii])});
    }
    if(addr&&top){
      const hy=Math.min(top.landmarks[LW].y,top.landmarks[TW].y),sy=(top.landmarks[LS].y+top.landmarks[TS].y)/2;
      if(hy>sy+st(0.02,'Flat Backswing',faultSensitivity))
        faults.push({name:'Flat Backswing',severity:'medium',phase:'Backswing → Top',desc:'Hands below shoulder plane at top.',fix:'Drill: Hands away from body on takeaway. Butt of club points at ball line.',frameIdx:ti,conf:faultConfidence(frames,[LW,TW,LS,TS],[ti])});
    }
    if(top&&impact){
      const ei=phases.downswing.start+Math.floor((phases.downswing.end-phases.downswing.start)*0.25);
      if(ei<frames.length&&ei>phases.downswing.start){
        const ef=frames[ei],ht=(top.landmarks[LW].x+top.landmarks[TW].x)/2,he=(ef.landmarks[LW].x+ef.landmarks[TW].x)/2;
        if(Math.abs(he-ht)>st(0.04,'Over the Top',faultSensitivity))
          faults.push({name:'Over the Top',severity:'high',phase:'Downswing',desc:'Hands move outward early in downswing.',fix:'Drill: Trail elbow drops to hip pocket. Headcover outside ball.',frameIdx:ei,conf:faultConfidence(frames,[LW,TW],[ti,ei])});
      }
    }
    if(impact&&frames.length>phases.impactIdx+3){
      const pfi=Math.min(ii+3,frames.length-1),pi=frames[pfi],le=ang(pi.landmarks[LS],pi.landmarks[LE],pi.landmarks[LW]);
      if(le<st(140,'Chicken Wing',faultSensitivity))
        faults.push({name:'Chicken Wing',severity:le<st(120,'Chicken Wing',faultSensitivity)?'high':'medium',phase:'Post-Impact',desc:`Lead arm collapses to ${le.toFixed(0)}° after impact.`,fix:'Drill: Towel under lead armpit through follow-through.',frameIdx:pfi,conf:faultConfidence(frames,[LS,LE,LW],[pfi])});
    }
    if(addr&&impact){
      const hwI=(impact.landmarks[LW].x+impact.landmarks[TW].x)/2,hxI=(impact.landmarks[LH].x+impact.landmarks[TH].x)/2;
      if(hwI>hxI+st(0.04,'Shaft Lean',faultSensitivity))
        faults.push({name:'Shaft Lean at Impact',severity:hwI>hxI+st(0.07,'Shaft Lean',faultSensitivity)?'high':'medium',phase:'Impact',desc:'Hands ahead of ball at impact — insufficient lag.',fix:'Drill: Lag drills. Feel hands forward of hip line, not ball line.',frameIdx:ii,conf:faultConfidence(frames,[LW,TW,LH,TH],[ii])});
    }
    if(addr&&impact){
      const lkI=ang(impact.landmarks[LH],impact.landmarks[LK],impact.landmarks[LA]),lkA=ang(addr.landmarks[LH],addr.landmarks[LK],addr.landmarks[LA]),d=lkA-lkI;
      if(d>st(12,'Standing Up',faultSensitivity))
        faults.push({name:'Standing Up at Impact',severity:d>st(20,'Standing Up',faultSensitivity)?'high':'medium',phase:'Impact',desc:`Lead knee lost flex — standing up ${d.toFixed(0)}°.`,fix:'Drill: Feel quad compression at impact. Driver swing — maintain knee flex.',frameIdx:ii,conf:faultConfidence(frames,[LH,LK,LA],[ai,ii])});
    }
    if(phases.downswing.start<frames.length){
      const earlyDI=phases.downswing.start+Math.floor((phases.downswing.end-phases.downswing.start)*0.15);
      if(earlyDI<frames.length&&top){
        const hwT=(top.landmarks[LW].x+top.landmarks[TW].x)/2,hwD=frames[earlyDI]?(frames[earlyDI].landmarks[LW].x+frames[earlyDI].landmarks[TW].x)/2:hwT;
        if(hwD>hwT+st(0.03,'Takeaway Inside',faultSensitivity))
          faults.push({name:'Takeaway Inside',severity:'medium',phase:'Downswing Start',desc:'Hands pull inside too quickly — lack of depth.',fix:'Drill: Early sync. Hands drop straight down first frame of downswing.',frameIdx:earlyDI,conf:faultConfidence(frames,[LW,TW],[ti,earlyDI])});
      }
    }
    if(top){
      const lwLn=(top.landmarks[LW].x+top.landmarks[TW].x)/2-(top.landmarks[LH].x+top.landmarks[TH].x)/2;
      if(lwLn<st(-0.05,'Laid Off',faultSensitivity))
        faults.push({name:'Laid Off at Top',severity:'medium',phase:'Top',desc:'Club points left of target at top.',fix:'Drill: Club on plane. Match club shaft to forearm angle at top.',frameIdx:ti,conf:faultConfidence(frames,[LW,TW,LH,TH],[ti])});
    }
    if(top){
      const lwLn=(top.landmarks[LW].x+top.landmarks[TW].x)/2-(top.landmarks[LH].x+top.landmarks[TH].x)/2;
      if(lwLn>st(0.05,'Across the Line',faultSensitivity))
        faults.push({name:'Across the Line at Top',severity:'medium',phase:'Top',desc:'Club points right of target at top.',fix:'Drill: Club on plane. Parallel to target line at top, not across.',frameIdx:ti,conf:faultConfidence(frames,[LW,TW,LH,TH],[ti])});
    }
    if(addr&&impact){
      const nAddr=addr.landmarks[L.NOSE].x,nImp=impact.landmarks[L.NOSE].x,d=nImp-nAddr;
      if(d>st(0.04,'Head Forward',faultSensitivity))
        faults.push({name:'Head Movement Forward',severity:d>st(0.07,'Head Forward',faultSensitivity)?'high':'medium',phase:'Downswing → Impact',desc:`Head moved ${(d*100).toFixed(1)}% toward target — sliding.`,fix:'Drill: Stay behind ball. Feel head weight on back foot through impact.',frameIdx:ii,conf:faultConfidence(frames,[L.NOSE],[ai,ii])});
    }
    if(impact){
      const trH=impact.landmarks[L.RIGHT_HEEL],trA=impact.landmarks[L.RIGHT_ANKLE];
      const hx=Math.max(0,trH.y-trA.y);
      if(hx>st(0.02,'Trail Heel',faultSensitivity))
        faults.push({name:'Trail Heel Down at Impact',severity:hx>st(0.04,'Trail Heel',faultSensitivity)?'high':'medium',phase:'Impact',desc:'Trail heel still down — weight transfer incomplete.',fix:'Drill: Trail heel passes lead heel. Full rotation through impact.',frameIdx:ii,conf:faultConfidence(frames,[L.RIGHT_HEEL,L.RIGHT_ANKLE],[ii])});
    }
  }

  return faults;
}

export function computeMetrics(frames,phases){
  const m={};
  if(!phases||frames.length<5)return m;
  const bsF=phases.backswing.end-phases.backswing.start, dsF=phases.downswing.end-phases.downswing.start;
  if(dsF>0)m.tempo=(bsF/dsF).toFixed(1);
  if(phases.backswing.end<frames.length)m.bsTime=((frames[phases.backswing.end].time-frames[phases.backswing.start].time)*1000).toFixed(0);
  if(phases.downswing.end<frames.length)m.dsTime=((frames[phases.downswing.end].time-frames[phases.downswing.start].time)*1000).toFixed(0);
  m.total=((frames[phases.followThrough.end].time-frames[phases.address.start].time)*1000).toFixed(0);
  const tF=frames[phases.topIdx],aF=frames[phases.address.end];
  if(tF&&aF){
    const hw0=Math.abs(aF.landmarks[L.LEFT_HIP].x-aF.landmarks[L.RIGHT_HIP].x),hw1=Math.abs(tF.landmarks[L.LEFT_HIP].x-tF.landmarks[L.RIGHT_HIP].x);
    if(hw0>0.01)m.hipRot=(Math.acos(Math.min(1,hw1/hw0))*180/Math.PI).toFixed(0);
    const sw0=Math.abs(aF.landmarks[L.LEFT_SHOULDER].x-aF.landmarks[L.RIGHT_SHOULDER].x),sw1=Math.abs(tF.landmarks[L.LEFT_SHOULDER].x-tF.landmarks[L.RIGHT_SHOULDER].x);
    if(sw0>0.01)m.shRot=(Math.acos(Math.min(1,sw1/sw0))*180/Math.PI).toFixed(0);
  }
  return m;
}

export function gradeLimbs(fd,phase,analysisResult,allFrameData,detectedView,handedness){
  const g={};
  if(!analysisResult?.phases)return g;
  const lm=fd.landmarks;
  const addrF=allFrameData[analysisResult.phases.address.end];
  if(!addrF)return g;
  const al=addrF.landmarks;
  const LS=LEAD_SHOULDER(handedness),TS=TRAIL_SHOULDER(handedness),LE=LEAD_ELBOW(handedness),TE=TRAIL_ELBOW(handedness),LW=LEAD_WRIST(handedness),TW=TRAIL_WRIST(handedness);
  const LH=LEAD_HIP(handedness),TH=TRAIL_HIP(handedness),LK=LEAD_KNEE(handedness),TK=TRAIL_KNEE(handedness),LA=LEAD_ANKLE(handedness),TA=TRAIL_ANKLE(handedness);

  function assess(v,lo,hi,m){if(v>=lo&&v<=hi)return'good';if(v>=lo-m&&v<=hi+m)return'warn';return'bad'}

  const le=ang(lm[LS],lm[LE],lm[LW]);
  const te=ang(lm[TS],lm[TE],lm[TW]);
  const sp=ang(lm[LS],lm[LH],lm[LK]);
  const asp=ang(al[LS],al[LH],al[LK]);
  const sd=Math.abs(sp-asp);
  const tk=ang(lm[TH],lm[TK],lm[TA]);
  const atk=ang(al[TH],al[TK],al[TA]);
  const kd=tk-atk;

  const laSeg1=LS+'-'+LE, laSeg2=LE+'-'+LW, taSeg1=TS+'-'+TE, taSeg2=TE+'-'+TW;

  if(phase==='address'){const v=assess(le,155,180,10);g[laSeg1]=v;g[laSeg2]=v}
  else if(phase==='backswing'||phase==='top'){const v=assess(le,155,180,15);g[laSeg1]=v;g[laSeg2]=v}
  else if(phase==='impact'){const v=assess(le,160,180,10);g[laSeg1]=v;g[laSeg2]=v}
  else if(phase==='follow'){const v=assess(le,130,180,15);g[laSeg1]=v;g[laSeg2]=v}
  else{const v=assess(le,150,180,15);g[laSeg1]=v;g[laSeg2]=v}

  if(phase==='top'){const v=assess(te,70,110,15);g[taSeg1]=v;g[taSeg2]=v}
  else if(phase==='impact'){const v=assess(te,130,180,15);g[taSeg1]=v;g[taSeg2]=v}
  else{g[taSeg1]='good';g[taSeg2]='good'}

  const spSeg1=LS+'-'+LH, spSeg2=TS+'-'+TH;
  if(phase==='address'){const v=assess(sp,130,170,10);g[spSeg1]=v;g[spSeg2]=v}
  else if(phase==='follow'){g[spSeg1]='good';g[spSeg2]='good'}
  else{const v=sd<10?'good':sd<18?'warn':'bad';g[spSeg1]=v;g[spSeg2]=v}

  const hipSeg=LH+'-'+TH;
  if(detectedView==='face-on'&&(phase==='backswing'||phase==='top'||phase==='downswing')){
    const hc=mid(lm[LH],lm[TH]),ahc=mid(al[LH],al[TH]),hs=Math.abs(hc.x-ahc.x);
    g[hipSeg]=hs<0.04?'good':hs<0.07?'warn':'bad';
  } else if(detectedView==='dtl'&&(phase==='downswing'||phase==='impact')){
    const hx=(lm[LH].x+lm[TH].x)/2-(al[LH].x+al[TH].x)/2;
    g[hipSeg]=hx<0.025?'good':hx<0.05?'warn':'bad';
  } else g[hipSeg]='good';

  const shSeg=LS+'-'+TS;g[shSeg]='good';
  if(detectedView==='face-on'&&(phase==='backswing'||phase==='top')){
    const hs=Math.abs(lm[L.NOSE].x-al[L.NOSE].x);if(hs>0.08)g[shSeg]=hs>0.1?'bad':'warn';
  }

  const tlSeg1=TH+'-'+TK, tlSeg2=TK+'-'+TA;
  if(phase==='backswing'||phase==='top'){const v=kd<10?'good':kd<18?'warn':'bad';g[tlSeg1]=v;g[tlSeg2]=v}
  else{g[tlSeg1]='good';g[tlSeg2]='good'}

  const llSeg1=LH+'-'+LK, llSeg2=LK+'-'+LA;
  if(phase==='impact'||phase==='follow'){const lkA=ang(lm[LH],lm[LK],lm[LA]);const v=assess(lkA,150,180,10);g[llSeg1]=v;g[llSeg2]=v}
  else{g[llSeg1]='good';g[llSeg2]='good'}

  g['27-29']='good';g['28-30']='good';g['29-31']='good';g['30-32']='good';
  return g;
}

export function calcGolferBounds(allFrameData, handedness){
  if(!allFrameData||allFrameData.length===0)return null;
  let minX=1,maxX=0,minY=1,maxY=0;
  for(const fd of allFrameData){
    for(const lm of fd.landmarks){
      if(lm.visibility>0.3){
        minX=Math.min(minX,lm.x);
        maxX=Math.max(maxX,lm.x);
        minY=Math.min(minY,lm.y);
        maxY=Math.max(maxY,lm.y);
      }
    }
  }
  const padX=0.30, padY=0.20;
  minX=Math.max(0,minX-padX);
  maxX=Math.min(1,maxX+padX);
  minY=Math.max(0,minY-padY);
  maxY=Math.min(1,maxY+padY);
  // Extra padding on club side
  const extraPad=0.40;
  if(handedness==='right'){
    maxX=Math.min(1,maxX+extraPad);
  } else {
    minX=Math.max(0,minX-extraPad);
  }
  return {minX,maxX,minY,maxY};
}

export function getIdealPoseKeyframes(analysisResult,allFrameData,detectedView,handedness){
  if(!analysisResult?.phases||!allFrameData.length)return null;
  const addrF=allFrameData[analysisResult.phases.address.end];
  if(!addrF)return null;
  const a=addrF.landmarks;
  const shCx=(a[L.LEFT_SHOULDER].x+a[L.RIGHT_SHOULDER].x)/2,shCy=(a[L.LEFT_SHOULDER].y+a[L.RIGHT_SHOULDER].y)/2;
  const hipCx=(a[L.LEFT_HIP].x+a[L.RIGHT_HIP].x)/2,hipCy=(a[L.LEFT_HIP].y+a[L.RIGHT_HIP].y)/2;
  const shW=Math.abs(a[L.LEFT_SHOULDER].x-a[L.RIGHT_SHOULDER].x),hipW=Math.abs(a[L.LEFT_HIP].x-a[L.RIGHT_HIP].x),torso=Math.abs(shCy-hipCy);
  const clone=()=>a.map(p=>({x:p.x,y:p.y,z:p.z,visibility:p.visibility}));

  function setSh(p,rot,tilt,sx){const nf=1-rot*0.55,hw=shW*nf/2;p[L.LEFT_SHOULDER].x=shCx-hw+(sx||0);p[L.RIGHT_SHOULDER].x=shCx+hw+(sx||0);p[L.LEFT_SHOULDER].y=shCy+(tilt||0);p[L.RIGHT_SHOULDER].y=shCy-(tilt||0)}
  function setHp(p,rot,sx,sy){const nf=1-rot*0.35,hw=hipW*nf/2;p[L.LEFT_HIP].x=hipCx-hw+(sx||0);p[L.RIGHT_HIP].x=hipCx+hw+(sx||0);p[L.LEFT_HIP].y=hipCy+(sy||0);p[L.RIGHT_HIP].y=hipCy+(sy||0)}

  if(detectedView==='face-on'){
    const kfs=[];
    const k0=clone();kfs.push({t:0,pose:k0,label:'Address'});
    const k1=clone();setSh(k1,0.45,torso*0.025,shW*0.01);setHp(k1,0.15,hipW*0.01,0);k1[L.LEFT_WRIST].x=shCx+shW*0.35;k1[L.LEFT_WRIST].y=shCy-torso*0.45;k1[L.LEFT_ELBOW].x=shCx+shW*0.05;k1[L.LEFT_ELBOW].y=shCy-torso*0.35;k1[L.RIGHT_ELBOW].x=shCx+shW*0.25;k1[L.RIGHT_ELBOW].y=shCy-torso*0.2;k1[L.RIGHT_WRIST].x=shCx+shW*0.3;k1[L.RIGHT_WRIST].y=shCy-torso*0.38;kfs.push({t:0.18,pose:k1,label:'Halfway'});
    const k2=clone();setSh(k2,0.85,torso*0.04,shW*0.02);setHp(k2,0.35,hipW*0.015,0);k2[L.LEFT_WRIST].x=shCx+shW*0.28;k2[L.LEFT_WRIST].y=shCy-torso*0.7;k2[L.LEFT_ELBOW].x=shCx+shW*0.15;k2[L.LEFT_ELBOW].y=shCy-torso*0.55;k2[L.RIGHT_ELBOW].x=shCx+shW*0.2;k2[L.RIGHT_ELBOW].y=shCy-torso*0.15;k2[L.RIGHT_WRIST].x=shCx+shW*0.22;k2[L.RIGHT_WRIST].y=shCy-torso*0.62;kfs.push({t:0.33,pose:k2,label:'Top'});
    const k3=clone();setSh(k3,0.35,torso*0.015,-shW*0.01);setHp(k3,0.1,-hipW*0.04,0);k3[L.LEFT_WRIST].x=shCx-shW*0.05;k3[L.LEFT_WRIST].y=shCy+torso*0.1;k3[L.LEFT_ELBOW].x=shCx-shW*0.1;k3[L.LEFT_ELBOW].y=shCy-torso*0.05;k3[L.RIGHT_ELBOW].x=hipCx+hipW*0.15;k3[L.RIGHT_ELBOW].y=hipCy-torso*0.12;k3[L.RIGHT_WRIST].x=shCx;k3[L.RIGHT_WRIST].y=shCy+torso*0.05;kfs.push({t:0.48,pose:k3,label:'Down'});
    const bx=shCx-shW*0.15,by=hipCy+torso*0.25;const k4=clone();setSh(k4,0.05,-torso*0.01,-shW*0.03);setHp(k4,0.35,-hipW*0.07,0);k4[L.LEFT_WRIST].x=bx;k4[L.LEFT_WRIST].y=by;k4[L.LEFT_ELBOW].x=(k4[L.LEFT_SHOULDER].x+bx)/2;k4[L.LEFT_ELBOW].y=(k4[L.LEFT_SHOULDER].y+by)/2;k4[L.RIGHT_WRIST].x=bx+shW*0.04;k4[L.RIGHT_WRIST].y=by;k4[L.RIGHT_ELBOW].x=k4[L.RIGHT_SHOULDER].x-shW*0.08;k4[L.RIGHT_ELBOW].y=(k4[L.RIGHT_SHOULDER].y+by)/2;k4[L.LEFT_KNEE].y=(k4[L.LEFT_HIP].y+a[L.LEFT_ANKLE].y)/2-torso*0.025;k4[L.RIGHT_ANKLE].y=a[L.RIGHT_ANKLE].y;k4[L.RIGHT_HEEL]={...a[L.RIGHT_HEEL],x:a[L.RIGHT_HEEL].x+hipW*0.02,y:a[L.RIGHT_HEEL].y-torso*0.03};kfs.push({t:0.56,pose:k4,label:'Impact'});
    const k5=clone();setSh(k5,0.85,-torso*0.035,-shW*0.1);setHp(k5,0.85,-hipW*0.1,torso*0.01);k5[L.LEFT_WRIST].x=shCx+shW*0.05;k5[L.LEFT_WRIST].y=shCy-torso*0.55;k5[L.LEFT_ELBOW].x=shCx-shW*0.15;k5[L.LEFT_ELBOW].y=shCy-torso*0.5;k5[L.RIGHT_ELBOW].x=shCx;k5[L.RIGHT_ELBOW].y=shCy-torso*0.35;k5[L.RIGHT_WRIST].x=shCx+shW*0.1;k5[L.RIGHT_WRIST].y=shCy-torso*0.5;k5[L.LEFT_KNEE].y=(k5[L.LEFT_HIP].y+a[L.LEFT_ANKLE].y)/2-torso*0.06;k5[L.RIGHT_ANKLE].y=a[L.RIGHT_ANKLE].y-torso*0.25;kfs.push({t:1,pose:k5,label:'Finish'});
    return kfs;
  } else {
    const kfs=[];
    const k0=clone();kfs.push({t:0,pose:k0,label:'Address'});
    const k1=clone();k1[L.LEFT_WRIST].y=shCy-torso*0.5;k1[L.LEFT_WRIST].x=shCx+shW*0.05;k1[L.LEFT_ELBOW].x=a[L.LEFT_SHOULDER].x+shW*0.02;k1[L.LEFT_ELBOW].y=shCy-torso*0.3;k1[L.RIGHT_ELBOW].x=a[L.RIGHT_SHOULDER].x+shW*0.08;k1[L.RIGHT_ELBOW].y=a[L.RIGHT_ELBOW].y-torso*0.15;k1[L.RIGHT_WRIST].x=shCx+shW*0.06;k1[L.RIGHT_WRIST].y=shCy-torso*0.42;kfs.push({t:0.18,pose:k1,label:'Halfway'});
    const k2=clone();k2[L.LEFT_WRIST].y=shCy-torso*0.8;k2[L.LEFT_WRIST].x=shCx+shW*0.02;k2[L.LEFT_ELBOW].y=(a[L.LEFT_SHOULDER].y+shCy-torso*0.8)/2;k2[L.LEFT_ELBOW].x=a[L.LEFT_SHOULDER].x+shW*0.05;k2[L.RIGHT_ELBOW].x=a[L.RIGHT_SHOULDER].x+shW*0.12;k2[L.RIGHT_ELBOW].y=shCy-torso*0.2;k2[L.RIGHT_WRIST].y=shCy-torso*0.7;k2[L.RIGHT_WRIST].x=shCx+shW*0.05;k2[L.LEFT_SHOULDER].x+=shW*0.03;k2[L.RIGHT_SHOULDER].x+=shW*0.03;kfs.push({t:0.33,pose:k2,label:'Top'});
    const k3=clone();k3[L.LEFT_WRIST].y=shCy;k3[L.LEFT_WRIST].x=shCx-shW*0.1;k3[L.LEFT_ELBOW].y=(a[L.LEFT_SHOULDER].y+shCy)/2;k3[L.LEFT_ELBOW].x=a[L.LEFT_SHOULDER].x;kfs.push({t:0.48,pose:k3,label:'Down'});
    const k4=clone();k4[L.LEFT_WRIST].y=a[L.LEFT_WRIST].y;k4[L.LEFT_WRIST].x=a[L.LEFT_WRIST].x;k4[L.LEFT_ELBOW].y=(a[L.LEFT_SHOULDER].y+a[L.LEFT_WRIST].y)/2;k4[L.LEFT_HIP].x-=hipW*0.02;k4[L.RIGHT_HIP].x-=hipW*0.02;kfs.push({t:0.56,pose:k4,label:'Impact'});
    const k5=clone();k5[L.LEFT_WRIST].y=shCy-torso*0.5;k5[L.LEFT_WRIST].x=shCx+shW*0.08;k5[L.LEFT_ELBOW].y=shCy-torso*0.45;k5[L.LEFT_ELBOW].x=a[L.LEFT_SHOULDER].x+shW*0.1;k5[L.LEFT_SHOULDER].x-=shW*0.07;k5[L.RIGHT_SHOULDER].x-=shW*0.07;k5[L.RIGHT_ANKLE].y=a[L.RIGHT_ANKLE].y-torso*0.28;kfs.push({t:1,pose:k5,label:'Finish'});
    return kfs;
  }
}

export function interpKF(kfs,t){
  if(!kfs||kfs.length<2)return kfs?.[0]?.pose||null;
  t=Math.max(0,Math.min(1,t));
  let a=kfs[0],b=kfs[kfs.length-1];
  for(let i=0;i<kfs.length-1;i++){
    if(t>=kfs[i].t&&t<=kfs[i+1].t){a=kfs[i];b=kfs[i+1];break;}
  }
  const r=b.t-a.t,f=r>0?(t-a.t)/r:0,e=f<0.5?2*f*f:1-Math.pow(-2*f+2,2)/2;
  return a.pose.map((p,i)=>({x:p.x+(b.pose[i].x-p.x)*e,y:p.y+(b.pose[i].y-p.y)*e,z:p.z,visibility:p.visibility}));
}

export function getIdealPose(analysisResult,allFrameData,detectedView,phase,handedness){
  const kfs=getIdealPoseKeyframes(analysisResult,allFrameData,detectedView,handedness);
  if(!kfs)return null;
  const pm={address:0,backswing:0.18,top:0.33,downswing:0.48,impact:0.56,follow:0.90};
  return interpKF(kfs,pm[phase]??0);
}

export function getDrillDef(name){
  const defs={
    'Excessive Head Movement':{type:'vline',desc:'Head center — stay in this zone',get:(al,lm,w,h)=>({x:al[L.NOSE].x*w,col:'rgba(96,165,250,0.4)',zw:0.03*w,lbl:'HEAD'})},
    'Hip Slide':{type:'vzone',desc:'Hip zone — rotate, don\'t slide',get:(al,lm,w,h)=>{const hx=(al[L.LEFT_HIP].x+al[L.RIGHT_HIP].x)/2*w,hy=(al[L.LEFT_HIP].y+al[L.RIGHT_HIP].y)/2*h;return{x:hx,y:hy-0.05*h,w:0.06*w,h:0.12*h,col:'rgba(251,191,36,0.15)',bc:'rgba(251,191,36,0.5)',lbl:'HIP ZONE'}}},
    'Early Extension':{type:'vline',desc:'Hip limit — don\'t cross forward',get:(al,lm,w,h)=>({x:(al[L.LEFT_HIP].x+al[L.RIGHT_HIP].x)/2*w,col:'rgba(248,113,113,0.4)',zw:0.025*w,lbl:'HIP LIMIT'})},
    'Bent Lead Arm':{type:'eline',desc:'Extend to here at top',get:(al,lm,w,h)=>{const s={x:lm[L.LEFT_SHOULDER].x*w,y:lm[L.LEFT_SHOULDER].y*h},e={x:lm[L.LEFT_ELBOW].x*w,y:lm[L.LEFT_ELBOW].y*h},dx=e.x-s.x,dy=e.y-s.y,l=Math.hypot(dx,dy);return{x1:s.x,y1:s.y,x2:s.x+(dx/l)*l*1.8,y2:s.y+(dy/l)*l*1.8,col:'rgba(96,165,250,0.4)',lbl:'EXTEND'}}},
    'Loss of Posture':{type:'eline',desc:'Maintain this spine angle',get:(al,lm,w,h)=>{const s={x:al[L.LEFT_SHOULDER].x*w,y:al[L.LEFT_SHOULDER].y*h},hp={x:al[L.LEFT_HIP].x*w,y:al[L.LEFT_HIP].y*h},dx=s.x-hp.x,dy=s.y-hp.y,l=Math.hypot(dx,dy);return{x1:hp.x,y1:hp.y,x2:hp.x+(dx/l)*l*1.4,y2:hp.y+(dy/l)*l*1.4,col:'rgba(96,165,250,0.4)',lbl:'SPINE'}}},
    'Over the Top':{type:'slot',desc:'Hands should drop inside this channel',get:(al,lm,w,h)=>{const hp={x:(al[L.LEFT_HIP].x+al[L.RIGHT_HIP].x)/2*w,y:(al[L.LEFT_HIP].y+al[L.RIGHT_HIP].y)/2*h},sh={x:(al[L.LEFT_SHOULDER].x+al[L.RIGHT_SHOULDER].x)/2*w,y:(al[L.LEFT_SHOULDER].y+al[L.RIGHT_SHOULDER].y)/2*h};return{x1:hp.x+0.02*w,y1:hp.y,x2:sh.x-0.02*w,y2:sh.y-0.08*h,sw:0.05*w,col:'rgba(74,222,128,0.15)',bc:'rgba(74,222,128,0.4)',lbl:'SLOT'}}}
  };
  return defs[name]||null;
}
