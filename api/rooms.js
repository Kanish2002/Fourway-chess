import { productionStore } from '../server/store.js';
import { RoomService } from '../server/rooms.js';
import { roomHandler } from '../server/http.js';
let handler;
export default async function rooms(req,res) {
  if(!handler){const store=productionStore();handler=roomHandler(store?new RoomService(store):null);}
  return handler(req,res);
}
