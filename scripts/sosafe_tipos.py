"""Distingue búsqueda de mascota de hallazgo; nunca infiere propiedad del autor."""
import hashlib
import re
import unicodedata

def signature(row):
    return hashlib.sha256(row.get('descripcion', '').encode()).hexdigest()

def classify(row, revisions):
    review = revisions.get(row['id'], {}).get('tipo_aviso', {})
    if review.get('descripcion_sha256') == signature(row):
        return review['valor']
    text = ''.join(c for c in unicodedata.normalize('NFD', row.get('descripcion','').lower()) if unicodedata.category(c) != 'Mn')
    if re.search(r'familia encontrada|ya (?:volvio|regreso) a casa|ya aparecio su duen', text):
        return 'reencuentro'
    if re.search(r'\bfalleci(?:o|do|da)\b|se encuentra muert[oa]', text):
        return 'fallecida'
    lost = bool(re.search(r'se (?:me |nos )?(?:perdio|extravio|escapo)|busco (?:a )?mi |buscando a (?:mi|nuestro|nuestra)|se busca(?:n)?\b|no llega.{0,30}(?:casa|hogar)|su familia.{0,20}buscando|si (?:lo|la) ven', text))
    found = bool(re.search(r'\bencontre\b|\bencontramos\b|me pille|aparecio este|busca(?:mos|n)? a sus duenos|buscamos al tutor|anda (?:por|este)|no (?:lo|la) puedo retener|sera de alguien|parece perdido|alguien lo reconoce', text))
    if lost and found: return 'por_confirmar'
    if lost: return 'perdida'
    if found: return 'encontrada'
    return 'por_confirmar'
