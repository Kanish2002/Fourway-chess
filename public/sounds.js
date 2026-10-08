// Chess.com's public classic sound URLs; synthesized wooden clicks keep audio usable offline.
export const CLASSIC_ROOT = 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/';
export const SOUND_FILES = { move:'move-self', capture:'capture', check:'move-check', castle:'castle', illegal:'illegal', start:'game-start', end:'game-end' };
let context;
const clips = new Map();
export function woodSamples(kind, sampleRate = 44100) {
  const lengths={move:.12,capture:.18,check:.24,castle:.22,illegal:.11,start:.28,end:.38};
  const out=new Float32Array(Math.ceil(sampleRate*(lengths[kind]||.12)));
  let seed=1973;
  const strikes=kind==='castle'?[0,.08]:kind==='start'?[0,.09,.18]:kind==='end'?[0,.12,.24]:kind==='check'?[0,.1]:[0];
  const frequency=kind==='capture'?290:kind==='illegal'?160:430;
  for(let i=0;i<out.length;i++) {
    const t=i/sampleRate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=(seed/4294967296)*2-1;
    let value=0;
    for(const strike of strikes){const dt=t-strike;if(dt<0)continue;value+=.35*Math.exp(-dt*65)*noise+.21*Math.exp(-dt*38)*Math.sin(2*Math.PI*frequency*dt)+.09*Math.exp(-dt*60)*Math.sin(2*Math.PI*frequency*2.7*dt);}
    out[i]=Math.max(-.8,Math.min(.8,value));
  }
  return out;
}
function wood(kind) {
  try {
    context ||= new (window.AudioContext || window.webkitAudioContext)();context.resume();
    const samples=woodSamples(kind,context.sampleRate),buffer=context.createBuffer(1,samples.length,context.sampleRate);
    buffer.copyToChannel(samples,0);
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=.65;
    source.connect(gain);gain.connect(context.destination);source.start();
  }catch{/* Sound is optional when the device disables audio. */}
}
export function playSound(kind='move', set='classic') {
  if(set==='wood'){wood(kind);return;}
  try {
    if(!clips.has(kind)){const a=new Audio(CLASSIC_ROOT+(SOUND_FILES[kind]||SOUND_FILES.move)+'.mp3');a.preload='auto';clips.set(kind,a);}
    const a=clips.get(kind);a.currentTime=0;a.volume=.65;
    const result=a.play();if(result?.catch)result.catch(()=>wood(kind));
  }catch{wood(kind);}
}
