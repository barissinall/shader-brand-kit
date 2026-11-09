/* Shader Brand Kit — WebGL2 engine (MIT).
   Turns any logo (SVG/PNG) into a signed-distance field and renders it as liquid metal or thick glass
   over procedural backgrounds, photos and type. One JSON "spec" describes a frame; `animate` keyframes
   make it move. Runs the same in headless Chrome (CLI) and in the playground.
   Hash functions after Dave Hoskins, "Hash without Sine" (MIT). Everything else is original. */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ shaders */
  const VS = `#version 300 es
in vec2 a; out vec2 vUv; void main(){ vUv=a*.5+.5; gl_Position=vec4(a,0.,1.); }`;

  const HEAD = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uRes; uniform float uTime;
vec2 pxCoord(){ return vec2(vUv.x, 1.-vUv.y)*uRes; }          // pixel coords, y down
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
vec2  h22(vec2 p){ vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); q+=dot(q,q.yzx+33.33); return fract((q.xx+q.yz)*q.zy); }
float gnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*f*(f*(f*6.-15.)+10.);
  float a=dot(h22(i)*2.-1., f),            b=dot(h22(i+vec2(1,0))*2.-1., f-vec2(1,0));
  float c=dot(h22(i+vec2(0,1))*2.-1., f-vec2(0,1)), d=dot(h22(i+vec2(1,1))*2.-1., f-vec2(1,1));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*gnoise(p); p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(3.1,1.7); a*=.5; } return s; }
`;

  /* Background: 0 solid, 1 studio, 2 silk gradient, 3 photo */
  const FS_BG = HEAD + `
uniform int uType; uniform vec3 uC[5]; uniform int uN;
uniform sampler2D uPhoto; uniform vec2 uPhotoSize, uPhotoCenter, uSpotPos;
uniform float uZoom, uDim, uShade, uBlur, uScale, uSpeed, uAngle, uBump, uSheen, uSpot, uWarp;
vec3 pal(float k){ k=clamp(k,0.,1.)*float(uN-1); int i=int(floor(k)); if(i>=uN-1) return uC[uN-1];
  return mix(uC[i],uC[i+1],smoothstep(0.,1.,fract(k))); }
float fbm3(vec2 p){ float s=0., a=.5; for(int i=0;i<3;i++){ s+=a*gnoise(p); p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(3.1,1.7); a*=.42; } return s; }
vec2 silkF(vec2 p, float t){
  vec2 q=vec2(fbm3(p*.8+vec2(0.,.31*t)), fbm3(p*.8+vec2(5.2,1.3)-vec2(.23*t,0.)));
  float h=fbm3(p*.9+uWarp*q+vec2(1.7,9.2)+.11*t);
  return vec2(h, .5+.38*p.x/uScale+.25*p.y/uScale+1.1*h+.35*q.y); }
vec3 silk(vec2 px){
  vec2 p=(px-.5*uRes)/uRes.y; float c=cos(uAngle), s=sin(uAngle); p=mat2(c,-s,s,c)*p; p*=uScale; float t=uTime*uSpeed;
  vec2 A=silkF(p,t); float e=.003*uScale; float hx=silkF(p+vec2(e,0.),t).x, hy=silkF(p+vec2(0.,e),t).x;
  vec2 gr=vec2(-(hx-A.x), (hy-A.x))/e*uBump*.05; gr=mat2(c,s,-s,c)*gr;   // back to screen space so the light stays put
  vec3 n=normalize(vec3(gr, 1.));
  vec3 base=pal(A.y); vec3 L=normalize(vec3(-.45,.55,.7));
  float dif=.68+.32*dot(n,L); float sp=pow(max(dot(reflect(-L,n),vec3(0,0,1)),0.),14.)*uSheen;
  return base*dif + sp*mix(vec3(1.),base,.3); }
vec3 studio(vec2 px){ float y=px.y/uRes.y; vec3 col=mix(uC[0],uC[1],smoothstep(.0,1.,y));
  vec2 d=(px-uSpotPos*uRes)/uRes.y; col+=uC[2]*uSpot*exp(-dot(d,d)*5.); return col; }
vec3 photo(vec2 px){ vec2 u=px/uRes-.5; float ra=uRes.x/uRes.y, ia=uPhotoSize.x/uPhotoSize.y;
  if(ra>ia) u.y*=ia/ra; else u.x*=ra/ia; u/=uZoom; u+=uPhotoCenter;
  vec3 c=textureLod(uPhoto,u,uBlur).rgb; c*=1.-uDim; c*=1.-uShade*smoothstep(.45,1.,px.y/uRes.y); return c; }
void main(){ vec2 px=pxCoord(); vec3 c;
  if(uType==0) c=uC[0]; else if(uType==1) c=studio(px); else if(uType==2) c=silk(px); else c=photo(px);
  o=vec4(c,1.); }`;

  /* Logo: SDF -> height field -> metal / glass, with shadow + caustic on the background */
  const FS_LOGO = HEAD + `
