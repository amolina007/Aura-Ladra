"""Segmentación local: conserva píxeles originales, solo modifica transparencia."""
import contextlib, hashlib, json, os, pathlib, sys
os.environ['YOLO_CONFIG_DIR']='/tmp/ladra-yolo-settings'
os.environ['MPLCONFIGDIR']='/tmp/ladra-matplotlib'
import numpy as np
from PIL import Image, ImageOps
ROOT=pathlib.Path(__file__).resolve().parents[1]

def process(rows):
    from ultralytics import YOLO
    model=YOLO(str(ROOT/'output/sosafe/yolo11s-seg.pt'))
    revisions=json.loads((ROOT/'data/sosafe-revisiones.json').read_text())
    source=(ROOT/'scripts/sosafe-imagen.py').read_text()
    version=pathlib.Path(__file__).read_bytes()
    for row in rows:
        if not row.get('foto'): continue
        key=hashlib.sha256((row['foto']+source).encode()).hexdigest()[:24]
        raw=ROOT/'output/sosafe/imagenes'/f'{key}.original'
        if not raw.exists(): continue
        digest=hashlib.sha256(raw.read_bytes()).hexdigest()
        name=hashlib.sha256(raw.read_bytes()+version).hexdigest()[:24]
        target=ROOT/'data/sosafe-fotos'/f'{name}.png'
        record=ROOT/'output/sosafe/imagenes'/f'{name}.segment.json'
        row['foto_mascota']=''
        try:
            if record.exists():
                result=json.loads(record.read_text())
            else:
                im=ImageOps.exif_transpose(Image.open(raw)).convert('RGB');im.thumbnail((1600,1600))
                pred=model(im,device='cpu',classes=[15,16],conf=.6,retina_masks=True,verbose=False)[0]
                if pred.masks is None:
                    pred=model(im,device='cpu',classes=[15,16],conf=.4,imgsz=1024,retina_masks=True,verbose=False)[0]
                result={'estado':'sin_deteccion','original_sha256':digest}
                if pred.masks is not None:
                    masks=pred.masks.data.cpu().numpy()
                    # Elige la fotografía mayor del afiche; evita unir miniaturas y texto.
                    mask=masks[max(range(len(masks)),key=lambda i: masks[i].sum())]>.5
                    alpha=Image.fromarray((mask*255).astype('uint8')).resize(im.size,Image.Resampling.NEAREST)
                    arr=np.array(im); a=np.array(alpha)>0
                    # No borrar ni reconstruir un sello que toca el cuerpo del animal.
                    ocr=json.loads((raw.with_suffix('.json')).read_text())
                    blocked=False
                    for line in ocr.get('lines',[]):
                        if 'sosafe' in line['text'].lower().replace(' ','') or 'reportado' in line['text'].lower():
                            original=ImageOps.exif_transpose(Image.open(raw)); original.thumbnail((2400,2400))
                            sx=im.width/original.width;sy=im.height/original.height
                            x,y,z,w=line['box']; region=a[max(0,int(y*sy)-3):min(im.height,int(w*sy)+3),max(0,int(x*sx)-3):min(im.width,int(z*sx)+3)]
                            if region.any(): blocked=True
                    pink=(arr[:,:,0]>180)&(arr[:,:,2]>70)&(arr[:,:,1]<145)&(arr[:,:,0]>arr[:,:,1]*1.35)&a
                    if pink.sum()>max(30,a.sum()*.003): blocked=True
                    if a.sum()>1000 and alpha.getbbox():
                        out=im.convert('RGBA');out.putalpha(alpha);out=out.crop(alpha.getbbox());out.save(target)
                        result.update(estado='revision_color_o_texto' if blocked else 'sin_fondo',foto='' if blocked else 'data/sosafe-fotos/'+target.name, candidato='data/sosafe-fotos/'+target.name)
                record.write_text(json.dumps(result))
            review=revisions.get(row['id'], {}).get('segmentacion', {})
            if review.get('estado') == 'aprobada' and review.get('original_sha256') == digest and target.exists() and review.get('imagen_sha256') == hashlib.sha256(target.read_bytes()).hexdigest():
                result=dict(result, estado='sin_fondo', foto='data/sosafe-fotos/'+target.name)
            if review.get('original_sha256') == digest and target.exists() and review.get('imagen_sha256') == hashlib.sha256(target.read_bytes()).hexdigest() and review.get('estado') == 'rechazada':
                result=dict(result, estado='silueta_no_fiable', foto='')
            row['recorte_estado']=result['estado']
            row['imagen_original_sha256']=digest
            if result.get('foto') and target.exists(): row['foto_mascota']=result['foto']
        except Exception as error:
            row['recorte_estado']='segmentacion_no_disponible'
            print(str(error)[:150],file=sys.stderr)
    return rows

if __name__=='__main__':
    path=pathlib.Path(sys.argv[1]);data=json.loads(path.read_text())
    with contextlib.redirect_stdout(sys.stderr):data['avisos']=process(data['avisos'])
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
