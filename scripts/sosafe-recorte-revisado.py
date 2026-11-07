"""Aplica únicamente un encuadre revisado y ligado al hash del original."""
import sys,json
from PIL import Image, ImageOps
source,target,rectangle=sys.argv[1:4]
with Image.open(source) as raw:
    image=ImageOps.exif_transpose(raw).convert('RGB')
a,b,c,d=json.loads(rectangle)
assert 0<=a<c<=1 and 0<=b<d<=1
image=image.crop((int(a*image.width),int(b*image.height),int(c*image.width),int(d*image.height)))
image.thumbnail((1600,1600))
image.save(target,quality=88)