uniform sampler2D uScene, uSdf;
uniform vec4 uRect; uniform vec2 uCenterPx; uniform float uRot, uRange, uScale, uLogoR;
uniform int uMat, uEnv; uniform float uOpacity;
uniform float uBevel, uDepth, uProfile, uDome, uLiquid, uLiquidScale, uSpeed, uDisp;
uniform vec3 uTint, uEnvTint; uniform float uEnvTintAmt, uEnvRot, uEnvGain;
uniform float uRefract, uMag, uFrost, uMilk, uGlassTintAmt, uReflect, uSpec; uniform vec3 uGlassTint;
uniform float uShadow, uShadowBlur, uCaustic; uniform vec2 uShadowOff;
const float PI=3.14159265;
float sdf(vec2 px){
  vec2 q=px-uCenterPx; float c=cos(uRot), s=sin(uRot); q=mat2(c,s,-s,c)*q+uCenterPx;
  vec2 u=(q-uRect.xy)/uRect.zw; vec2 uc=clamp(u,0.,1.);
  return texture(uSdf,uc).r*uRange*uScale - length((u-uc)*uRect.zw); }
float height(vec2 px){ float d=sdf(px); float x=clamp(d/uBevel,0.,1.);
  float r=sqrt(max(1.-(1.-x)*(1.-x),0.)), sm=x*x*(3.-2.*x);
  vec2 dc=(px-uCenterPx)/uLogoR;
  return (mix(r,sm,uProfile)*uDepth + uDome*.35*max(1.-dot(dc,dc),0.)*smoothstep(0.,uBevel,d))*uBevel; }
vec3 normalAt(vec2 px, float d){
  float e=1.; vec2 g=vec2(height(px+vec2(e,0.))-height(px-vec2(e,0.)), height(px+vec2(0.,e))-height(px-vec2(0.,e)))/(2.*e);
  vec2 lp=px/(uLogoR*.45*uLiquidScale); float t=uTime*uSpeed;
  g+=uLiquid*vec2(gnoise(lp+vec2(t,.3*t)), gnoise(lp+vec2(17.3,-t)))*smoothstep(0.,uBevel,d);
  float gl=length(g); g*=min(1.,2.6/max(gl,1e-4));               // cap slope: no razor-thin env streaks on the rim
  return normalize(vec3(-g.x, g.y, 1.)); }                       // y-up surface normal
vec3 viewAt(vec2 px){ return normalize(vec3(.5*uRes.x-px.x, px.y-.5*uRes.y, 1.7*uRes.y)); }
float box(float az, float el, float a0, float e0, float hw, float hh, float soft){
  float da=mod(az-a0+PI,2.*PI)-PI;
  return smoothstep(hw+soft,hw-soft,abs(da))*smoothstep(hh+soft,hh-soft,abs(el-e0)); }
vec3 env(vec3 r){
  float ca=cos(uEnvRot), sa=sin(uEnvRot); r.xz=mat2(ca,-sa,sa,ca)*r.xz;
  float az=atan(r.x,r.z), el=asin(clamp(r.y,-1.,1.)); vec3 c;
  if(uEnv==0){                                   // studio: black room, softboxes
    c=mix(vec3(.015),vec3(.07),smoothstep(-.6,.9,r.y));
    c+=.75*box(az,el,-.1,.25,.8,.42,.4)*(.3+.7*smoothstep(-.35,.6,el));   // big soft front fill -> gradient on flat faces
    c+=2.6*box(az,el,-.80,.50,.42,.24,.14);
    c+=1.7*box(az,el, .95,.10,.09,.60,.07);
    c+=1.0*box(az,el, .12,.02,.035,.80,.045);
    c+=.5*smoothstep(.22,.0,abs(el+.06))*smoothstep(1.6,.2,abs(az));
    c+=.35*box(az,el,-2.4,.2,.5,.5,.3);
  } else if(uEnv==1){                            // horizon: classic chrome sky / ground
    vec3 sky=mix(vec3(.92,.94,.97),vec3(.30,.40,.56),smoothstep(0.,.95,r.y));
    vec3 gnd=mix(vec3(.34,.30,.26),vec3(.025),smoothstep(0.,.45,-r.y));
    c=mix(gnd,sky,smoothstep(-.012,.012,r.y));
    c+=1.4*smoothstep(.05,0.,abs(r.y-.035));
    c+=1.6*box(az,el,-.7,.6,.3,.2,.08);
  } else {                                       // warm: amber room for gold / copper
    c=mix(vec3(.04,.02,.01),vec3(.30,.16,.07),smoothstep(-.5,.8,r.y));
    c+=vec3(1.,.82,.55)*.6*box(az,el,-.1,.25,.8,.42,.4)*(.3+.7*smoothstep(-.35,.6,el));
    c+=vec3(1.,.86,.62)*2.4*box(az,el,-.75,.48,.38,.26,.16);
    c+=vec3(1.,.72,.42)*1.3*box(az,el,1.,.05,.11,.6,.08);
    c+=vec3(1.,.9,.7)*.8*box(az,el,.1,.0,.03,.8,.05);
    c+=vec3(1.,.8,.6)*.4*smoothstep(.2,.0,abs(el+.04));
  }
  c*=uEnvGain;
  float l=dot(c,vec3(.3,.59,.11));
  return mix(c, uEnvTint*(.22+1.5*l), uEnvTintAmt*smoothstep(1.,.08,l)); }
