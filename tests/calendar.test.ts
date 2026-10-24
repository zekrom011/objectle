import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=resolve('.'),fixtures:{dir:string;child:ChildProcess}[]=[];
async function fixture(production=false){
 const dir=mkdtempSync(join(tmpdir(),'objectle-calendar-'));
 const port=await new Promise<number>((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=(s.address() as {port:number}).port;s.close(()=>resolve(p));});});
 const setTime=(value:string)=>writeFileSync(join(dir,'clock.txt'),value);
 setTime('2026-10-24T16:00:00.000Z');
 writeFileSync(join(dir,'clock.mjs'),`import {readFileSync} from 'node:fs';const RealDate=Date;globalThis.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[readFileSync(${JSON.stringify(join(dir,'clock.txt'))},'utf8')]));}static now(){return new RealDate(readFileSync(${JSON.stringify(join(dir,'clock.txt'))},'utf8')).getTime();}};`);
 mkdirSync(join(dir,'content/scenarios'),{recursive:true});mkdirSync(join(dir,'content/schedule'),{recursive:true});
 const bank=Array.from({length:10},(_,i)=>({id:`calendar-${i}`,difficulty:'easy',setting:'Civil trial: the speaker is not a party and no hearsay exception applies.',examiner:"plaintiff's counsel",transcript:[{speaker:'Q',text:`What did witness ${i} say?`},{speaker:'A',text:'She said the floor was wet.'}],options:['Hearsay','Relevance','Leading question','No objection'],correct:'Hearsay',rule:'FRE 802',explanation:'The statement is offered for its truth without an exception.',trap_note:'The question does not suggest an answer.',concept_tag:'hearsay',reviewed:!production}));
 writeFileSync(join(dir,'content/scenarios/batch.json'),JSON.stringify(bank));
 const dates=['2026-03-07','2026-03-08','2026-03-09','2026-10-23','2026-10-24','2026-10-25','2026-10-26','2026-10-27','2026-10-31','2026-11-01','2026-11-02'];
 writeFileSync(join(dir,'content/schedule/schedule.json'),JSON.stringify(Object.fromEntries(dates.map((date,i)=>[date,bank.slice(i%2*5,i%2*5+5).map(s=>s.id)]))));
 let logs='';const child=spawn(process.execPath,['--import',join(dir,'clock.mjs'),'--import',join(root,'node_modules/tsx/dist/loader.mjs'),join(root,'server/index.ts')],{cwd:dir,env:{...process.env,PORT:String(port),DATABASE_PATH:join(dir,'test.sqlite'),ALLOW_UNREVIEWED:'true',NODE_ENV:production?'production':'test',RESET_TIMEZONE:'America/New_York',LAUNCH_DATE:'2026-03-07'}});fixtures.push({dir,child});child.stdout?.on('data',d=>logs+=d);child.stderr?.on('data',d=>logs+=d);
 async function call(path:string,cookie='',body?:unknown){const r=await fetch(`http://127.0.0.1:${port}/api/${path}`,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie};}
 for(let i=0;i<100;i++){try{await call('health');return{call,setTime};}catch{await new Promise(r=>setTimeout(r,100));}}throw Error(logs);
}
let server:Awaited<ReturnType<typeof fixture>>;
beforeAll(async()=>{server=await fixture()},15000);
afterAll(async()=>{for(const f of fixtures)f.child.kill();await new Promise(r=>setTimeout(r,100));for(const f of fixtures)rmSync(f.dir,{recursive:true,force:true});});
async function finish(p:any,cookie:string){for(const q of p.questions){const answer=await server.call('answer',cookie,{sessionId:p.sessionId,questionId:q.id,answer:'Hearsay'});expect(answer.status).toBe(200);}const result=await server.call('submit-daily',cookie,{sessionId:p.sessionId});expect(result.status).toBe(200);return result.body;}
describe('server calendar and progression',()=>{
 it.each([
 ['2026-03-08T04:59:59.000Z','2026-03-07','2026-03-08T05:00:00.000Z'],
 ['2026-03-08T05:00:00.000Z','2026-03-08','2026-03-09T04:00:00.000Z'],
 ['2026-11-01T04:00:00.000Z','2026-11-01','2026-11-02T05:00:00.000Z'],
 ['2026-11-02T04:59:59.000Z','2026-11-01','2026-11-02T05:00:00.000Z'],
 ['2026-11-02T05:00:00.000Z','2026-11-02','2026-11-03T05:00:00.000Z'],
 ])('uses New York date and midnight at %s',async(now,date,next)=>{server.setTime(now);const r=await server.call('today');expect(r.status).toBe(200);expect(r.body.date).toBe(date);expect(r.body.nextResetAt).toBe(next);});
 it('increments daily streaks, preserves longest, resets missed days, isolates archive and practice',async()=>{
 server.setTime('2026-10-24T16:00:00.000Z');const a=await server.call('today');await server.call('handle',a.cookie,{handle:'CalendarCounsel'});let result=await finish(a.body,a.cookie);expect(result.streak).toBe(1);expect(result.careerCorrect).toBe(5);
 server.setTime('2026-10-25T16:00:00.000Z');const next=await server.call('today',a.cookie);result=await finish(next.body,a.cookie);expect(result.streak).toBe(2);expect(result.longestStreak).toBe(2);expect(result.careerCorrect).toBe(10);
 server.setTime('2026-10-27T16:00:00.000Z');let stats=await server.call('stats',a.cookie);expect(stats.body.streak).toBe(0);expect(stats.body.longestStreak).toBe(2);
 const archive=await server.call('archive?date=2026-10-26',a.cookie);result=await finish(archive.body,a.cookie);expect(result.streak).toBe(0);expect(result.careerCorrect).toBe(10);
 const practice=await server.call('practice',a.cookie,{tag:'hearsay'});expect(practice.status).toBe(200);result=await finish(practice.body,a.cookie);expect(result.streak).toBe(0);expect(result.longestStreak).toBe(2);expect(result.careerCorrect).toBe(10);stats=await server.call('stats',a.cookie);expect(stats.body.concepts[0].total).toBe(20);
 const board=await server.call('leaderboard?type=alltime',a.cookie);expect(board.body.entries.find((p:any)=>p.handle==='CalendarCounsel').careerCorrect).toBe(10);
 const current=await server.call('today',a.cookie);result=await finish(current.body,a.cookie);expect(result.streak).toBe(1);expect(result.longestStreak).toBe(2);expect(result.careerCorrect).toBe(15);
 });
 it('production refuses unreviewed scenarios even with ALLOW_UNREVIEWED=true',async()=>{const prod=await fixture(true);const r=await prod.call('today');expect(r.status).toBe(404);expect(r.body.error.message).toContain('reviewed');expect(r.body).not.toHaveProperty('questions');},15000);
});
