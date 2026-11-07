"""OCR y detección local. Entrada original, salida de recorte y JSON a stdout."""
import csv
import io
import json
import os
import pathlib
import subprocess
import sys
import contextlib

os.environ['YOLO_CONFIG_DIR'] = '/tmp/ladra-yolo-settings'
os.environ['MPLCONFIGDIR'] = '/tmp/ladra-matplotlib'
from PIL import Image, ImageOps

source, target = map(pathlib.Path, sys.argv[1:3])
with Image.open(source) as original:
    image = ImageOps.exif_transpose(original).convert('RGB')
image.thumbnail((2400,2400))
work = source.with_suffix('.ocr.png')
image.save(work)
try:
    completed = subprocess.run(['/opt/homebrew/bin/tesseract', str(work), 'stdout', '--tessdata-dir', str(pathlib.Path(__file__).resolve().parents[1] / 'output/sosafe/tessdata'), '-l', 'spa+eng', '--psm', '11', '-c', 'tessedit_create_tsv=1'], capture_output=True, text=True, errors="replace", check=False, timeout=35)
    if completed.returncode:
        raise RuntimeError(completed.stderr[:1200])
    groups = {}
    for word in csv.DictReader(io.StringIO(completed.stdout), delimiter='\t'):
        if not word.get('text','').strip() or float(word['conf']) < 0:
            continue
        key = (word['block_num'],word['par_num'],word['line_num'])
        groups.setdefault(key, []).append(word)
    lines = []
    for words in groups.values():
        left=min(int(w['left']) for w in words); top=min(int(w['top']) for w in words)
        right=max(int(w['left'])+int(w['width']) for w in words); bottom=max(int(w['top'])+int(w['height']) for w in words)
        lines.append({'text':' '.join(w['text'] for w in words),'confidence':min(float(w['conf']) for w in words)/100,'box':[left,top,right,bottom]})
    with contextlib.redirect_stdout(sys.stderr):
        from ultralytics import YOLO
        model = YOLO(str(pathlib.Path(__file__).resolve().parents[1] / 'output/sosafe/yolo11n.pt'))
        result = model(image, device='cpu', classes=[15,16], conf=0.5, verbose=False)[0]
    boxes = result.boxes.xyxy.tolist()
    output = {'lines':lines, 'animal_count':len(boxes), 'crop_status':'pendiente'}
    if boxes:
        x1=min(b[0] for b in boxes); y1=min(b[1] for b in boxes)
        x2=max(b[2] for b in boxes); y2=max(b[3] for b in boxes)
        crop=[max(0,x1-10),max(0,y1-10),min(image.width,x2+10),min(image.height,y2+10)]
        overlap=False
        for line in lines:
            text=line['text'].lower().replace(' ','')
            if 'sosafe' not in text and 'reportado' not in text:
                continue
            a,b,c,d=line['box']; a-=8;b-=8;c+=8;d+=8
            if crop[0]<c and crop[2]>a and crop[1]<d and crop[3]>b:
                if b>=y2:crop[3]=min(crop[3],b)
                elif d<=y1:crop[1]=max(crop[1],d)
                elif a>=x2:crop[2]=min(crop[2],a)
                elif c<=x1:crop[0]=max(crop[0],c)
                else:overlap=True
        if not overlap and crop[2]-crop[0]>60 and crop[3]-crop[1]>60:
            image.crop(tuple(map(int,crop))).save(target,quality=88)
            output['crop_status']='recortada';output['crop_box']=crop
        elif overlap:output['crop_status']='logo_sobre_mascota'
    print(json.dumps(output,ensure_ascii=False))
finally:
    work.unlink(missing_ok=True)
