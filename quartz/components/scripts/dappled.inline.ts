(function(){var Be=`
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`,Re=`#extension GL_OES_standard_derivatives : enable
  precision highp float;
  #define MAXSEG 1024         // loop ceiling; actual count is uSegCount
  uniform sampler2D uSegTex; // L-system segments packed as RGBA8 (16-bit), 3 texels/seg
  uniform float uPosScale;   // decode: pos = raw * uPosScale - 1.0
  uniform float uWidScale;   // decode: width = raw * uWidScale
  uniform int uSegCount;     // number of live segments
  uniform vec2 uLeafGrad;    // canopy gradient dir in uv space (toward the origin sides)
  uniform float uLeafFall;   // ramp strength of leaf cover along the gradient
  uniform float uLeafFollow; // 0 = uniform leaf depth, 1 = leaf depth tracks branches
  uniform float uTrunkCount; // 0, 1, or 2 decorative trunks
  uniform vec2 uTrunkX;      // their x positions (uv space)
  uniform float uTrunkW;     // trunk half-width (uv space), seeded thin
  uniform float uTime;       // real seconds (slow canopy drift)
  uniform vec2 uDisp[4];     // per-layer cumulative sway displacement
  uniform vec2 uResolution;
  uniform vec3 uColorA;      // lit wall
  uniform vec3 uColorMid;    // glow (transition zones)
  uniform vec3 uColorB;      // shadow
  uniform float uContrast;
  uniform float uCenter;
  uniform float uGoldLo;
  uniform float uGoldHi;
  uniform float uCanopy;
  uniform vec4 uLayerOn;     // per-layer enable
  uniform vec4 uBlur;        // per-layer blur (distance): 0 sharp+dark -> 1 soft+faint
  uniform float uDither;     // 1 dithered, 0 hard
  uniform vec2 uSeed;        // random per-load offset into the noise field
  uniform float uParallax;   // -1..1 (mouse x / device tilt); shifts layers by depth
  uniform vec3 uFloor;       // per-layer floor top range (trunk, thick, thin); floor = blur^2 * top
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.55;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.02 + 7.0; a *= 0.5; }
    return v;
  }
  // ridged noise -> thin filament ridges (branch-like)
  float ridged(vec2 p){ return 1.0 - abs(2.0 * noise(p) - 1.0); }
  float ridgedFbm(vec2 p){
    float v = 0.0, a = 0.6;
    for (int i = 0; i < 4; i++) { v += a * ridged(p); a *= 0.5; p = p * 1.97 + 3.3; }
    return v;
  }
  // unpack a 16-bit value stored across two RGBA8 channels ([0,1] each)
  float dec16(vec2 c){ return (c.x * 255.0 * 256.0 + c.y * 255.0) / 65535.0; }
  // shadow from the L-system branch segments (grown CPU-side, packed into a texture;
  // segments are tapered capsules in buv space, x: 0..aspect, y: 0..1). we also grab
  // the local limb radius at the nearest point so thin limbs dither.
  // returns (signed distance to nearest limb surface, that limb's depth). shared
  // by the branch shadow and the leaf layer so we only walk the segments once.
  vec2 branchField(vec2 buv){
    buv.x += uParallax * 0.04;
    buv += uDisp[1] * 0.5; // wind sway
    float d = 1e9;
    float nearDepth = 0.0;
    float rowScale = 1.0 / float(MAXSEG);
    for (int i = 0; i < MAXSEG; i++){
      if (i >= uSegCount) break;
      float row = (float(i) + 0.5) * rowScale;
      vec4 t0 = texture2D(uSegTex, vec2(0.5 / 4.0, row)); // x0,y0
      vec4 t1 = texture2D(uSegTex, vec2(1.5 / 4.0, row)); // x1,y1
      vec4 t2 = texture2D(uSegTex, vec2(2.5 / 4.0, row)); // w0,w1
      vec2 a = vec2(dec16(t0.rg), dec16(t0.ba)) * uPosScale - 1.0;
      vec2 bb = vec2(dec16(t1.rg), dec16(t1.ba)) * uPosScale - 1.0;
      vec2 pa = buv - a, ba = bb - a;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
      float r = mix(dec16(t2.rg), dec16(t2.ba), h) * uWidScale;
      float dist = length(pa - ba * h) - r;
      if (dist < d) {
        d = dist;
        nearDepth = dec16(texture2D(uSegTex, vec2(3.5 / 4.0, row)).rg);
      }
    }
    return vec2(d, nearDepth);
  }
  // penumbra: the shadow darkens across a band whose half-width grows with the
  // caster's distance (depth). a thick limb is wider than the band, so its core
  // reaches full umbra while the edges lighten; a thin twig is narrower than the
  // band, so its penumbras overlap and it never fully darkens (dithers on its own).
  float branchShadow(float d, float nearDepth){
    float pen = 0.006 + nearDepth * 0.06;
    float shadow = 1.0 - smoothstep(-pen, pen, d); // 1 deep inside -> 0 outside
    float umbra = mix(0.03, 0.34, nearDepth); // far limbs' deepest shadow is fainter
    return mix(1.0, umbra, shadow);
  }
  // foliage: blobby noise. blur -> softer penumbra + fainter shadow. cover (0..1)
  // biases density: high near the scene's canopy origin, sparse in the open area.
  float leafLayer(vec2 buv, float scale, vec2 disp, float b, vec2 seed, float cover){
    buv.x += uParallax * (0.15 + b) * 0.1; // depth-based parallax (far layers shift more)
    vec2 p = buv * scale + disp + seed;
    float soft = 0.05 + b * 0.30;
    float floorT = b * 0.38;
    float thr = mix(0.85, 0.48, cover); // low cover -> high threshold -> few leaves
    float s = smoothstep(thr + soft, thr - soft, fbm(p));
    return mix(1.0, floorT, s);
  }
  // branches: domain-warped, anisotropic ridged noise read as wandering limbs.
  // higher thick -> thinner branches; blur -> softer + fainter shadow.
  float branchLayer(vec2 buv, float scale, vec2 disp, float thick, float b, vec2 seed, float topRange){
    buv.x += uParallax * (0.15 + b) * 0.1; // depth-based parallax
    vec2 p = buv * scale + disp + seed;
    p += (vec2(noise(p * 0.5 + 2.1), noise(p * 0.5 + 8.7)) - 0.5) * 0.8; // gentle wander, not swirly ribbons
    mat2 R = mat2(0.86, -0.51, 0.51, 0.86);
    float r = ridgedFbm(R * p * vec2(1.0, 0.35)); // anisotropy = longer, connected limbs
    float soft = 0.03 + b * 0.22;
    float s = smoothstep(thick, thick + soft, r); // 1 on the ridge (wood)
    float floorT = b * b * topRange; // shadow fades with distance^2 toward topRange
    return mix(1.0, floorT, s);
  }
  // decorative thick trunk(s): 0-2 near-vertical solid bands. count and x-positions
  // are decided CPU-side (uTrunkCount, uTrunkX) so they're rare and sit near the
  // scene's focus column. fixed-width, so they can't blow up into a slab. uv-space.
  float trunkLayer(vec2 uv, float thick, float b, float topRange){
    if (uTrunkCount < 0.5) return 1.0; // no trunk this scene
    float lean = (noise(vec2(uTrunkX.x * 41.0, uv.y * 0.6)) - 0.5) * 0.06; // gentle wobble
    float x = uv.x + lean + uParallax * 0.015;
    float halfw = uTrunkW; // seeded width (CPU-side, biased thin)
    float d = abs(x - uTrunkX.x);
    if (uTrunkCount > 1.5) d = min(d, abs(x - uTrunkX.y));
    float s = 1.0 - smoothstep(halfw, halfw + 0.02 + b * 0.1, d);
    float floorT = b * b * topRange;
    return mix(1.0, floorT, s);
  }
  float bayer4(vec2 c){
    int x = int(mod(c.x, 4.0));
    int y = int(mod(c.y, 4.0));
    int i = x + y * 4;
    float t = 5.0;
    if (i==0) t=0.0; else if (i==1) t=8.0; else if (i==2) t=2.0; else if (i==3) t=10.0;
    else if (i==4) t=12.0; else if (i==5) t=4.0; else if (i==6) t=14.0; else if (i==7) t=6.0;
    else if (i==8) t=3.0; else if (i==9) t=11.0; else if (i==10) t=1.0; else if (i==11) t=9.0;
    else if (i==12) t=15.0; else if (i==13) t=7.0; else if (i==14) t=13.0;
    return (t + 0.5) / 16.0;
  }

  void main(){
    vec2 uv = vUv;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 buv = vec2(uv.x * aspect, uv.y);
    float t = uTime;

    // walk the L-system segments once; reuse the field for branches AND leaves
    vec2 bf = branchField(buv); // (signed dist, depth) of the nearest limb
    // rare decorative thick trunk(s), count/positions decided CPU-side
    float l0 = mix(1.0, trunkLayer(uv, 0.45, uBlur.x, uFloor.x), uLayerOn.x);
    float l1 = mix(1.0, branchShadow(bf.x, bf.y), uLayerOn.y);
    float l2 = 1.0;
    // leaf cover ramps along the scene gradient: dense on the branch-origin side(s),
    // sparse on the open side (uv-0.5 projected onto the gradient direction)
    float leafCover = clamp(0.55 + dot(uLeafGrad, uv - 0.5) * uLeafFall, 0.12, 1.0);
    // leaf depth follows the nearby branch (sitting just beyond the twigs) so foliage
    // softens/fades with the limbs it hangs from instead of being one flat plane
    float leafDepth = mix(uBlur.w, clamp(bf.y + 0.2, 0.0, 1.0), uLeafFollow);
    float l3 = mix(1.0, leafLayer(buv, 11.0, uDisp[3], leafDepth, uSeed + vec2(13.0, 89.0), leafCover), uLayerOn.w);

    float canopy = smoothstep(0.3, 0.7, fbm(buv * 0.4 + vec2(t * 0.01, 19.0) + uSeed + vec2(101.0, 57.0)));
    // multiplicative so opaque wood stays opaque (additive bias was lifting the
    // trunk into the dithered mid-tones); only modulates light that gets through
    float modulate = 1.0 + (canopy - 0.5) * uCanopy + (1.0 - uv.y) * 0.10 - uv.x * 0.05;

    float light = pow(l0 * l1 * l2 * l3, 0.6) * 1.3 * modulate;
    light = clamp((light - 0.5) * uContrast + uCenter, 0.0, 1.0);

    // 2-tone ordered dither; gold only where tone is mid AND it's an actual
    // light/dark edge (the penumbra rim), not flat interiors.
    float bayer = uDither > 0.5 ? bayer4(gl_FragCoord.xy) : 0.5;
    float bayerG = uDither > 0.5 ? bayer4(gl_FragCoord.xy + vec2(2.0, 1.0)) : 0.5;
    float lit = step(bayer, light);
    float goldMix = smoothstep(uGoldLo, uGoldHi, light) * smoothstep(0.015, 0.1, fwidth(light));
    float darkIsGold = step(bayerG, goldMix);
    vec3 dark = darkIsGold > 0.5 ? uColorMid : uColorB;
    vec3 col = lit > 0.5 ? uColorA : dark;
    gl_FragColor = vec4(col, 1.0);
  }
`;function We(te){let le=te.trim().replace("#","");le.length===3&&(le=le[0]+le[0]+le[1]+le[1]+le[2]+le[2]);let C=parseInt(le.slice(0,6),16);return[(C>>16&255)/255,(C>>8&255)/255,(C&255)/255]}function xe(te){let le=getComputedStyle(document.documentElement).getPropertyValue(te);return le&&le.trim().startsWith("#")?We(le):[0,0,0]}function Me(te,le){let C=parseFloat(getComputedStyle(document.documentElement).getPropertyValue(te));return isNaN(C)?le:C}function $(te){return xe(te).map(le=>Math.round(le*255)).join(",")}function Ce(te){let le=getComputedStyle(te),C=parseFloat(le.paddingLeft)+parseFloat(le.paddingRight),M=parseFloat(le.paddingTop)+parseFloat(le.paddingBottom);return[Math.max(1,te.clientWidth-C),Math.max(1,te.clientHeight-M)]}function Ze(te){console.log("[dappled] init called, container:", te, "size:", te.clientWidth, te.clientHeight);let le=document.createElement("canvas");le.className="dappled-canvas",le.style.border="1px solid red",te.appendChild(le);console.log("[dappled] canvas created:", le);let C=le.getContext("webgl",{antialias:!1,alpha:!1});if(!C){console.error("[dappled-light] no WebGL");return}C.getExtension("OES_standard_derivatives");let M=(L,K)=>{let F=C.createShader(L);return C.shaderSource(F,K),C.compileShader(F),C.getShaderParameter(F,C.COMPILE_STATUS)||console.error("[dappled-light] shader:",C.getShaderInfoLog(F)),F},ne=C.createProgram();C.attachShader(ne,M(C.VERTEX_SHADER,Be)),C.attachShader(ne,M(C.FRAGMENT_SHADER,Re)),C.linkProgram(ne),C.getProgramParameter(ne,C.LINK_STATUS)||console.error("[dappled-light] link:",C.getProgramInfoLog(ne)),C.useProgram(ne);let me=C.createBuffer();C.bindBuffer(C.ARRAY_BUFFER,me),C.bufferData(C.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),C.STATIC_DRAW);let pe=C.getAttribLocation(ne,"position");C.enableVertexAttribArray(pe),C.vertexAttribPointer(pe,2,C.FLOAT,!1,0,0);let Y=L=>C.getUniformLocation(ne,L),se={uTime:Y("uTime"),uDisp:Y("uDisp[0]"),uResolution:Y("uResolution"),uColorA:Y("uColorA"),uColorMid:Y("uColorMid"),uColorB:Y("uColorB"),uContrast:Y("uContrast"),uCenter:Y("uCenter"),uGoldLo:Y("uGoldLo"),uGoldHi:Y("uGoldHi"),uCanopy:Y("uCanopy"),uLayerOn:Y("uLayerOn"),uBlur:Y("uBlur"),uDither:Y("uDither"),uSeed:Y("uSeed"),uParallax:Y("uParallax"),uFloor:Y("uFloor"),uSegTex:Y("uSegTex"),uPosScale:Y("uPosScale"),uWidScale:Y("uWidScale"),uSegCount:Y("uSegCount"),uLeafGrad:Y("uLeafGrad"),uLeafFall:Y("uLeafFall"),uLeafFollow:Y("uLeafFollow"),uTrunkCount:Y("uTrunkCount"),uTrunkX:Y("uTrunkX"),uTrunkW:Y("uTrunkW")};C.uniform2f(se.uSeed,Math.random()*1e3,Math.random()*1e3);let z={contrast:1.6,center:Me("--komorebi-center",.38),goldLo:.45,goldHi:.7,canopy:1.2,dither:1,layerOn:[1,1,0,1],blur:[0,.12,.35,.45],floor:[.1,.4,.7],sensitivity:5,rest:.35,gustSpeed:1},D=1024,ke=4,De=.1,Ne=new Uint8Array(ke*D*4),et=0,Ae=12,Xe=0,ot=1,$e=0,vt=.5,lt=.5,ft=.018,xt=C.createTexture();C.bindTexture(C.TEXTURE_2D,xt),C.texParameteri(C.TEXTURE_2D,C.TEXTURE_MIN_FILTER,C.NEAREST),C.texParameteri(C.TEXTURE_2D,C.TEXTURE_MAG_FILTER,C.NEAREST),C.texParameteri(C.TEXTURE_2D,C.TEXTURE_WRAP_S,C.CLAMP_TO_EDGE),C.texParameteri(C.TEXTURE_2D,C.TEXTURE_WRAP_T,C.CLAMP_TO_EDGE);let Mt=Math.floor(Math.random()*1e9),R={sceneType:-1,trunkCount:-1,leafBias:1.4,leafFollow:.6,rootOffset:.9,nTrees:6,trunkWidth:.035,lenRatio:16,maxLen:.4,curl:.3,split3:.3,forkProb:.7,depthDrift:.4,leader:.618,golden:1,conserve:.95,endPx:.5},tt=L=>()=>{L|=0,L=L+1831565813|0;let K=Math.imul(L^L>>>15,1|L);return K=K+Math.imul(K^K>>>7,61|K)^K,((K^K>>>14)>>>0)/4294967296},He=()=>{let L=bt/Math.max(kt,1),K=kt,F=tt(Mt),Le=[],nt=R.endPx/(2*K),Fe=(Ie,Ue,Ve)=>Math.max(Ue,Math.min(Ve,Ie)),Pe=Math.PI*(3-Math.sqrt(5)),Lt=2/(1+Math.sqrt(5)),Je=(Ie,Ue)=>Math.min(.98,Math.max(.02,Ie+(F()-.5)*Ue)),it=(Ie,Ue,Ve,Ot,Ut,Bt,Vt)=>{if(Ot<nt||Le.length>=D)return;let er=Math.min(Ot*R.lenRatio,R.maxLen)*(.85+F()*.3),Jt=Ve+Ut+(F()-.5)*.05,tr=Ie+Math.cos(Jt)*er,zt=Ue+Math.sin(Jt)*er,yt=Ot*.97;Le.push([Ie,Ue,tr,zt,Ot,yt,Vt]);let Ge=yt*yt*R.conserve;if(F()>=R.forkProb){it(tr,zt,Jt,Math.sqrt(Ge),Ut,Bt+Pe,Je(Vt,R.depthDrift*.25));return}let a=F()<R.split3?3:2,u=Ge*(R.leader*(.92+F()*.16)),y=Math.sqrt(Math.min(Ge,u));it(tr,zt,Jt,y,Ut,Bt+Pe,Je(Vt,R.depthDrift*.25));let b=Math.max(0,Ge-y*y);for(let A=0;A<a-1;A++){let k=A===a-2?b:b*(.45+F()*.25);b-=k;let O=Math.sqrt(k);if(O<nt)continue;let T=Bt+(A+1)*Pe,N=R.golden*Math.cos(T)+(1-R.golden)*(F()-.5)*2>=0?1:-1,q=1-Math.min(1,O/Math.max(yt,1e-6)),Z=Jt+N*(.35+q*.55)+(F()-.5)*.15;it(tr,zt,Z,O,(F()-.5)*R.curl,T,Je(Vt,R.depthDrift))}},ut=[{edges:[2],fx:.33,top:!0,gx:0,gy:1},{edges:[2,0],fx:.33,top:!0,gx:-.7,gy:.7},{edges:[2,1],fx:.67,top:!0,gx:.7,gy:.7},{edges:[3,1],fx:.67,top:!1,gx:.7,gy:-.7},{edges:[3,0],fx:.33,top:!1,gx:-.7,gy:-.7}],gt=R.sceneType>=0?Math.min(4,Math.round(R.sceneType)):Math.floor(F()*ut.length),ht=ut[gt];Xe=ht.gx,ot=ht.gy;let mt=F();$e=R.trunkCount>=0?Math.round(R.trunkCount):mt<.4?0:mt<.8?1:2,vt=Fe(ht.fx+(F()-.5)*.25,.05,.95),lt=Fe(ht.fx+(F()-.5)*.5,.05,.95),ft=.008+F()*F()*.03;let Qt=R.rootOffset,ir=(Ie,Ue)=>{let Ve=.1+Ue*.45,Ot=Fe(ht.fx+(F()-.5)*Ve,.04,.96);if(Ie===2)return[Ot*L,1+Qt,-Math.PI/2+(F()-.5)*.6];if(Ie===3)return[Ot*L,-Qt,Math.PI/2+(F()-.5)*.6];let Ut=ht.top?.7:.3,Bt=Fe(Ut+(F()-.5)*Ve,.05,.95);return Ie===0?[-Qt,Bt,(F()-.5)*.6]:[L+Qt,Bt,Math.PI+(F()-.5)*.6]},Wt=Math.max(1,Math.round(R.nTrees));for(let Ie=0;Ie<Wt&&!(Le.length>=D);Ie++){let Ue=ht.edges[Ie%ht.edges.length],Ve=Wt>1?Ie/(Wt-1):0,Ot=Fe(.12+Ve*.4+(F()-.5)*.1,.04,.95),[Ut,Bt,Vt]=ir(Ue,Ve),er=R.trunkWidth*(1-Ve*.5)*(.9+F()*.2);it(Ut,Bt,Vt,er,(F()-.5)*R.curl,F()*Math.PI*2,Ot)}et=Math.min(Le.length,D),Ae=L+2;let Ht=(Ie,Ue)=>{let Ve=Math.max(0,Math.min(65535,Math.round(Ie*65535)));Ne[Ue]=Ve>>8&255,Ne[Ue+1]=Ve&255};Ne.fill(0);for(let Ie=0;Ie<et;Ie++){let Ue=Le[Ie],Ve=Ie*ke*4;Ht((Ue[0]+1)/Ae,Ve),Ht((Ue[1]+1)/Ae,Ve+2),Ht((Ue[2]+1)/Ae,Ve+4),Ht((Ue[3]+1)/Ae,Ve+6),Ht(Ue[4]/De,Ve+8),Ht(Ue[5]/De,Ve+10),Ht(Ue[6],Ve+12)}C.bindTexture(C.TEXTURE_2D,xt),C.texImage2D(C.TEXTURE_2D,0,C.RGBA,ke,D,0,C.RGBA,C.UNSIGNED_BYTE,Ne)},wt=xe("--komorebi-light"),Ke=xe("--komorebi-mid"),ze=xe("--komorebi-shadow"),Nt=$("--secondary"),Tt=window.matchMedia("(prefers-reduced-motion: reduce)").matches,dt=2,jt=600,St=180,bt=200,kt=60,Rt=()=>{[jt,St]=Ce(te),bt=Math.max(1,Math.round(jt/dt)),kt=Math.max(1,Math.round(St/dt)),le.width=bt,le.height=kt,le.style.width=jt+"px",le.style.height=St+"px",C.viewport(0,0,bt,kt),He()};Rt();let At=new ResizeObserver(()=>{Rt(),Tt&&qt()});At.observe(te);let v=()=>{wt=xe("--komorebi-light"),Ke=xe("--komorebi-mid"),ze=xe("--komorebi-shadow"),z.center=Me("--komorebi-center",.38),Nt=$("--secondary"),Tt&&qt()};document.addEventListener("themechange",v);let E=z.rest,j=z.rest,V=0,H=0,U=0,G=0,ye=0,ve=L=>{let K=L.timeStamp;if(ye){let F=K-ye;if(F>0){let Le=Math.hypot(L.clientX-U,L.clientY-G)/F;j=Math.min(1,Math.max(j,Le/z.sensitivity))}}U=L.clientX,G=L.clientY,ye=K,H=(L.clientX/window.innerWidth-.5)*2};window.addEventListener("pointermove",ve,{passive:!0});let _e=L=>{L.gamma!=null&&(H=Math.max(-1,Math.min(1,L.gamma/35)))};window.addEventListener("deviceorientation",_e);let rt=L=>.7+.3*(.65*Math.sin(L*.27*z.gustSpeed)+.35*Math.sin(L*.13*z.gustSpeed+2)),ue=[.97,.22],we=["trunk","branches","(unused)","leaves"],J=[0,.05,.1,.36],re=[0,.03,.08,.42],Ee=[0,.7,1.5,3.2],W=[0,1,2.4,3.9],Te=new Float32Array(8),je=document.createElement("div");je.className="dappled-debug",je.style.display="none";let st=(L,K,F)=>{let Le=document.createElement("div");Le.className="dappled-chart";let nt=document.createElement("span");Le.appendChild(nt);let Fe=document.createElement("canvas");Fe.width=206,Fe.height=30,Le.appendChild(Fe);let Pe=Fe.getContext("2d"),Lt=Fe.width,Je=new Float32Array(Lt),it=0;return{wrap:Le,update:ut=>{Je[it]=ut,it=(it+1)%Lt,nt.textContent=`${L}: ${ut.toFixed(F)}`,Pe.clearRect(0,0,Lt,Fe.height),Pe.beginPath();for(let gt=0;gt<Lt;gt++){let ht=Math.min(Je[(it+gt)%Lt],K),mt=Fe.height-1-ht/K*(Fe.height-2);gt===0?Pe.moveTo(gt,mt):Pe.lineTo(gt,mt)}Pe.strokeStyle=`rgb(${Nt})`,Pe.lineWidth=1,Pe.stroke()}}},Et=st("fps",80,0),ct=st("wind",1,2);je.appendChild(Et.wrap),je.appendChild(ct.wrap);let _t=L=>{let K=document.createElement("div");K.className="dappled-debug-h",K.textContent=L,je.appendChild(K)},he=(L,K,F,Le,nt,Fe)=>{let Pe=document.createElement("label"),Lt=document.createElement("span"),Je=document.createElement("input");Je.type="range",Je.min=String(K),Je.max=String(F),Je.step=String(Le),Je.value=String(nt());let it=()=>Lt.textContent=`${L}: ${(+Je.value).toFixed(2)}`;it(),Je.addEventListener("input",()=>{Fe(parseFloat(Je.value)),it()}),Pe.append(Lt,Je),je.appendChild(Pe)},Pt=(L,K,F)=>{let Le=document.createElement("label");Le.className="dappled-debug-toggle";let nt=document.createElement("input");nt.type="checkbox",nt.checked=K(),nt.addEventListener("change",()=>F(nt.checked));let Fe=document.createElement("span");Fe.textContent=L,Le.append(nt,Fe),je.appendChild(Le)},rr=(L,K)=>{let F=document.createElement("button");F.className="dappled-debug-btn",F.textContent=L,F.addEventListener("click",K),je.appendChild(F)},qe=()=>{He(),Tt&&qt()};_t("wind"),he("cursor sensitivity",1,15,.5,()=>z.sensitivity,L=>z.sensitivity=L),he("resting wind",0,1,.01,()=>z.rest,L=>z.rest=L),he("gust speed",.2,3,.05,()=>z.gustSpeed,L=>z.gustSpeed=L),_t("branches");for(let L=0;L<4;L++){let K=L;K!==2&&(Pt(we[K],()=>z.layerOn[K]>.5,F=>z.layerOn[K]=F?1:0),he(`${we[K]} blur`,0,1,.02,()=>z.blur[K],F=>z.blur[K]=F),K<3&&he(`${we[K]} floor max`,0,1,.02,()=>z.floor[K],F=>z.floor[K]=F),he(`${we[K]} bend`,0,.5,.005,()=>J[K],F=>J[K]=F),he(`${we[K]} flutter`,0,.5,.005,()=>re[K],F=>re[K]=F),he(`${we[K]} flutter spd`,0,5,.1,()=>Ee[K],F=>Ee[K]=F))}_t("tree (L-system)"),rr("reshuffle tree",()=>{Mt=Math.floor(Math.random()*1e9),qe()}),he("scene (-1=rand)",-1,4,1,()=>R.sceneType,L=>{R.sceneType=L,qe()}),he("root offset",0,1.6,.02,()=>R.rootOffset,L=>{R.rootOffset=L,qe()}),he("trunks (-1=rand)",-1,2,1,()=>R.trunkCount,L=>{R.trunkCount=L,qe()}),he("leaf bias",0,3,.05,()=>R.leafBias,L=>{R.leafBias=L}),he("leaf follows depth",0,1,.05,()=>R.leafFollow,L=>{R.leafFollow=L}),he("trees",1,12,1,()=>R.nTrees,L=>{R.nTrees=L,qe()}),he("trunk width",.02,.09,.002,()=>R.trunkWidth,L=>{R.trunkWidth=L,qe()}),he("len / width",4,28,.5,()=>R.lenRatio,L=>{R.lenRatio=L,qe()}),he("max seg len",.06,.7,.01,()=>R.maxLen,L=>{R.maxLen=L,qe()}),he("curl",0,.8,.02,()=>R.curl,L=>{R.curl=L,qe()}),he("P(3 split)",0,1,.05,()=>R.split3,L=>{R.split3=L,qe()}),he("fork prob",.3,1,.05,()=>R.forkProb,L=>{R.forkProb=L,qe()}),he("depth drift",0,.9,.05,()=>R.depthDrift,L=>{R.depthDrift=L,qe()}),he("leader share",.4,.95,.02,()=>R.leader,L=>{R.leader=L,qe()}),he("golden phyllotaxis",0,1,.05,()=>R.golden,L=>{R.golden=L,qe()}),he("width conserve",.7,1,.01,()=>R.conserve,L=>{R.conserve=L,qe()}),he("end thickness px",.5,3,.1,()=>R.endPx,L=>{R.endPx=L,qe()}),_t("tone & dither"),Pt("dither",()=>z.dither>.5,L=>z.dither=L?1:0),he("contrast",.5,3,.05,()=>z.contrast,L=>z.contrast=L),he("brightness",.1,.7,.01,()=>z.center,L=>z.center=L),he("gold start",0,.8,.01,()=>z.goldLo,L=>z.goldLo=L),he("gold end",.2,.95,.01,()=>z.goldHi,L=>z.goldHi=L),he("canopy",0,1.5,.05,()=>z.canopy,L=>z.canopy=L),document.body.appendChild(je);let Ft=["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight"],Ct=[],Dt=L=>{Ct.push(L.key),Ct.length>Ft.length&&(Ct=Ct.slice(-Ft.length)),Ct.length===Ft.length&&Ft.every((K,F)=>Ct[F]===K)&&(je.style.display=je.style.display==="none"?"block":"none",Ct=[])};document.addEventListener("keydown",Dt);let Gt=0,Xt=z.rest,qt=()=>{C.uniform1f(se.uTime,Gt),C.uniform2f(se.uResolution,bt,kt),C.uniform2fv(se.uDisp,Te),C.uniform3f(se.uColorA,wt[0],wt[1],wt[2]),C.uniform3f(se.uColorMid,Ke[0],Ke[1],Ke[2]),C.uniform3f(se.uColorB,ze[0],ze[1],ze[2]),C.uniform1f(se.uContrast,z.contrast),C.uniform1f(se.uCenter,z.center),C.uniform1f(se.uGoldLo,z.goldLo),C.uniform1f(se.uGoldHi,z.goldHi),C.uniform1f(se.uCanopy,z.canopy),C.uniform4f(se.uLayerOn,z.layerOn[0],z.layerOn[1],z.layerOn[2],z.layerOn[3]),C.uniform4f(se.uBlur,z.blur[0],z.blur[1],z.blur[2],z.blur[3]),C.uniform1f(se.uDither,z.dither),C.uniform1f(se.uParallax,V),C.uniform3f(se.uFloor,z.floor[0],z.floor[1],z.floor[2]),C.activeTexture(C.TEXTURE0),C.bindTexture(C.TEXTURE_2D,xt),C.uniform1i(se.uSegTex,0),C.uniform1f(se.uPosScale,Ae),C.uniform1f(se.uWidScale,De),C.uniform1i(se.uSegCount,et),C.uniform2f(se.uLeafGrad,Xe,ot),C.uniform1f(se.uLeafFall,R.leafBias),C.uniform1f(se.uLeafFollow,R.leafFollow),C.uniform1f(se.uTrunkCount,$e),C.uniform2f(se.uTrunkX,vt,lt),C.uniform1f(se.uTrunkW,ft),C.drawArrays(C.TRIANGLES,0,3)},pt=0,It=!0,Kt=0,Zt=0,$t=L=>{let K=Kt?Math.min(.05,(L-Kt)/1e3):.016;Kt=L,Gt+=K,j=Math.max(z.rest,j*.97),E+=(j-E)*(j>E?.02:.05),V+=(H-V)*.08,Xt=rt(Gt)*E;let F=0;for(let Le=0;Le<4;Le++)F+=Xt*(J[Le]+re[Le]*Math.sin(Gt*Ee[Le]+W[Le])),Te[2*Le]=ue[0]*F,Te[2*Le+1]=ue[1]*F;qt(),Zt+=((K>0?1/K:0)-Zt)*.1,je.style.display!=="none"&&(Et.update(Zt),ct.update(Xt)),It&&(pt=requestAnimationFrame($t))},nr=()=>{document.hidden?(It=!1,cancelAnimationFrame(pt)):Tt||(It=!0,Kt=0,pt=requestAnimationFrame($t))};Tt?qt():(pt=requestAnimationFrame($t),document.addEventListener("visibilitychange",nr)),window.addCleanup(()=>{It=!1,cancelAnimationFrame(pt),At.disconnect(),window.removeEventListener("pointermove",ve),window.removeEventListener("deviceorientation",_e),document.removeEventListener("themechange",v),document.removeEventListener("visibilitychange",nr),document.removeEventListener("keydown",Dt),je.remove(),C.deleteTexture(xt),C.getExtension("WEBGL_lose_context")?.loseContext(),le.remove()})}function initDappled(){
  let te=document.querySelector(".dappled-scene");
  if(!te){console.log("[dappled] no .dappled-scene element found");return}
  console.log("[dappled] found element:", te, "size:", te.clientWidth, "x", te.clientHeight);
  let badge=document.createElement("div");
  badge.textContent="[dappled script running]";
  badge.style.cssText="position:absolute;top:4px;right:4px;background:rgba(200,72,43,0.8);color:white;padding:2px 6px;font-size:11px;z-index:99;border-radius:3px";
  te.appendChild(badge);
  te.dataset.init==="true"||(te.dataset.init="true",Ze(te))
}
document.addEventListener("nav",initDappled);
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",initDappled)}else{initDappled()}})
