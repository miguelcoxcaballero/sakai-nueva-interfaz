"""Publica una versión nueva de la app Android «Aula Sakai».

Uso:  python publicar_android.py 1.2.0 "Qué cambia en esta versión"

1. Pone la versión en android/app/build.gradle (versionName y versionCode + 1).
2. Compila el APK firmado (necesita android/keystore.properties y la clave).
3. Crea la release «android-v1.2.0» en GitHub con el APK.
4. Actualiza android-update.json: todas las apps instaladas mostrarán la
   «Actualización obligatoria» la próxima vez que se abran (o en 15 minutos).
5. Deja el APK en la raíz del repositorio y actualiza el enlace de descarga del README.
6. Hace commit y push.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = 'miguelcoxcaballero/sakai-nueva-interfaz'
ROOT = Path(__file__).parent
GRADLE = ROOT / 'android' / 'app' / 'build.gradle'
MANIFEST = ROOT / 'android-update.json'
GH = r'C:\Program Files\GitHub CLI\gh.exe' if Path(r'C:\Program Files\GitHub CLI\gh.exe').exists() else 'gh'


def run(cmd, **kw):
    print('>', ' '.join(str(c) for c in cmd))
    subprocess.run(cmd, check=True, **kw)


def main():
    if len(sys.argv) < 2 or not re.fullmatch(r'\d+\.\d+\.\d+', sys.argv[1]):
        sys.exit('Uso: python publicar_android.py X.Y.Z "notas de la versión"')
    version = sys.argv[1]
    notes = sys.argv[2] if len(sys.argv) > 2 else f'Aula Sakai {version}'

    if not (ROOT / 'android' / 'keystore.properties').exists():
        sys.exit('Falta android/keystore.properties (la clave de firma). Sin ella no se puede publicar.')

    # 1. Versión
    text = GRADLE.read_text(encoding='utf-8')
    code = int(re.search(r'versionCode (\d+)', text).group(1))
    current = re.search(r"versionName '([^']+)'", text).group(1)
    if current != version:
        code += 1
        text = re.sub(r'versionCode \d+', f'versionCode {code}', text)
        text = re.sub(r"versionName '[^']+'", f"versionName '{version}'", text)
        GRADLE.write_text(text, encoding='utf-8')
    print(f'Versión {version} (versionCode {code})')

    # 2. Compilar
    env = dict(os.environ)
    env.setdefault('JAVA_HOME', r'C:\Program Files\Android\Android Studio\jbr')
    run([str(ROOT / 'android' / 'gradlew.bat'), 'assembleRelease', '--console=plain', '-q'], cwd=ROOT / 'android', env=env)
    built = ROOT / 'android' / 'app' / 'build' / 'outputs' / 'apk' / 'release' / 'app-release.apk'
    name = f'aula-sakai-release-v{version}.apk'
    (ROOT / 'dist').mkdir(exist_ok=True)
    apk = ROOT / 'dist' / name
    shutil.copy(built, apk)

    # 3. Release en GitHub
    tag = f'android-v{version}'
    exists = subprocess.run([GH, 'release', 'view', tag, '--repo', REPO], capture_output=True).returncode == 0
    if exists:
        run([GH, 'release', 'upload', tag, str(apk), '--repo', REPO, '--clobber'])
    else:
        run([GH, 'release', 'create', tag, str(apk), '--repo', REPO, '--title', f'Aula Sakai Android {version}', '--notes', notes])

    # 4. Manifiesto de actualización
    MANIFEST.write_text(json.dumps({
        'version': version,
        'versionCode': code,
        'required': True,
        'apkUrl': f'https://github.com/{REPO}/releases/download/{tag}/{name}',
        'releaseNotes': notes,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    # 5. APK también en la raíz del repositorio (como Inhouse Notes) y enlace en el README
    for old_apk in ROOT.glob('aula-sakai-release-v*.apk'):
        if old_apk.name != name:
            run(['git', 'rm', '-q', '--ignore-unmatch', old_apk.name], cwd=ROOT)
            old_apk.unlink(missing_ok=True)
    shutil.copy(apk, ROOT / name)
    readme = ROOT / 'README.md'
    text = readme.read_text(encoding='utf-8')
    text = re.sub(r'aula-sakai-release-v\d+\.\d+\.\d+\.apk', name, text)
    text = re.sub(r'Aula Sakai \d+\.\d+\.\d+ para Android', f'Aula Sakai {version} para Android', text)
    readme.write_text(text, encoding='utf-8')

    # 6. Commit y push
    run(['git', 'add', str(GRADLE), str(MANIFEST), str(ROOT / name), str(readme)], cwd=ROOT)
    run(['git', 'commit', '-m', f'Aula Sakai Android {version}\n\n{notes}'], cwd=ROOT)
    run(['git', 'push'], cwd=ROOT)
    print(f'\nPublicada: https://github.com/{REPO}/releases/tag/{tag}')


if __name__ == '__main__':
    main()
