import {createClient,type Client,type InValue,type ResultSet} from '@libsql/client';

// Banco Turso (libSQL/SQLite). Mantém a mesma interface usada antes com o Cloudflare D1
// (prepare().bind().first()/all()/run() e batch()), para que as rotas não precisem mudar.
// Sem TURSO_DATABASE_URL, usa um arquivo SQLite local (apenas para desenvolvimento).

type Row=Record<string,any>;
type RunResult={results:Row[];meta:{changes:number;last_row_id:number|null}};

let client:Client|null=null;
function getClient(){
  if(client)return client;
  const url=process.env.TURSO_DATABASE_URL||'file:periferica-local.db';
  client=createClient({url,authToken:process.env.TURSO_AUTH_TOKEN||undefined});
  return client;
}

function rows(r:ResultSet):Row[]{return r.rows.map(row=>Object.fromEntries(r.columns.map((c,i)=>[c,row[i]])));}
function toResult(r:ResultSet):RunResult{return {results:rows(r),meta:{changes:r.rowsAffected,last_row_id:r.lastInsertRowid===undefined?null:Number(r.lastInsertRowid)}};}

export class Statement{
  constructor(readonly sql:string,readonly args:InValue[]=[]){}
  bind(...values:unknown[]){return new Statement(this.sql,values.map(v=>v===undefined?null:v as InValue));}
  async first<T=any>():Promise<T|null>{const r=await getClient().execute({sql:this.sql,args:this.args});return (rows(r)[0] as T)??null;}
  async all<T=any>():Promise<{results:T[]}>{const r=await getClient().execute({sql:this.sql,args:this.args});return {results:rows(r) as T[]};}
  async run():Promise<RunResult>{return toResult(await getClient().execute({sql:this.sql,args:this.args}));}
}

const db={
  prepare:(sql:string)=>new Statement(sql),
  // Executa todas as instruções numa única transação, como o batch do D1.
  async batch(statements:Statement[]):Promise<RunResult[]>{const results=await getClient().batch(statements.map(s=>({sql:s.sql,args:s.args})),'write');return results.map(toResult);},
};

export function database(){return db;}
