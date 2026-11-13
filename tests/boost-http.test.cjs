const {test}=require('node:test');
const assert=require('node:assert/strict');
const live=require('../src/pkjs/live');
const simulation=require('../src/pkjs/simulation');

test('production HTTP classifier handles boost refusal/auth once, without mutation retry',async()=>{
 const original=global.XMLHttpRequest;
 try{
  for(const action of ['BOOST','CANCEL'])for(const [status,doc,kind] of [[200,{errors:[{extensions:{errorCode:'KT-CT-4357',boostChargeRefusalReasons:['BC_DEVICE_DISCONNECTED']}}]},'rejected'],
   [200,{errors:[{extensions:{errorCode:'KT-CT-4354'}}]},'rejected'],[403,{},'rejected'],[200,{errors:[{extensions:{errorCode:'KT-CT-7899'}}]},'response']]){
   const fixture=simulation(),values=new Map();let writes=0;
   global.XMLHttpRequest=class{
    open(method,url){this.method=method;this.url=url;}
    setRequestHeader(){}
    send(body){
     const parsed=body?JSON.parse(body):null;
     if(parsed?.query?.includes('updateBoostCharge')){
      writes++;assert.deepEqual(parsed.variables.input,{deviceId:'fixture-device',action:action});
      this.status=status;this.responseText=JSON.stringify(doc);queueMicrotask(()=>this.onload());
     }else fixture.request({url:this.url,body:parsed},(err,data)=>{
      this.status=200;this.responseText=JSON.stringify({data});this.onload();
     });
    }
   };
   const api=live({storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},readConfig:()=>fixture.config,publish:()=>{}});
   await new Promise(resolve=>api.refresh(resolve));
   const error=await new Promise(resolve=>api.writeBoost({deviceId:'fixture-device',action:action},resolve));
   assert.equal(error.kind,kind);assert.equal(writes,1);
  }
 }finally{global.XMLHttpRequest=original;}
});
