// Read-only by default. --start explicitly enables one immediate-charge command.
// Credentials/tokens/IDs remain in memory; retained results contain summaries only.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const createLive=require('../src/pkjs/live'),createControl=require('../src/pkjs/control');
const root=path.resolve(__dirname,'..'),start=process.argv.includes('--start');
const local=path.join(root,'.local');fs.mkdirSync(local,{recursive:true});
const receipt={started_at:new Date().toISOString(),start_authorized:start,writes:0,states:[],errors:[]};
function props(name){const o={};for(const line of fs.readFileSync(path.join(root,'..',name),'utf8').split(/\r?\n/)){
 if(/^\s*[#!]/.test(line))continue;const i=line.indexOf('=');if(i>0)o[line.slice(0,i).trim()]=line.slice(i+1).trim();
}return o;}
const kia=props('kia.properties'),oct=props('octopus.properties');
const config={kiaClientId:kia['client-id'],kiaClientSecret:kia['client-secret'],octopusUser:oct.user,octopusPassword:oct.password};
// Run the production HTTP response/error classifier through a minimal Node XHR.
global.XMLHttpRequest=class {
 open(method,url){this.method=method;this.url=url;this.headers={};}
 setRequestHeader(k,v){this.headers[k]=v;}
 send(body){
  if(body && /updateBoostCharge/.test(JSON.parse(body).query||'')){
   if(!start || ++receipt.writes>1)throw new Error('Live write scope rejected');
  }
  let settled=false;const finish=fn=>{if(!settled){settled=true;fn?.();}};
  const req=https.request(this.url,{method:this.method,headers:{'User-Agent':'OctopusKia-Testing/1.0',...this.headers,...(body?{'Content-Length':Buffer.byteLength(body)}:{})}},res=>{
   let raw='';res.setEncoding('utf8');res.on('data',s=>raw+=s);res.on('end',()=>{
    this.status=res.statusCode;this.responseText=raw;
    try{const doc=JSON.parse(raw);
    if(res.statusCode>=400 || doc.error)receipt.errors.push({status:res.statusCode,root_keys:Object.keys(doc),provider:this.url.includes('kraken')?'octopus':'kia'});
    for(const e of doc.errors||[]){
     const x=e.extensions||{};receipt.errors.push({code:/^KT-[A-Z]+-\d+$/.test(x.errorCode||'')?x.errorCode:'UNKNOWN',
      reasons:(Array.isArray(x.boostChargeRefusalReasons)?x.boostChargeRefusalReasons:[]).filter(r=>/^BC_[A-Z_]+$/.test(r))});
    }}catch{}
    finish(()=>this.onload?.());
   });
  });
  req.setTimeout(this.timeout,()=>{finish(()=>this.ontimeout?.());req.destroy();});
  req.on('error',e=>{receipt.errors.push({transport:/^[A-Z_]+$/.test(e.code||'')?e.code:'UNKNOWN'});finish(()=>this.onerror?.());});req.end(body||null);
 }
};
const stateFile=path.join(local,'boost-trial-state.json');
const values=new Map(fs.existsSync(stateFile)?Object.entries(JSON.parse(fs.readFileSync(stateFile,'utf8'))):[]);
function persist(){const safe={};for(const [k,v] of values)if(k.startsWith('ov2c.control.'))safe[k]=v;fs.writeFileSync(stateFile,JSON.stringify(safe,null,2));}
const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>{values.set(k,v);if(k.startsWith('ov2c.control.'))persist();},removeItem:k=>{values.delete(k);if(k.startsWith('ov2c.control.'))persist();}};
let summary,listener,lastData;
const api=createLive({storage,readConfig:()=>config,publish:p=>summary=p});
const c=createControl({storage,read:cb=>api.refresh((err,data)=>{lastData=data;cb(err,data);}),write:api.writePreferences,writeBoost:api.writeBoost,publish:p=>{
 receipt.states.push({state:p.CONTROL_STATE,message:p.CONTROL_TEXT});listener?.(p);
}});
function until(action){return new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(new Error('Timed out')),90000);
 listener=p=>{if(p.CONTROL_STATE===2||p.CONTROL_STATE>=4){clearTimeout(timer);listener=null;resolve(p);}};action();
});}
function clean(){return summary?{phase:summary.CHARGER_PHASE,label:summary.CHARGER_TEXT,octopus_state:summary.OCTOPUS_STATE,add:summary.ADD_TEXT,ready:summary.READY}:{};}
(async()=>{
 if(start){
  const p=await until(()=>c.prepare(0));receipt.before=clean();
  const originalPreferences=lastData && lastData.octopus ? JSON.stringify(lastData.octopus.preferences) : null;
  if(p.CONTROL_STATE===2){const r=await until(()=>c.confirm(p.OFFER_ID));receipt.result={state:r.CONTROL_STATE,message:r.CONTROL_TEXT};
   receipt.preferences_unchanged=!!originalPreferences && originalPreferences===JSON.stringify(lastData.octopus.preferences);
  }
  else receipt.result={state:p.CONTROL_STATE,message:p.CONTROL_TEXT};
 }else await new Promise(resolve=>api.refresh(()=>resolve()));
 receipt.after=clean();receipt.finished_at=new Date().toISOString();
 fs.writeFileSync(path.join(local,'boost-trial-'+(start?'start':'check')+'.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt,null,2));
})().catch(()=>{
 receipt.error='Trial failed; verify provider and pending state before retrying';
 fs.writeFileSync(path.join(local,'boost-trial-error.json'),JSON.stringify(receipt,null,2));
 console.error(receipt.error);process.exitCode=1;
});
