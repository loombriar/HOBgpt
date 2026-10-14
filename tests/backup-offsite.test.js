const test=require('node:test');
const assert=require('node:assert/strict');
const {listContents,list,canonicalQuery}=require('../scripts/backup-offsite');

const xml=(body,more=false,token='')=>'<ListBucketResult>'+body+'<IsTruncated>'+more+'</IsTruncated>'+(token?'<NextContinuationToken>'+token+'</NextContinuationToken>':'')+'</ListBucketResult>';
const item=(key,date)=>'<Contents><Key>'+key+'</Key><LastModified>'+date+'</LastModified></Contents>';

test('S3 object listings keep each key with its own modification date and decode XML entities',()=>{
 const page=listContents(xml(item('house-of-briar/older/a&amp;b','2026-01-01T00:00:00.000Z')+item('house-of-briar/newer/c','2026-10-01T00:00:00.000Z')));
 assert.deepEqual(page.objects.map(o=>[o.key,o.modified.toISOString()]),[
 ['house-of-briar/older/a&b','2026-01-01T00:00:00.000Z'],
 ['house-of-briar/newer/c','2026-10-01T00:00:00.000Z']
 ]);
 assert.equal(page.truncated,false);
});

test('S3 listing fetches all pages using the returned continuation token',async()=>{
 const before=global.fetch;
 const env={...process.env,BACKUP_S3_ENDPOINT:'https://objects.example.test',BACKUP_S3_BUCKET:'backup-store',BACKUP_S3_ACCESS_KEY_ID:'test',BACKUP_S3_SECRET_ACCESS_KEY:'test'};
 const previous={};for(const [key,value] of Object.entries(env)){previous[key]=process.env[key];process.env[key]=value;}
 const queries=[];
 global.fetch=async url=>{const parsed=new URL(url);assert.equal(parsed.pathname,'/backup-store');assert.equal(parsed.search.slice(1),canonicalQuery(parsed.search.slice(1)));queries.push(parsed.searchParams.get('continuation-token'));return {ok:true,text:async()=>queries.length===1?xml(item('house-of-briar/a','2026-01-01T00:00:00Z'),true,'abc+/='):xml(item('house-of-briar/b','2026-01-02T00:00:00Z'))};};
 try{const objects=await list();assert.deepEqual(objects.map(x=>x.key),['house-of-briar/a','house-of-briar/b']);assert.deepEqual(queries,[null,'abc+/=']);}
 finally{global.fetch=before;for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('S3 listing refuses a truncated page without a continuation token',async()=>{
 const before=global.fetch;const keys=['BACKUP_S3_ENDPOINT','BACKUP_S3_BUCKET','BACKUP_S3_ACCESS_KEY_ID','BACKUP_S3_SECRET_ACCESS_KEY'];
 const values=keys.map(key=>process.env[key]);
 [process.env.BACKUP_S3_ENDPOINT,process.env.BACKUP_S3_BUCKET,process.env.BACKUP_S3_ACCESS_KEY_ID,process.env.BACKUP_S3_SECRET_ACCESS_KEY]=['https://objects.example.test','bucket','test','test'];
 global.fetch=async()=>({ok:true,text:async()=>xml(item('house-of-briar/a','2026-01-01T00:00:00Z'),true)});
 try{await assert.rejects(list(),/truncated without a continuation token/);}
 finally{global.fetch=before;keys.forEach((key,i)=>{if(values[i]===undefined)delete process.env[key];else process.env[key]=values[i];});}
});

 test('S3 signing sorts encoded query names and values and preserves continuation token bytes',()=>{
  assert.equal(canonicalQuery('list-type=2&prefix=house-of-briar%2F&continuation-token=abc%2B%2F%3D'),'continuation-token=abc%2B%2F%3D&list-type=2&prefix=house-of-briar%2F');
  assert.equal(canonicalQuery('z=a+b&a=2&a=1'),'a=1&a=2&z=a%20b');
 });
