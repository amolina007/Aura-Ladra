"""Solo publica fichas con imagen local disponible; los pendientes quedan en caché."""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]

def publicables(rows):
    return [row for row in rows if row.get('tipo_aviso') != 'reencuentro' and re.fullmatch(r'data/sosafe-fotos/[a-f0-9]+\.(?:jpg|png)', row.get('foto_mascota', ''))
            and (ROOT / row['foto_mascota']).is_file()]
