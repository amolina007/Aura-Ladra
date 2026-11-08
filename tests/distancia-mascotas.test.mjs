import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const script=readFileSync(new URL('../js/distancia-mascotas.js',import.meta.url),'utf8');
const setup=()=>new JSDOM('<button data-use-location>Usar mi ubicación</button><p data-distance-status></p><span hidden data-distance-lat="1" data-distance-lng="0"></span>',{runScripts:'outside-only'});
test('only requests location on click and computes distance locally for current and later cards',async()=>{
 const dom=setup();let calls=0;
 Object.defineProperty(dom.window.navigator,'geolocation',{value:{getCurrentPosition(ok){calls++;ok({coords:{latitude:0,longitude:0}});}}});
 dom.window.eval(script);assert.equal(calls,0);
 dom.window.document.querySelector('button').click();assert.equal(calls,1);
 const badge=dom.window.document.querySelector('span');assert.match(badge.textContent,/111,2 km/);assert.equal(badge.hidden,false);
 const next=dom.window.auraLadraDistancia.crear({latitud:0,longitud:0});dom.window.document.body.append(next);
 await new Promise(r=>setTimeout(r,10));assert.equal(next.textContent,'0,0 km');
 assert.equal(dom.window.auraLadraDistancia.crear({latitud:null,longitud:null}),null);dom.window.close();
});
test('permission denied leaves distances hidden and enables retry',()=>{
 const dom=setup();Object.defineProperty(dom.window.navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1});}}});
 dom.window.eval(script);dom.window.document.querySelector('button').click();
 assert.equal(dom.window.document.querySelector('span').hidden,true);assert.match(dom.window.document.body.textContent,/no concedido/);assert.equal(dom.window.document.querySelector('button').disabled,false);dom.window.close();
});
