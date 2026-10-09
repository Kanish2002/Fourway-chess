import { RoomError } from './rooms.js';
export function roomHandler(service) {
  return async (req,res) => {
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    try {
      if(req.method!=='POST')throw new RoomError('Use POST.',405);
      const origin=req.headers.origin;
      if(origin){let host;try{host=new URL(origin).host;}catch{throw new RoomError('Invalid origin.',403);}if(host!==req.headers.host)throw new RoomError('Cross-origin requests are not allowed.',403);}
      if(!service)throw new RoomError('Online rooms need shared Redis storage. Solo and local games are available.',503);
      let input=req.body;
      if(!input){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)throw new RoomError('Request is too large.',413);}try{input=JSON.parse(raw);}catch{throw new RoomError('Invalid JSON.');}}
      else if(typeof input==='string'){if(Buffer.byteLength(input)>8192)throw new RoomError('Request is too large.',413);try{input=JSON.parse(input);}catch{throw new RoomError('Invalid JSON.');}}
      if(Buffer.byteLength(JSON.stringify(input))>8192)throw new RoomError('Request is too large.',413);
      const identity=(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
      res.statusCode=200;res.end(JSON.stringify(await service.dispatch(input,identity)));
    } catch(error) {res.statusCode=error instanceof RoomError?error.status:503;res.end(JSON.stringify({error:error instanceof RoomError?error.message:'Room service is temporarily unavailable. Try again.'}));}
  };
}
