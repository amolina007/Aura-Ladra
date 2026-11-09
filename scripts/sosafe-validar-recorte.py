"""Bandera conservadora para restos de la marca rosada en la esquina inferior."""
import sys,json
from PIL import Image
with Image.open(sys.argv[1]) as raw:
    image=raw.convert('RGB');image.thumbnail((320,320))
w,h=image.size
points=[]
for y in range(int(h*.65),h):
    for x in range(int(w*.6),w):
        r,g,b=image.getpixel((x,y))
        if r>120 and r>g*1.4 and b>g*1.15:
            points.append((x,y))
suspect=False
if len(points)>max(8,w*h*.003):
    suspect=max(x for x,y in points)-min(x for x,y in points)>w*.12 and max(y for x,y in points)-min(y for x,y in points)>h*.025
print(json.dumps({'posible_logo':suspect}))
