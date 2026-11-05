import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
export async function connect({descriptor=process.env.DSH_CONTROL_DESCRIPTOR||join(process.env.DSH_HOME||join(homedir(),'.dsh'),'control-bridge','connection.json'),fetchImpl=fetch}={}){
  const d=JSON.parse(await readFile(descriptor,'utf8'));const url=new URL(d.endpoint);
  if(d.protocolVersion!==1||d.packageName!=='dsh-control-bridge'||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/dsh-control/api'||url.search||url.hash||!/^[a-f0-9]{64}$/.test(d.token))throw new Error('Invalid DSH local discovery descriptor');
  return {async call(name,args={}){const response=await fetchImpl(d.endpoint+'/call',{method:'POST',headers:{authorization:'Bearer '+d.token,'content-type':'application/json'},body:JSON.stringify({name,arguments:args}),redirect:'error',signal:AbortSignal.timeout(65000)});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error?.message||`HTTP ${response.status}`);return data.value;}};
}
