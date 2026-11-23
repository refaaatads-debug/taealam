import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const password=crypto.randomBytes(24).toString('hex');
const server=new EmbeddedPostgres({databaseDir:'/tmp/voice-postgres-staging/db-'+crypto.randomUUID(),user:'postgres',password,port:55439,persistent:false,autoRehydrateSymlinks:true,onLog:()=>{},onError:()=>{}});
let pool;
try{
 await server.initialise();await server.start();pool=new pg.Pool({host:'127.0.0.1',port:55439,user:'postgres',password,database:'postgres',max:32});pool.on('error',()=>{});
 await pool.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE public.profiles(user_id uuid,account_status text,is_deleted boolean); CREATE TABLE public.user_roles(user_id uuid,role text); CREATE TABLE public.subscription_plans(id uuid,tier text); CREATE TABLE public.user_subscriptions(user_id uuid,plan_id uuid,is_active boolean,remaining_minutes numeric);`);
 await pool.query(fs.readFileSync(new URL('../../supabase/migrations/20261123_live_voice_daily_preview.sql',import.meta.url),'utf8'));
 const fn=(await pool.query(`SELECT pg_get_functiondef('public.reserve_live_voice(uuid,text)'::regprocedure) AS s`)).rows[0].s;
 await pool.query(fn.replace('clock_timestamp()',`'2026-11-23T09:00:00Z'::timestamptz`));
 const uid=crypto.randomUUID(),plan=crypto.randomUUID();
 await pool.query('INSERT INTO auth.users VALUES($1)',[uid]);await pool.query("INSERT INTO profiles VALUES($1,'active',false)",[uid]);await pool.query("INSERT INTO user_roles VALUES($1,'student')",[uid]);await pool.query("INSERT INTO subscription_plans VALUES($1,'premium')",[plan]);await pool.query('INSERT INTO user_subscriptions VALUES($1,$2,true,100)',[uid,plan]);
 for(let round=0;round<1;round++){
  const results=await Promise.all(Array.from({length:32},()=>pool.query('SELECT reserve_live_voice($1) AS r',[uid])));
  assert.equal(results.filter(r=>r.rows[0].r.allowed).length,1,'exactly one grant per 32 concurrent requests');
  await pool.query("UPDATE live_voice_reservations SET blocked_until='2020-01-01'");
 }
 const results=await Promise.all(Array.from({length:32},()=>pool.query('SELECT reserve_live_voice($1) AS r',[uid])));
 assert(results.every(r=>r.rows[0].r.reason==='daily_limit'));
 assert.equal((await pool.query('SELECT reserved_seconds FROM live_voice_days')).rows[0].reserved_seconds,300);
 await pool.query("UPDATE live_voice_reservations SET blocked_until=clock_timestamp()+interval '10minutes', created_at=clock_timestamp()");
 const rid=(await pool.query('SELECT id FROM live_voice_reservations LIMIT 1')).rows[0].id;
 assert((await pool.query("SELECT bind_live_voice($1,'conv_stress') AS r",[rid])).rows[0].r);
 const settlement=await Promise.all(Array.from({length:32},()=>pool.query("SELECT settle_live_voice('conv_stress',100) AS r")));
 assert.equal(settlement.filter(r=>!r.rows[0].r.duplicate).length,1);
 assert.equal((await pool.query('SELECT reserved_seconds FROM live_voice_days')).rows[0].reserved_seconds,100);
 console.log('REAL_POSTGRES_PASS: 32 parallel connections x 1 reservation round,32 budget denials,32 duplicate settlements; exactly300 held and one refund.');
 console.log('POSTGRES_VERSION', (await pool.query('SELECT version() AS v')).rows[0].v.split(' on ')[0]);
}finally{if(pool){await pool.end();await new Promise(r=>setTimeout(r,100));}await server.stop();}
