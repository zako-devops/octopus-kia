// JWT expiry is a cache check; the server verifies signatures and authorization.
function expiry(token) {
  try {
    var part=token.split('.')[1], alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', decoded='';
    if(!part || /[^A-Za-z0-9_-]/.test(part)) return 0;
    part=part.replace(/-/g,'+').replace(/_/g,'/');
    for(var i=0;i<part.length;i+=4) {
      var a=alphabet.indexOf(part.charAt(i)), b=alphabet.indexOf(part.charAt(i+1));
      if(a<0 || b<0 || i+1>=part.length) return 0;
      decoded+=String.fromCharCode((a<<2)|(b>>4));
      if(i+2<part.length) {
        var c=alphabet.indexOf(part.charAt(i+2));decoded+=String.fromCharCode(((b&15)<<4)|(c>>2));
        if(i+3<part.length) decoded+=String.fromCharCode(((c&3)<<6)|alphabet.indexOf(part.charAt(i+3)));
      }
    }
    var exp=JSON.parse(decoded).exp;
    return typeof exp==='number' && isFinite(exp*1000)?exp*1000:0;
  }catch(e){return 0;}
}
module.exports=function(options){
  var waiting=null;
  function usable(t){return typeof t==='string' && expiry(t)>options.now()+60000;}
  return {get:function(rejected,cb){
    if(!options.current()){cb({kind:'cancelled'});return;}
    var cached;
    try{cached=JSON.parse(options.storage.getItem(options.key));}catch(e){}
    if(cached && cached!==rejected && usable(cached)){cb(null,cached);return;}
    if(waiting){waiting.push(cb);return;}
    options.storage.removeItem(options.key);
    waiting=[cb];
    options.issue(function(err,token){
      if(!options.current()) err={kind:'cancelled'};
      if(!err && !usable(token)) err={kind:'auth'};
      if(!err) options.storage.setItem(options.key,JSON.stringify(token));
      var callbacks=waiting;waiting=null;
      callbacks.forEach(function(fn){fn(err,err?null:token);});
    });
  }};
};
module.exports.expiry=expiry;
