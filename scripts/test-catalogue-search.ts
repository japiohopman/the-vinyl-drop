import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { chromium, type Browser } from 'playwright';

const delay=(ms:number):Promise<void>=>new Promise(resolve=>setTimeout(resolve,ms));

async function verifyPerformance():Promise<void>{
 const pg=new PGlite({extensions:{pg_trgm:pg_trgm as never}});
 try{
  await pg.exec(`
   CREATE SCHEMA extensions;
   CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
   CREATE TABLE public.releases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),artist text NOT NULL);
   INSERT INTO public.releases(artist) SELECT 'Independent Artist '||n::text||' Ensemble' FROM generate_series(1,25000) AS n;
   INSERT INTO public.releases(artist) VALUES('Prince'),('Prince'),('The Prnce Band'),('Prince Jam');
   CREATE INDEX releases_artist_trgm_idx ON public.releases USING GIN(artist extensions.gin_trgm_ops);
   ANALYZE public.releases;
  `);
  const started=performance.now();
  const results=await pg.query<{artist:string;score:number}>(
   "SELECT artist,extensions.similarity(artist,'Prnce') AS score FROM public.releases WHERE artist OPERATOR(extensions.%) 'Prnce' ORDER BY score DESC,artist ASC LIMIT 8;"
  );
  const elapsedMs=Number((performance.now()-started).toFixed(2));
  if(!results.rows.some(row=>row.artist==='Prince'))throw new Error('Trigram query did not find the Prince fixture.');
  if(results.rows.length>8)throw new Error('Trigram query exceeded the eight-result bound.');
  const plan=await pg.query<{ 'QUERY PLAN':string }>(
   "EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT artist FROM public.releases WHERE artist OPERATOR(extensions.%) 'Prnce' ORDER BY extensions.similarity(artist,'Prnce') DESC LIMIT 8;"
  );
  const queryPlan=plan.rows.map(row=>row['QUERY PLAN']).join('\n');
  if(!queryPlan.includes('releases_artist_trgm_idx'))throw new Error('Planner did not use the artist GIN trigram index:\n'+queryPlan);
  console.log('[Catalogue search performance]',JSON.stringify({fixtureReleaseRows:25004,resultRows:results.rows.length,elapsedMs,index:'releases_artist_trgm_idx',queryPlan},null,2));
 }finally{await pg.close();}
}

async function verifyBrowser():Promise<void>{
 const clientScript=fs.readFileSync(path.join(process.cwd(),'public/js/catalogue-search-suggestions.js'),'utf8');
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url||'/', 'http://127.0.0.1');
  if(url.pathname==='/catalogue-search-suggestions.js'){
   res.writeHead(200,{'Content-Type':'application/javascript'});res.end(clientScript);return;
  }
  if(url.pathname==='/api/catalogue-suggestions'){
   const q=url.searchParams.get('q')||'';await delay(q==='Prnce'?420:30);
   const suggestion=q==='Prnce'
    ?{type:'artist',label:'Stale result must not appear',value:'Stale',query:'Stale'}
    :q.toLowerCase().startsWith('bj')
     ?{type:'artist',label:'Björk',value:'Björk',query:'Björk'}
     :q.toLowerCase().startsWith('xss')
      ?{type:'artist',label:'<img src=x onerror=alert(1)>',value:'safe',query:'safe'}
      :{type:'artist',label:'Prince',value:'Prince',query:'Prince'};
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({suggestions:[suggestion]}));return;
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>.catalogue-search-autocomplete{position:relative;width:100%}.catalogue-suggestions{position:absolute;top:100%;left:0;right:0;margin:0;padding:0;list-style:none;background:white;border:1px solid #777}.catalogue-suggestions[hidden]{display:none}.catalogue-suggestion-option{display:flex;justify-content:space-between;align-items:center;min-height:44px;padding:8px;cursor:pointer}.catalogue-suggestions-status{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style>
</head><body><form id="search-form"><input type="hidden" name="genre" value="Jazz"><input type="hidden" name="format" value="lp"><label for="catalogue-query">Search</label>
<div class="catalogue-search-autocomplete"><input id="catalogue-query" name="q" data-catalogue-search-input data-suggestion-url="/api/catalogue-suggestions" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="catalogue-suggestions-catalogue-query">
<ul id="catalogue-suggestions-catalogue-query" class="catalogue-suggestions" role="listbox" hidden></ul>
<p id="catalogue-suggestions-status-catalogue-query" class="catalogue-suggestions-status" role="status" aria-live="polite"></p></div><button type="submit">Search</button></form>
<script>document.getElementById('search-form').addEventListener('submit',event=>{event.preventDefault();document.body.dataset.submitted=new URLSearchParams(new FormData(event.currentTarget)).toString();});</script>
<script src="/catalogue-search-suggestions.js" defer></script></body></html>`);
 });
 let browser:Browser|undefined;
 try{
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();if(!address||typeof address==='string')throw new Error('Unable to resolve UI test server port.');
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  await page.goto('http://127.0.0.1:'+address.port);
  const input=page.locator('#catalogue-query'),list=page.getByRole('listbox');

  await input.fill('Prnce');
  await page.waitForRequest(request=>request.url().includes('q=Prnce'));
  await input.fill('Prince');
  await page.waitForResponse(response=>response.url().includes('q=Prince'));
  await page.waitForFunction(()=>document.querySelector('[role="option"]')?.textContent?.includes('Prince')===true);
  await delay(480);
  const visibleText=await list.textContent();
  if(!visibleText?.includes('Prince')||visibleText.includes('Stale result'))throw new Error('A stale suggestion response replaced the newest result.');

  await input.fill('Pr');
  await page.waitForFunction(()=>document.querySelector('[role="option"]')?.textContent?.includes('Prince')===true);
  await input.press('ArrowDown');
  if(await input.getAttribute('aria-activedescendant')===null)throw new Error('ArrowDown did not activate an accessible option.');
  await input.press('Enter');
  const submitted=await page.locator('body').getAttribute('data-submitted');
  if(!submitted?.includes('q=Prince')||!submitted.includes('genre=Jazz')||!submitted.includes('format=lp'))throw new Error('Keyboard selection did not preserve existing filters.');

  await input.fill('Bj');
  await page.waitForFunction(()=>document.querySelector('[role="option"]')?.textContent?.includes('Björk')===true);
  const option=page.getByRole('option'),box=await option.boundingBox();
  if(!box||box.height<44)throw new Error('Touch target is smaller than 44 CSS pixels.');
  await option.tap();
  const touchSubmitted=await page.locator('body').getAttribute('data-submitted');
  if(!touchSubmitted?.includes('q=Bj%C3%B6rk'))throw new Error('Touch selection did not submit canonical display text.');

  await input.fill('xss');
  await page.waitForFunction(()=>document.querySelector('[role="option"]')?.textContent?.includes('<img')===true);
  if(await list.locator('img').count()!==0)throw new Error('Untrusted suggestions were interpreted as HTML.');
  console.log('✅ Catalogue autocomplete browser verification passed: stale responses, keyboard, filter retention, touch and safe text rendering.');
 }finally{
  try{await browser?.close();}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
 }
}

async function main():Promise<void>{
 await verifyPerformance();
 await verifyBrowser();
}
if(require.main===module)main().catch(error=>{console.error('Catalogue search verification failed:',error);process.exit(1);});