vec3 sceneAt(vec2 px, float lod){ return textureLod(uScene, vec2(px.x/uRes.x, 1.-px.y/uRes.y), lod).rgb; }
vec3 bgAt(vec2 px){ vec3 c=sceneAt(px,0.);
  if(uShadow>0.){ float ds=sdf(px-uShadowOff); float s=smoothstep(-uShadowBlur,uShadowBlur*.35,ds);
    c*=1.-uShadow*s*uOpacity;
    if(uCaustic>0.){ float dc=sdf(px-uShadowOff*.75); float k=smoothstep(-1.5,1.5,dc)*exp(-max(dc,0.)/(uBevel*.55));
      c+=uCaustic*uOpacity*k*mix(vec3(1.),uGlassTint,.5)*(c*1.2+.08); } }
  return c; }
vec3 shadeMetal(vec2 px, float d){
  vec3 n=normalAt(px,d), V=viewAt(px), R=reflect(-V,n); vec3 c;
  float slope=length(n.xy);
  if(uDisp>0.){ vec3 off=vec3(n.xy,0.)*uDisp*slope;
    c=vec3(env(reflect(-V,normalize(n+off))).r, env(R).g, env(reflect(-V,normalize(n-off))).b); }
  else c=env(R);
  float ndv=max(dot(n,V),0.); vec3 F=uTint+(1.-uTint)*pow(1.-ndv,5.);
  return c*F; }
vec3 shadeGlass(vec2 px, float d){
  vec3 n=normalAt(px,d), V=viewAt(px); float slope=length(n.xy); vec2 ns=vec2(n.x,-n.y);
  float th=clamp(d/uBevel,0.,1.);
  vec2 base=uCenterPx+(px-uCenterPx)/uMag, off=-ns*uRefract*min(uBevel,uLogoR*.25)*.9; float lod=uFrost*6.;
  vec3 col=vec3(sceneAt(base+off*(1.+uDisp),lod).r, sceneAt(base+off,lod).g, sceneAt(base+off*(1.-uDisp),lod).b);
  col=mix(col,col*uGlassTint,uGlassTintAmt*(.5+.5*th));
  col=mix(col,uGlassTint,uMilk*(.55+.45*th));
  col*=1.-.42*slope*slope;
  float F=.04+.96*pow(1.-max(dot(n,V),0.),5.);
  col+=env(reflect(-V,n))*F*uReflect;
  vec3 L=normalize(vec3(-.5,.62,.6)), Hh=normalize(L+V);
  col+=pow(max(dot(n,Hh),0.),110.)*uSpec*1.4;
  col+=uSpec*.35*exp(-d/1.1)*(.35+.65*max(dot(normalize(ns+1e-5),normalize(vec2(-.6,-.8))),0.));
  return col; }
void main(){
  vec2 px=pxCoord(); float d0=sdf(px); vec3 bg=bgAt(px);
  if(uMat==0 || d0<-3.){ o=vec4(bg,1.); return; }
  const vec2 offs[4]=vec2[4](vec2(-.125,-.375),vec2(.375,-.125),vec2(.125,.375),vec2(-.375,.125));
  vec3 acc=vec3(0.);
  for(int i=0;i<4;i++){ vec2 p=px+offs[i]; float d=sdf(p); float cov=clamp(d*2.+.5,0.,1.);
    vec3 c=bg; if(cov>0.) c=mix(bg, uMat==1?shadeMetal(p,max(d,0.)):shadeGlass(p,max(d,0.)), cov);
    acc+=c; }
  o=vec4(mix(bg,clamp(acc*.25,0.,1.),uOpacity),1.); }`;

  const FS_TEX = HEAD + `
uniform sampler2D uImg; void main(){ o=texture(uImg,vec2(vUv.x,1.-vUv.y)); }`;

  const FS_POST = HEAD + `
