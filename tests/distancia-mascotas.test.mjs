import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const script=readFileSync(new URL('../js/distancia-mascotas.js',import.meta.url),'utf8');
const setup=()=>new JSDOM('<p data-distance-status></p><div data-sosafe-avisos><div class="wanted-grid"><article id="far"><span hidden data-distance-lat="2" data-distance-lng="0"></span></article><article id="near"><span hidden data-distance-lat="1" data-distance-lng="0"></span></article><article id="unknown"></article></div></div>',{runScripts:'outside-only'});
test('automatically requests location, calculates km, and sorts existing and late cards',async()=>{
 const dom=setup();let calls=0;
 Object.defineProperty(dom.window.navigator,'geolocation',{value:{getCurrentPosition(ok){calls++;ok({coords:{latitude:0,longitude:0}});}}});
 dom.window.eval(script);assert.equal(calls,1);
 assert.match(dom.window.document.querySelector('#near span').textContent,/111,2 km/);
 assert.deepEqual([...dom.window.document.querySelectorAll('article')].map(c=>c.id),['near','far','unknown']);
 const next=dom.window.document.createElement('article');next.id='closest';next.append(dom.window.auraLadraDistancia.crear({latitud:0,longitud:0}));dom.window.document.querySelector('.wanted-grid').append(next);
 await new Promise(r=>setTimeout(r,10));assert.equal(dom.window.document.querySelector('article').id,'closest');
 assert.equal(dom.window.auraLadraDistancia.crear({latitud:null,longitud:null}),null);dom.window.close();
});
test('permission denied does not retry or display fabricated distances',()=>{
 const dom=setup();let calls=0;Object.defineProperty(dom.window.navigator,'geolocation',{value:{getCurrentPosition(ok,fail){calls++;fail({code:1});}}});
 dom.window.eval(script);assert.equal(calls,1);assert.equal(dom.window.document.querySelector('span').hidden,true);assert.match(dom.window.document.body.textContent,/no autorizada/);dom.window.close();
});
test('timeout retries once with fresh options and reports its exact cause',()=>{
 const dom=setup();const attempts=[];Object.defineProperty(dom.window.navigator,'geolocation',{value:{getCurrentPosition(ok,fail,options){attempts.push(options);fail({code:3});}}});
 dom.window.eval(script);assert.equal(attempts.length,2);assert.equal(attempts[1].enableHighAccuracy,true);assert.equal(dom.window.document.querySelector('[data-distance-status]').dataset.locationState,'3');dom.window.close();
});
test('age uses Chile calendar days and never calls publication an unconfirmed sighting',()=>{
 const dom=setup();dom.window.eval(readFileSync(new URL('../js/antiguedad-avisos.js',import.meta.url),'utf8'));
 const age=dom.window.auraLadraAntiguedad;const now=new Date('2026-11-09T01:00:00Z');
 assert.equal(age({tipo_aviso:'perdida',fecha_extravio_info:{fecha:'2026-11-06',precision:'estimada'}},now),'Perdido · ≈ 2 días');
 assert.equal(age({tipo_aviso:'encontrada',publicado_en:'2026-11-08T12:00:00-03:00'},now),'Anuncio · hoy');
 assert.equal(age({tipo_aviso:'encontrada',fecha_avistamiento:'2026-11-07'},now),'Avistado · 1 día');
 dom.window.close();
});
