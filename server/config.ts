import fs from 'node:fs';if(fs.existsSync('.env'))process.loadEnvFile('.env');
export const launch=process.env.LAUNCH_DATE||'2026-10-24';export const timezone=process.env.RESET_TIMEZONE||'America/New_York';
export const careerRanks=[{threshold:500,title:'Chief Justice'},{threshold:100,title:'Litigator'},{threshold:25,title:'Associate'},{threshold:0,title:'Law Clerk'}];export const scoreTitles=['Bailiff','Bailiff','Law Clerk','Associate','Litigator','Chief Justice'];
export function calendarDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}export const today=()=>calendarDate();export const days=(a:string,b:string)=>Math.round((Date.parse(a)-Date.parse(b))/86400000);
export function nextReset(now=Date.now()){const date=calendarDate(new Date(now));let end=now;while(calendarDate(new Date(end))===date)end+=60000;return new Date(Math.floor(end/60000)*60000).toISOString();}
