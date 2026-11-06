import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const code=readFileSync(new URL('../js/afiche-lector.js',import.meta.url),'utf8');
function setup() {
 const dom=new JSDOM('<dialog><form><input name="nombre" maxlength="120"><input name="celular"><input name="domicilio"><input name="zona"><input name="especie"><input name="fuente"><input name="fecha_extravio" max="2026-11-06"><textarea name="descripcion"></textarea><button type="submit">Publicar</button></form></dialog>',{runScripts:'outside-only'});
 dom.window.eval(code); return dom;
}
test('Extrae campos explícitos y teléfono chileno sin inventar datos',()=>{
 const dom=setup();try {
 const p=dom.window.auraLadraAfiche.parse('SOSAFE\nNombre: Luna\nGatita perdida\nTeléfono: +56 9 1234 5678\nDomicilio: Calle Prueba 123\nZona: Maipú\nFecha de extravío: 04/11/2026');
 assert.equal(p.nombre,'Luna');assert.equal(p.celular,'+56912345678');assert.equal(p.domicilio,'Calle Prueba 123');assert.equal(p.zona,'Maipú');assert.equal(p.fecha_extravio,'2026-11-04');assert.equal(p.especie,'Gato');assert.equal(p.fuente,'SOSAFE');
 const missing=dom.window.auraLadraAfiche.parse('Se perdió cerca de la plaza');assert.equal(missing.domicilio,undefined);assert.equal(missing.celular,undefined);
 assert.equal(dom.window.auraLadraAfiche.parse('Fecha: 31/02/2026').fecha_extravio,undefined);
 }finally{dom.window.close();}
});
test('Completa solo campos vacíos, omite fecha futura y no publica',()=>{
 const dom=setup();try {
 const w=dom.window,f=w.document.querySelector('form');w.auraLadraAfiche.attach(f,w.document.querySelector('dialog'));f.elements.nombre.value='Corregido';let submits=0;f.addEventListener('submit',()=>submits++);
 f.querySelector('[data-ocr-text]').value='Nombre: Otro\nZona: Maipú\nFecha: 01/01/2099';f.querySelector('[data-ocr-apply]').click();
 assert.equal(f.elements.nombre.value,'Corregido');assert.equal(f.elements.zona.value,'Maipú');assert.equal(f.elements.fecha_extravio.value,'');assert.equal(submits,0);
 }finally{dom.window.close();}
});
test('Lectura, error y cancelación liberan el formulario e ignoran resultados tardíos',async()=>{
 const dom=setup();try{
 const w=dom.window,f=w.document.querySelector('form');let resolve,terminated=0;
 w.Tesseract={createWorker:async()=>({recognize:()=>new Promise(r=>resolve=r),terminate:async()=>terminated++})};
 w.auraLadraAfiche.attach(f,w.document.querySelector('dialog'));
 Object.defineProperty(f.querySelector('[data-ocr-file]'),'files',{value:[new w.File(['image'],'afiche.png',{type:'image/png'})]});
 const tick=()=>new Promise(r=>setTimeout(r,0));
 f.querySelector('[data-ocr-read]').click();await tick();assert.equal(f.querySelector('[type=submit]').disabled,true);
 f.querySelector('[data-ocr-cancel]').click();resolve({data:{text:'Nombre: Tardío'}});await tick();assert.equal(f.querySelector('[data-ocr-text]').value,'');assert.equal(terminated,1);
 f.querySelector('[data-ocr-read]').click();await tick();resolve({data:{text:'Nombre: Luna'}});await tick();assert.equal(f.querySelector('[data-ocr-text]').value,'Nombre: Luna');assert.equal(f.querySelector('[type=submit]').disabled,false);
 w.Tesseract.createWorker=async()=>{throw Error('offline');};f.querySelector('[data-ocr-read]').click();await tick();assert.match(f.querySelector('[data-ocr-status]').textContent,/No se pudo/);assert.equal(f.dataset.ocrReading,'false');
 }finally{dom.window.close();}
});
