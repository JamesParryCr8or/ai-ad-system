import test from 'node:test';
import assert from 'node:assert/strict';
import lead from '../api/free-software-lead.js';
import book from '../api/ghl-book.js';

const body = { name: 'Alex Example', email: 'alex@example.test', phone: '+44 7700 900123', consent: true, attribution: { utm_source: 'meta', utm_campaign: 'free-stack' } };
const response = () => ({ statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(code) { this.statusCode=code; return this; }, json(value) { this.body=value; return this; } });
const request = (data=body) => ({ method:'POST', headers:{origin:'https://scale.cr8or.ai',host:'scale.cr8or.ai'}, body:data });
const nativeFetch=global.fetch;
const previousToken=process.env.GHL_API_KEY;
test.afterEach(() => { global.fetch=nativeFetch; if(previousToken === undefined) delete process.env.GHL_API_KEY; else process.env.GHL_API_KEY=previousToken; });

test('invalid and cross-origin submissions never write to CRM', async () => {
  global.fetch=()=>{throw new Error('Unexpected upstream request');};
  for(const data of [null,{...body,email:'bad'},{...body,phone:'-------'},{...body,consent:false},{...body,website:'spam.test'}]) {
    const res=response(); await lead(request(data),res); assert.equal(res.statusCode,400);
  }
  const req=request();req.headers.origin='https://unrelated.test';const res=response();await lead(req,res);assert.equal(res.statusCode,403);
});
test('capture uses upsert, preserves existing tags, and records campaign consent', async () => {
  process.env.GHL_API_KEY='test-token'; const calls=[];
  global.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify({contact:{id:'existing-contact'}}),{status:200});};
  const res=response(); await lead(request(),res);
  assert.equal(res.body.success,true);assert.equal(calls.length,3);
  assert.match(calls[0].url,/\/contacts\/upsert$/);assert.equal(calls[0].body.tags,undefined);
  assert.equal(calls[0].body.email,body.email);
  assert.deepEqual(calls.find(c=>c.url.endsWith('/tags')).body.tags,['cr8or-free-software']);
  const note=calls.find(c=>c.url.endsWith('/notes')).body.body;
  assert.match(note,/utm_source: meta/);assert.match(note,/Contact permission:/);
  assert.equal(res.body.contactId,undefined);
});
test('a CRM failure cannot produce a successful opt-in', async () => {
  process.env.GHL_API_KEY='test-token';
  global.fetch=async()=>new Response(JSON.stringify({message:'upstream unavailable'}),{status:503});
  const res=response();await lead(request(),res);assert.equal(res.statusCode,503);assert.equal(res.body.success,undefined);
});
test('metadata failures do not lose a contact already saved', async () => {
  process.env.GHL_API_KEY='test-token';
  global.fetch=async url=>new Response(JSON.stringify(url.endsWith('/upsert')?{contact:{id:'saved'}}:{message:'failure'}),{status:url.endsWith('/upsert')?200:503});
  const res=response();await lead(request(),res);assert.equal(res.body.success,true);
});
test('setup booking reuses the lead via upsert and keeps the setup purpose', async () => {
  process.env.GHL_API_KEY='test-token';const slot=new Date(Date.now()+86400000*2).toISOString();const calls=[];
  global.fetch=async(url,options)=>{
    const data=options.body?JSON.parse(options.body):null;calls.push({url,data});
    const result=url.includes('free-slots')?{[slot.slice(0,10)]:{slots:[slot]}}:url.endsWith('/upsert')?{contact:{id:'lead-1'}}:{id:'appointment-1',startTime:slot};
    return new Response(JSON.stringify(result),{status:200});
  };
  const res=response();await book(request({firstName:'Alex',lastName:'',phone:body.phone,email:body.email,consent:true,bookingPurpose:'free-software',startTime:slot,calendarId:'vgGPyGGNGNmBGXwGNDHM'}),res);
  assert.equal(res.body.success,true);assert.match(calls[1].url,/\/upsert$/);assert.equal(calls[1].data.source,undefined);
  const appointment=calls[2].data;assert.equal(appointment.contactId,'lead-1');assert.match(appointment.title,/Growth Stack Setup/);
});
