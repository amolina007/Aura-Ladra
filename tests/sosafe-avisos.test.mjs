import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const script=readFileSync(new URL('../js/sosafe-avisos.js',import.meta.url),'utf8');
test('shows verified dates, safe photo and contact, escapes text and excludes expired notices', async()=>{
 const dom=new JSDOM('<div data-sosafe-avisos></div>',{runScripts:'outside-only'});
 const now=new Date().toISOString();
 const row={fecha_extravio_info:{fecha:'2026-11-02',precision:'estimada',criterio:'primera publicacion disponible'},foto_mascota:'data/sosafe-fotos/abc123.png',ubicacion_reporte:{lat:-33.51,lng:-70.76},lectura_foto:{estado:'leida',celulares:['+56987654321'],nombres:[{etiqueta:'Contacto',nombre:'Ana'}]},publicado_en:now,descripcion:'<img src=x onerror=alert(1)>',zona:'Maipú',autor_publicacion:'Vecina',foto:'https://api.sosafeapp.com/reports/test.jpg',fuente_url:'https://www.widgets.sosafeapp.com/report/test',celulares:['+56912345678','javascript:bad']};
 dom.window.fetch=async()=>({ok:true,json:async()=>({actualizado_en:now,cobertura:'Parcial',avisos:[row,{...row,publicado_en:'2020-01-01',descripcion:'Old'}]})});
 dom.window.eval(script); await new Promise(r=>setTimeout(r,10));
 const doc=dom.window.document;
 assert.equal(doc.querySelectorAll('article').length,1);
 assert.equal(dom.window.auraLadraSosafe.lugares().length,1);
 assert.equal(dom.window.auraLadraSosafe.lugares()[0].categoria,'mascota_perdida');
 assert.match(doc.body.textContent,/Leído del afiche/);
 assert.match(doc.body.textContent,/Contacto: Ana/);
 assert.equal(doc.querySelector('a[href="tel:+56987654321"]'),null);
 assert.equal(doc.querySelectorAll('img').length,1);
 assert.equal(doc.querySelector('img').getAttribute('src'),'data/sosafe-fotos/abc123.png');
 assert.equal(doc.querySelector('a[href^="tel:"]').getAttribute('href'),'tel:+56912345678');
 assert.match(doc.body.textContent,/Publicado por: Vecina/);
 assert.match(doc.body.textContent,/Extravío: 02\/11\/2026 · estimada por la primera publicación/);
 assert.match(dom.window.auraLadraSosafe.lugares()[0].fecha_extravio_texto,/estimada/);
 assert.equal(doc.querySelector('[onerror]'),null);
 doc.querySelector('img').dispatchEvent(new dom.window.Event('error'));
 assert.match(doc.body.textContent,/foto no está disponible/);
 dom.window.close();
});

test('only reviewed local photos reach cards and map; raw posters never replace them', async()=>{
 const dom=new JSDOM('<div data-sosafe-avisos></div>',{runScripts:'outside-only'});
 const now=new Date().toISOString();
 const row={id:'poster',publicado_en:now,descripcion:'Aviso',zona:'Maipú',celulares:[],ubicacion_reporte:{lat:-33.51,lng:-70.76},foto_mascota:'data/sosafe-fotos/abc123.jpg',foto:'https://api.sosafeapp.com/reports/real.jpg'};
 dom.window.fetch=async()=>({ok:true,json:async()=>({actualizado_en:now,cobertura:'Parcial',avisos:[row,{...row,id:'missing',foto_mascota:''},{...row,id:'unsafe',foto_mascota:'https://example.com/private.jpg'},{...row,id:'no-photo',foto:'',foto_mascota:''}]})});
 dom.window.eval(script);await new Promise(r=>setTimeout(r,10));
 assert.equal(dom.window.document.querySelectorAll('article').length,1);
 assert.equal(dom.window.document.querySelector('img').getAttribute('src'),row.foto_mascota);
 assert.equal(dom.window.auraLadraSosafe.lugares().length,1);
 assert.equal(dom.window.document.querySelector('a[href="'+row.foto+'"]').textContent,'Ver afiche original completo');
 dom.window.close();
});

test('one consolidated card retains additional descriptions and safe source links', async()=>{
 const dom=new JSDOM('<div data-sosafe-avisos></div>',{runScripts:'outside-only'});
 const now=new Date().toISOString();const row={id:'group',foto_mascota:'data/sosafe-fotos/abc123.jpg',publicado_en:now,descripcion:'Ficha principal',zona:'Maipú',celulares:[],publicaciones:[{publicado_en:now,descripcion:'Collar azul',fuente_url:'https://www.widgets.sosafeapp.com/report/a'},{publicado_en:now,descripcion:'Visto en el parque',fuente_url:'javascript:bad'}]};
 dom.window.fetch=async()=>({ok:true,json:async()=>({actualizado_en:now,cobertura:'Parcial',avisos:[row]})});
 dom.window.eval(script);await new Promise(r=>setTimeout(r,10));
 const doc=dom.window.document;assert.equal(doc.querySelectorAll('article').length,1);
 assert.match(doc.querySelector('summary').textContent,/2 publicaciones reunidas/);
 assert.match(doc.querySelector('details').textContent,/Collar azul/);
 assert.match(doc.querySelector('details').textContent,/Visto en el parque/);
 assert.equal(doc.querySelectorAll('details a').length,1);dom.window.close();
});