uniform sampler2D uImg; uniform float uGrain, uVig, uFade, uSeed;
void main(){ vec2 px=pxCoord(); vec3 c=texture(uImg,vUv).rgb; vec2 q=vUv-.5;
  c*=1.-uVig*dot(q,q)*2.2; c+=(h21(px+uSeed*91.7)-.5)*uGrain; o=vec4(clamp(c*uFade,0.,1.),1.); }`;

  /* ------------------------------------------------------------------ data */
  const FORMATS = { post: [1080, 1350], portrait: [1080, 1440], square: [1080, 1080], story: [1080, 1920], reel: [1080, 1920], wide: [1920, 1080] };
  const FINISH = {
    chrome: [.96, .96, .97], silver: [.90, .91, .93], gold: [1.0, .76, .33], rose: [.98, .70, .60],
    copper: [.97, .58, .40], black: [.32, .32, .34], bronze: [.80, .55, .30]
  };
  const ENVS = { studio: 0, horizon: 1, warm: 2 };
  const MAT_DEFAULTS = {
    metal: { finish: 'chrome', env: 'studio', envRotate: 0, envSpin: 0, envGain: 1, envTint: '#ff6a00', envTintAmount: 0,
      bevel: .45, depth: 1, profile: .45, dome: .3, liquid: .06, liquidScale: 1, speed: .25, dispersion: .02,
      shadow: .35, shadowDist: 1, shadowSoft: 1, caustic: 0 },
    glass: { env: 'studio', envRotate: 0, envSpin: 0, envGain: 1, envTint: '#ffffff', envTintAmount: 0,
      bevel: .75, depth: 1, profile: .55, dome: .15, liquid: .03, liquidScale: 1, speed: .2, dispersion: .05,
      refraction: .6, magnify: 1.15, frost: 0, milk: 0, tint: '#ffffff', tintAmount: 0, reflect: .55, specular: .8,
      shadow: .22, shadowDist: 1, shadowSoft: 1.2, caustic: .3 },
    none: {}
  };
  const BG_DEFAULTS = {
    solid: { color: '#000000' },
    studio: { colors: ['#161616', '#030303', '#ffffff'], spot: .1, spotPos: [.5, .42] },
    silk: { colors: ['#1d2bff', '#ff6b3d', '#ffd9c4'], scale: 1, speed: .25, angle: 20, bump: .8, sheen: .25, warp: 1.2 },
    photo: { src: null, zoom: 1, center: [.5, .5], dim: 0, shade: 0, blur: 0 }
  };

  // any CSS colour ("#f60", "#ff6a00", "tomato", "rgb(...)") -> [r,g,b] 0..1
  const _cc = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null, _cache = {};
  const hex = h => { if (Array.isArray(h)) return h; const k = String(h); if (_cache[k]) return _cache[k];
    let s = k.trim(); if (_cc && !/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s)) { _cc.fillStyle = '#000'; _cc.fillStyle = s; s = _cc.fillStyle; }
    if (s.startsWith('rgb')) { const v = s.match(/[\d.]+/g).map(Number); return (_cache[k] = [v[0] / 255, v[1] / 255, v[2] / 255]); }
    s = s.replace('#', ''); if (s.length === 3) s = s.split('').map(c => c + c).join('');
    return (_cache[k] = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255)); };
  const clone = o => JSON.parse(JSON.stringify(o));
  const EASE = {
    linear: x => x, in: x => x * x * x, out: x => 1 - Math.pow(1 - x, 3),
    inOut: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
    back: x => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2)
  };
  function setPath(o, path, v) { const k = path.split('.'); let c = o;
    for (let i = 0; i < k.length - 1; i++) { if (c[k[i]] == null) c[k[i]] = {}; c = c[k[i]]; } c[k[k.length - 1]] = v; }
  function getPath(o, path) { return path.split('.').reduce((c, k) => c == null ? c : c[k], o); }
  function sampleKeys(keys, t) {
    if (!Array.isArray(keys[0])) return keys;                       // constant
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0] = keys[i], [t1, v1, e] = keys[i + 1];
      if (t <= t1) { const u = (EASE[e || 'inOut'] || EASE.inOut)((t - t0) / Math.max(t1 - t0, 1e-6));
        return Array.isArray(v0) ? v0.map((a, j) => a + (v1[j] - a) * u) : v0 + (v1 - v0) * u; }
    }
    return keys[keys.length - 1][1];
  }

  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous';
    i.onload = () => res(i); i.onerror = () => rej(new Error('could not load image ' + String(src).slice(0, 80))); i.src = src; }); }

  /* exact Euclidean distance transform (Felzenszwalb & Huttenlocher) */
  function edt(grid, w, h) {
    const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    const pass = (len) => { let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
      for (let q = 1; q < len; q++) { let s; do { const r = v[k]; s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r); } while (s <= z[k] && --k >= 0);
        k++; v[k] = q; z[k] = s; z[k + 1] = Infinity; }
      k = 0; for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; } };
    for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = grid[y * w + x]; pass(h); for (let y = 0; y < h; y++) grid[y * w + x] = d[y]; }
    for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = grid[y * w + x]; pass(w); for (let x = 0; x < w; x++) grid[y * w + x] = d[x]; }
    return grid;
  }

  /* ------------------------------------------------------------------ engine */
  class BrandKit {
    constructor(canvas) {
      this.cv = canvas;
      const gl = this.gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
      if (!gl) throw new Error('WebGL2 is not available');
      this.P = { bg: this.prog(FS_BG), logo: this.prog(FS_LOGO), tex: this.prog(FS_TEX), post: this.prog(FS_POST) };
      this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.cache = { logo: new Map(), img: new Map(), font: new Set() };
      this.W = 0; this.H = 0;
    }
    get renderer() { const gl = this.gl, ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); }
    prog(fs) { const gl = this.gl, mk = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const locs = {}; p.u = n => (n in locs) ? locs[n] : (locs[n] = gl.getUniformLocation(p, n)); return p; }
    target(w, h, mips) { const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, mips ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1, gl.RGBA8, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); return { f, t }; }
    imageTex(img, premult) { const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!premult);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); t.w = img.width; t.h = img.height; return t; }

    resize(w, h) { if (w === this.W && h === this.H) return; const gl = this.gl;
      this.W = this.cv.width = w; this.H = this.cv.height = h;
      this.A = this.target(w, h, true); this.B = this.target(w, h, false); }

    /* logo -> mask -> signed distance field (positive inside, in mask pixels) */
    async logo(src, opts = {}) {
      const key = src + '|' + !!opts.invert + '|' + (opts.threshold ?? .5);
      if (this.cache.logo.has(key)) return this.cache.logo.get(key);
      const img = await loadImg(src);
      let iw = img.naturalWidth || img.width || 1000, ih = img.naturalHeight || img.height || 1000;
      const L = 1400, sc = L / Math.max(iw, ih), lw = Math.round(iw * sc), lh = Math.round(ih * sc), pad = Math.round(L * .14);
      const w = lw + 2 * pad, h = lh + 2 * pad;
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, pad, pad, lw, lh); const px = x.getImageData(0, 0, w, h).data;
      // transparency is judged only inside the logo's own rectangle (the padding is always transparent)
      let transparent = 0, total = 0;
      for (let y = pad; y < pad + lh; y += 3) for (let xx = pad; xx < pad + lw; xx += 3) { total++; if (px[(y * w + xx) * 4 + 3] < 250) transparent++; }
      const useAlpha = transparent > total * .02, thr = (opts.threshold ?? .5) * 255;
      // opaque logo (JPG, PNG on white): key out the background = median colour of the image's border ring
      let bg = null;
      if (!useAlpha) { const rs = [], gs = [], bs = [];
        const take = (xx, y) => { const k = (y * w + xx) * 4; rs.push(px[k]); gs.push(px[k + 1]); bs.push(px[k + 2]); };
        for (let xx = pad; xx < pad + lw; xx += 2) { take(xx, pad + 1); take(xx, pad + lh - 2); }
        for (let y = pad; y < pad + lh; y += 2) { take(pad + 1, y); take(pad + lw - 2, y); }
        const med = a => a.sort((p, q) => p - q)[a.length >> 1]; bg = [med(rs), med(gs), med(bs)]; }
      const inside = new Uint8Array(w * h); let cr = 0, cg = 0, cb = 0, cw = 0, count = 0;
      const keyDist = (opts.threshold ?? .5) * 0.36 * 255;   // ~ deltaE-ish distance in sRGB units
      for (let i = 0; i < w * h; i++) { const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3];
        let on = useAlpha ? a > thr : (a > 128 && Math.hypot((r - bg[0]) * .6, (g - bg[1]) * .8, (b - bg[2]) * .5) > keyDist);
        if (opts.invert) on = useAlpha ? !on : (a > 128 && !on);
        inside[i] = on ? 1 : 0; count += inside[i];
        if (on && a > 200) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0, wt = sat * sat;
          cr += r * wt; cg += g * wt; cb += b * wt; cw += wt; } }
      const BIG = 1e20, gin = new Float64Array(w * h), gout = new Float64Array(w * h);
      for (let i = 0; i < w * h; i++) { gin[i] = inside[i] ? BIG : 0; gout[i] = inside[i] ? 0 : BIG; }
      edt(gin, w, h); edt(gout, w, h);
      let sd = new Float32Array(w * h), maxIn = 0, range = 0;
      for (let i = 0; i < w * h; i++) { const v = inside[i] ? Math.sqrt(gin[i]) - .5 : -(Math.sqrt(gout[i]) - .5); sd[i] = v; }
      for (let pass = 0; pass < 2; pass++) {               // light blur -> smooth normals, no faceting
        const t = new Float32Array(w * h);
        for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { let s = 0, n = 0;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const yy = Math.min(h - 1, Math.max(0, y + j)), xi = Math.min(w - 1, Math.max(0, xx + i)); s += sd[yy * w + xi]; n++; }
          t[y * w + xx] = s / n; }
        sd = t; }
      for (let i = 0; i < w * h; i++) { maxIn = Math.max(maxIn, sd[i]); range = Math.max(range, Math.abs(sd[i])); }
      for (let i = 0; i < w * h; i++) sd[i] /= range;
      const gl = this.gl, tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.FLOAT, sd);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const color = cw > 50 ? '#' + [cr, cg, cb].map(v => Math.round(v / cw).toString(16).padStart(2, '0')).join('') : null;
      const info = { tex, w, h, L, pad, maxIn, range, color, aspect: lw / lh, coverage: count / (lw * lh), keyed: !useAlpha };
      this.cache.logo.set(key, info); return info;
    }
    async image(src) { if (this.cache.img.has(src)) return this.cache.img.get(src);
      const t = this.imageTex(await loadImg(src)); this.cache.img.set(src, t); return t; }
    async defaultFont() { if (this.cache.font.has('Inter')) return; this.cache.font.add('Inter');
      const sets = [['inter-latin.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
        ['inter-latin-ext.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF']];
      for (const [file, range] of sets) { try { const base = (global.BK_FONT_BASE || 'fonts/'), data = global.BK_FONT_DATA && global.BK_FONT_DATA[file];
          const ff = new FontFace('Inter', `url(${data || base + file})`, { weight: '100 900', unicodeRange: range }); await ff.load(); document.fonts.add(ff); }
        catch (e) { console.warn('Inter not loaded (' + file + '), falling back to system font'); } } }
    async fonts(list) { for (const f of list || []) { const k = f.family + f.weight + f.src; if (this.cache.font.has(k)) continue;
        const ff = new FontFace(f.family, `url(${f.src})`, { weight: String(f.weight || 'normal'), style: f.style || 'normal' });
        await ff.load(); document.fonts.add(ff); this.cache.font.add(k); } }

    /* public: load a spec (assets are cached, so calling it again with tweaks is cheap) */
    async load(spec) {
      const s = clone(spec);
      const fmt = typeof s.format === 'object' ? [s.format.w, s.format.h] : FORMATS[s.format || 'post'];
      if (!fmt) throw new Error('unknown format ' + s.format);
      s.w = fmt[0]; s.h = fmt[1];
      const bgType = (s.background && s.background.type) || 'studio';
      s.background = Object.assign({}, BG_DEFAULTS[bgType], s.background, { type: bgType });
      const mType = (s.material && s.material.type) || 'metal';
      s.material = Object.assign({}, MAT_DEFAULTS[mType], s.material, { type: mType });
      s.logo = Object.assign({ x: .5, y: .46, size: .56, rotate: 0, opacity: 1 }, s.logo);
      s.text = s.text || []; s.grain = s.grain ?? .045; s.vignette = s.vignette ?? .2; s.fade = s.fade ?? 1;
      this.resize(s.w, s.h);
      await this.defaultFont(); await this.fonts(s.fonts);
      try { await document.fonts.ready; } catch (e) { }
      this.L = s.logo.src ? await this.logo(s.logo.src, s.logo) : null;
      this.photo = s.background.type === 'photo' ? await this.image(s.background.src) : null;
      for (const im of s.images || []) im._img = await loadImg(im.src);
      this.images = s.images || [];
      // strip heavy strings so per-frame cloning stays cheap
      if (s.logo.src) s.logo.src = '[logo]'; if (s.background.src) s.background.src = '[photo]';
      (s.fonts || []).forEach(f => f.src = '[font]'); delete s.images;
      this.spec = s; this.textKey = null;
      return { w: s.w, h: s.h, renderer: this.renderer, logoColor: this.L && this.L.color, logoAspect: this.L && this.L.aspect };
    }

    resolve(t) { const s = clone(this.spec);
      for (const [path, keys] of Object.entries(s.animate || {})) setPath(s, path, sampleKeys(keys, t));
      return s; }

    textCanvas(s, layer) {
      const items = s.text.filter(it => (it.layer || 'over') === layer), imgs = layer === 'over' ? this.images : [];
      if (!items.length && !imgs.length) return null;
      const key = layer + JSON.stringify(items) + imgs.length; this._tc = this._tc || {};
      if (this._tc[layer] && this._tc[layer].key === key) return this._tc[layer].tex;
      const W = s.w, H = s.h, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
      for (const it of items) {
        x.save(); x.globalAlpha = it.opacity ?? 1; const size = (it.size ?? .05) * W;
        x.font = `${it.style || 'normal'} ${it.weight || 700} ${size}px ${it.font ? `"${it.font}", ` : ''}Inter, system-ui, "Segoe UI", Helvetica, Arial, sans-serif`;
        x.fillStyle = it.color || '#ffffff'; x.textAlign = it.align || 'center'; x.textBaseline = 'alphabetic';
        if ('letterSpacing' in x) x.letterSpacing = ((it.tracking ?? 0) * size) + 'px';
        if (it.shadow) { x.shadowColor = 'rgba(0,0,0,' + (typeof it.shadow === 'number' ? it.shadow : .45) + ')'; x.shadowBlur = size * .6; x.shadowOffsetY = size * .08; }
        const raw = String(it.text), lang = it.lang || (/[ğşıİĞŞ]/.test(raw) ? 'tr' : undefined);   // Turkish i/İ only when the text is Turkish
        const txt = it.uppercase ? raw.toLocaleUpperCase(lang) : raw;
        txt.split('\n').forEach((ln, k) => x.fillText(ln, (it.x ?? .5) * W, (it.y ?? .85) * H + k * size * (it.lineHeight ?? 1.02)));
        x.restore();
      }
      for (const im of imgs) { const w = (im.width ?? .2) * W, h = w * im._img.height / im._img.width; x.globalAlpha = im.opacity ?? 1;
        x.drawImage(im._img, (im.x ?? .5) * W - w / 2, (im.y ?? .5) * H - h / 2, w, h); x.globalAlpha = 1; }
      const old = this._tc[layer]; if (old) this.gl.deleteTexture(old.tex);
      const tex = this.imageTex(c, true); this._tc[layer] = { key, tex }; return tex;
    }

    draw(p) { const gl = this.gl; gl.useProgram(p); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); const l = gl.getAttribLocation(p, 'a');
      gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
    bindTex(p, name, tex, unit) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(p.u(name), unit); }
    overlay(tex) { if (!tex) return; const gl = this.gl, p = this.P.tex; gl.useProgram(p); this.bindTex(p, 'uImg', tex, 0);
      gl.uniform2f(p.u('uRes'), this.W, this.H); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); this.draw(p); gl.disable(gl.BLEND); }

    /* public: render time t (seconds) to the canvas */
    frame(t = 1) {
      const gl = this.gl, s = this.resolve(t), W = this.W, H = this.H, b = s.background, m = s.material, lg = s.logo;
      // 1) background (+ text that sits under glass)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.A.f); gl.viewport(0, 0, W, H);
      let p = this.P.bg; gl.useProgram(p); gl.uniform2f(p.u('uRes'), W, H); gl.uniform1f(p.u('uTime'), t);
      const type = { solid: 0, studio: 1, silk: 2, photo: 3 }[b.type];
      gl.uniform1i(p.u('uType'), type);
      const cols = (b.type === 'solid' ? [b.color] : (b.colors || ['#000'])).slice(0, 5);
      const flat = new Float32Array(15); cols.forEach((c, i) => flat.set(hex(c), i * 3));
      gl.uniform3fv(p.u('uC[0]'), flat); gl.uniform1i(p.u('uN'), cols.length);
      gl.uniform2fv(p.u('uSpotPos'), b.spotPos || [lg.x, lg.y]); gl.uniform1f(p.u('uSpot'), b.spot ?? 0);
      gl.uniform1f(p.u('uScale'), b.scale ?? 1); gl.uniform1f(p.u('uSpeed'), b.speed ?? .25); gl.uniform1f(p.u('uAngle'), (b.angle ?? 0) * Math.PI / 180);
      gl.uniform1f(p.u('uBump'), b.bump ?? .8); gl.uniform1f(p.u('uSheen'), b.sheen ?? .25); gl.uniform1f(p.u('uWarp'), b.warp ?? 1.2);
      if (this.photo) { this.bindTex(p, 'uPhoto', this.photo, 0); gl.uniform2f(p.u('uPhotoSize'), this.photo.w, this.photo.h);
        gl.uniform2fv(p.u('uPhotoCenter'), b.center || [.5, .5]); gl.uniform1f(p.u('uZoom'), b.zoom ?? 1);
        gl.uniform1f(p.u('uDim'), b.dim ?? 0); gl.uniform1f(p.u('uShade'), b.shade ?? 0); gl.uniform1f(p.u('uBlur'), b.blur ?? 0); }
      this.draw(p);
      this.overlay(this.textCanvas(s, 'under'));
      gl.bindTexture(gl.TEXTURE_2D, this.A.t); gl.generateMipmap(gl.TEXTURE_2D);

      // 2) logo material
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.B.f); p = this.P.logo; gl.useProgram(p);
      gl.uniform2f(p.u('uRes'), W, H); gl.uniform1f(p.u('uTime'), t); this.bindTex(p, 'uScene', this.A.t, 0);
      const L = this.L, matId = L ? ({ none: 0, metal: 1, glass: 2 }[m.type] ?? 1) : 0; gl.uniform1i(p.u('uMat'), matId);
      // reset per-spec state so nothing (e.g. a shadow) leaks from a previous spec without a logo
      gl.uniform1f(p.u('uShadow'), 0); gl.uniform1f(p.u('uCaustic'), 0); gl.uniform1f(p.u('uOpacity'), 1);
      if (L) {
        this.bindTex(p, 'uSdf', L.tex, 1);
        const S = lg.size * Math.min(W, H), sc = S / L.L, rw = L.w * sc, rh = L.h * sc, cx = lg.x * W, cy = lg.y * H;
        gl.uniform4f(p.u('uRect'), cx - rw / 2, cy - rh / 2, rw, rh); gl.uniform2f(p.u('uCenterPx'), cx, cy);
        gl.uniform1f(p.u('uRot'), (lg.rotate || 0) * Math.PI / 180); gl.uniform1f(p.u('uRange'), L.range); gl.uniform1f(p.u('uScale'), sc);
        gl.uniform1f(p.u('uLogoR'), S / 2); gl.uniform1f(p.u('uOpacity'), lg.opacity ?? 1);
        const bevel = Math.max(1.5, Math.min(1, Math.max(.02, m.bevel)) * L.maxIn * sc);
        gl.uniform1f(p.u('uBevel'), bevel); gl.uniform1f(p.u('uDepth'), m.depth ?? 1); gl.uniform1f(p.u('uProfile'), m.profile ?? .3);
        gl.uniform1f(p.u('uDome'), m.dome ?? 0); gl.uniform1f(p.u('uLiquid'), m.liquid ?? 0); gl.uniform1f(p.u('uLiquidScale'), m.liquidScale ?? 1);
        gl.uniform1f(p.u('uSpeed'), m.speed ?? .25); gl.uniform1f(p.u('uDisp'), m.dispersion ?? 0);
        gl.uniform1i(p.u('uEnv'), ENVS[m.env] ?? 0); gl.uniform1f(p.u('uEnvRot'), ((m.envRotate || 0) + (m.envSpin || 0) * t) * Math.PI / 180);
        gl.uniform1f(p.u('uEnvGain'), m.envGain ?? 1); gl.uniform3fv(p.u('uEnvTint'), hex(m.envTint || '#ffffff')); gl.uniform1f(p.u('uEnvTintAmt'), m.envTintAmount || 0);
        const tint = typeof m.finish === 'string' ? (FINISH[m.finish] || hex(m.finish)) : (m.finish || FINISH.chrome);
        gl.uniform3fv(p.u('uTint'), tint);
        gl.uniform1f(p.u('uRefract'), m.refraction ?? .6); gl.uniform1f(p.u('uMag'), m.magnify ?? 1.15); gl.uniform1f(p.u('uFrost'), m.frost ?? 0);
        gl.uniform1f(p.u('uMilk'), m.milk ?? 0); gl.uniform3fv(p.u('uGlassTint'), hex(m.tint || '#ffffff')); gl.uniform1f(p.u('uGlassTintAmt'), m.tintAmount ?? 0);
        gl.uniform1f(p.u('uReflect'), m.reflect ?? .55); gl.uniform1f(p.u('uSpec'), m.specular ?? .8);
        gl.uniform1f(p.u('uShadow'), m.shadow ?? 0); gl.uniform2f(p.u('uShadowOff'), S * .012 * (m.shadowDist ?? 1), S * .045 * (m.shadowDist ?? 1));
        gl.uniform1f(p.u('uShadowBlur'), S * .05 * (m.shadowSoft ?? 1)); gl.uniform1f(p.u('uCaustic'), m.type === 'glass' ? (m.caustic ?? 0) : 0);
      }
      this.draw(p);
      this.overlay(this.textCanvas(s, 'over'));

      // 3) post
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); p = this.P.post; gl.useProgram(p);
      gl.uniform2f(p.u('uRes'), W, H); this.bindTex(p, 'uImg', this.B.t, 0);
      gl.uniform1f(p.u('uGrain'), s.grain); gl.uniform1f(p.u('uVig'), s.vignette); gl.uniform1f(p.u('uFade'), s.fade); gl.uniform1f(p.u('uSeed'), Math.round(t * 30) % 30);   // grain repeats every second -> loops cleanly
      this.draw(p);
      return true;
    }
    snap(type = 'image/png', q) { return this.cv.toDataURL(type, q); }
  }

  BrandKit.FORMATS = FORMATS; BrandKit.FINISH = FINISH; BrandKit.MAT_DEFAULTS = MAT_DEFAULTS; BrandKit.BG_DEFAULTS = BG_DEFAULTS;
  BrandKit.getPath = getPath; BrandKit.setPath = setPath;
  global.BrandKit = BrandKit;
})(typeof window !== 'undefined' ? window : this);
