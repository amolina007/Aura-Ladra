"""Consolida evidencia de una mascota; conserva cada publicación para revalidarla."""
import copy
import json
import pathlib
import re
import unicodedata
from difflib import SequenceMatcher
ROOT = pathlib.Path(__file__).resolve().parents[1]

def norm(value):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFD', str(value).lower()) if unicodedata.category(c) != 'Mn').split())

def expand(rows):
    result = {}
    for row in rows:
        for source in row.get('publicaciones', [row]):
            result[source['id']] = copy.deepcopy(source)
    return list(result.values())

def consolidate(rows, rules=None):
    rows = sorted(expand(rows), key=lambda r: r['id'])
    if rules is None:
        path=ROOT/'data/sosafe-duplicados.json'
        rules=json.loads(path.read_text()) if path.exists() else []
    parent=list(range(len(rows)))
    def find(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]];i=parent[i]
        return i
    def join(i,j): parent[find(j)]=find(i)
    ids={r['id']:i for i,r in enumerate(rows)}
    for rule in rules:
        indexes=[ids[x] for x in rule['ids'] if x in ids]
        for i in indexes[1:]:join(indexes[0],i)
    hashes={}; urls={}
    for i,row in enumerate(rows):
        for value,seen in [(row.get('imagen_original_sha256'),hashes),(row.get('foto'),urls)]:
            if value:
                if value in seen:join(i,seen[value])
                else:seen[value]=i
    for i,a in enumerate(rows):
        for j in range(i):
            b=rows[j]
            shared=set(a.get('celulares',[])) & set(b.get('celulares',[]))
            # Un teléfono solo, o un nombre solo, nunca identifica una mascota.
            if not shared:continue
            na,nb=norm(a.get('nombre_mascota','')),norm(b.get('nombre_mascota',''))
            explicit_name=bool(na and na==nb and na not in {'mascota','sin nombre'})
            similar=SequenceMatcher(None,norm(a.get('descripcion','')),norm(b.get('descripcion',''))).ratio()>=.88
            known=any(rule.get('nombre') and re.search(r'\b'+re.escape(norm(rule['nombre']))+r'\b',norm(a.get('descripcion',''))) and re.search(r'\b'+re.escape(norm(rule['nombre']))+r'\b',norm(b.get('descripcion',''))) for rule in rules)
            if explicit_name or similar or known:join(i,j)
    groups={}
    for i,row in enumerate(rows):groups.setdefault(find(i),[]).append(row)
    output=[]
    for group in groups.values():
        def score(r):
            return (bool(r.get('celulares')),bool(r.get('foto')),len(r.get('descripcion','')),bool(r.get('foto_mascota')),r.get('publicado_en',''),r['id'])
        best=copy.deepcopy(max(group,key=score))
        if len(group)>1:
            best['publicaciones']=sorted(group,key=lambda r:(r.get('publicado_en',''),r['id']),reverse=True)
            best['celulares']=sorted({p for r in group for p in r.get('celulares',[])})
            if not best.get('nombre_mascota'):
                best['nombre_mascota']=next((r['nombre_mascota'] for r in group if r.get('nombre_mascota')), '')
            best['ultima_publicacion_en']=max(r['publicado_en'] for r in group)
            reading=best.setdefault('lectura_foto',{})
            reading['celulares']=sorted({p for r in group for p in r.get('lectura_foto',{}).get('celulares',[])})
            names={json.dumps(n,sort_keys=True,ensure_ascii=False):n for r in group for n in r.get('lectura_foto',{}).get('nombres',[])}
            reading['nombres']=list(names.values());reading['requiere_revision']=True
        output.append(best)
    return sorted(output,key=lambda r:(r.get('ultima_publicacion_en',r.get('publicado_en','')),r['id']),reverse=True)
