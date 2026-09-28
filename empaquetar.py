"""Genera el ZIP que se sube a la Chrome Web Store: dist/nueva-interfaz-sakai-<versión>.zip"""
import json
import zipfile
from pathlib import Path

root = Path(__file__).parent
ext = root / 'poliformat-classroom'
version = json.loads((ext / 'manifest.json').read_text(encoding='utf-8'))['version']
dist = root / 'dist'
dist.mkdir(exist_ok=True)
out = dist / f'nueva-interfaz-sakai-{version}.zip'

# Solo lo que necesita la extensión (sin el README).
files = ['manifest.json', 'content.js', 'app.css', 'boot.css', 'popup.html', 'popup.js']
files += [f'icons/{p.name}' for p in sorted((ext / 'icons').glob('*.png'))]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(ext / f, f)  # rutas con "/" como exige la tienda
print(f'Creado: {out}')
