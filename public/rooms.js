// One in-flight request per tab; membership credentials never appear in invite URLs.
export class RoomClient {
  constructor({onUpdate,onError,request=fetch,storage=globalThis.sessionStorage}={}) {
    this.onUpdate=onUpdate;this.onError=onError;this.request=request;this.storage=storage;this.session=null;this.snapshot=null;this.pending=false;this.timer=null;this.generation=0;
  }
  async call(action,data={}) {
    if(this.pending)throw new Error('Waiting for the room. Try again in a moment.');
    this.pending=true;const generation=this.generation;
    try {
      const response=await this.request('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({action,...this.session,revision:this.snapshot?.revision,requestId:globalThis.crypto?.randomUUID?.(),...data}),signal:AbortSignal.timeout(12000)});
      const result=await response.json();
      if(!response.ok){const error=new Error(result.error||'Room request failed.');error.status=response.status;throw error;}
      if(generation!==this.generation)return null;
      if(result.token){this.session={code:result.code,token:result.token};try{this.storage?.setItem('fourway.room.v1',JSON.stringify(this.session));}catch{/* session still works until reload */}}
      this.snapshot=result;this.onUpdate?.(result);return result;
    } finally {this.pending=false;}
  }
  async enter(action,data) {const result=await this.call(action,data);this.poll();return result;}
  poll() {
    clearTimeout(this.timer);
    if(!this.session)return;
    this.timer=setTimeout(async()=>{
      try{if(!this.pending)await this.call('poll');}catch(error){this.onError?.(error);if([401,404].includes(error.status)){this.detach();return;}}
      this.poll();
    },1000);
  }
  async restore(){try{const saved=JSON.parse(this.storage?.getItem('fourway.room.v1')||'null');if(!saved?.code||!saved?.token)return;this.session=saved;await this.call('poll');this.poll();}catch(error){this.onError?.(error);if([401,404].includes(error.status))this.detach();else this.poll();}}
  detach(){this.generation++;clearTimeout(this.timer);this.session=null;this.snapshot=null;try{this.storage?.removeItem('fourway.room.v1');}catch{}}
  async leave(){if(this.session)await this.call('leave');this.detach();}
}
