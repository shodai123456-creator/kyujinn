import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=join(fileURLToPath(new URL('.',import.meta.url)),'app');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8'};
createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const path=normalize(join(root,pathname==='/'?'/index.html':pathname));if(!path.startsWith(root)){res.writeHead(403);return res.end('Forbidden')}const body=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});res.end(body)}catch{res.writeHead(404);res.end('Not found')}}).listen(Number(process.env.PORT||4173),()=>console.log(`Job Match: http://localhost:${process.env.PORT||4173}`));
