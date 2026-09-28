# Ficha para la Chrome Web Store

Todo lo que pide el panel de desarrollador, listo para copiar y pegar.

## Paquete

- Archivo a subir: `dist/nueva-interfaz-sakai-<versión>.zip` (se genera con `python empaquetar.py`).

## Ficha de la tienda → «Store listing»

**Nombre** (viene del manifest): Nueva interfaz para Sakai

**Descripción breve** (máx. 132 caracteres, viene del manifest):
Interfaz moderna, al estilo de Google Classroom, para aulas virtuales hechas con Sakai (PoliformaT UPV, Aula Virtual UM…).

**Descripción detallada:**

```
Dale a tu aula virtual una interfaz moderna, limpia y fácil de usar.

Funciona con aulas virtuales basadas en Sakai, como PoliformaT (Universitat Politècnica de València) y el Aula Virtual de la Universidad de Murcia. Para cualquier otra aula Sakai, actívala desde el botón de la extensión.

QUÉ INCLUYE
• Página principal con tarjetas de tus asignaturas y lo que tienes que entregar esta semana.
• Menú lateral con tus asignaturas favoritas (márcalas con ☆ y ordénalas arrastrando); el resto, en «Mostrar más».
• Elige qué curso académico ver y personaliza el color de cada asignatura.
• Tablón con anuncios, tareas y exámenes nuevos, y un recuadro de «Próximamente».
• Trabajo de clase: tareas, exámenes y materiales agrupados por temas.
• Calificaciones con tus notas, comentarios y media.
• Pendientes y Calendario semanal con las entregas y exámenes de todas tus asignaturas.
• Personas: profesores y compañeros.
• Las demás herramientas se abren dentro de la nueva interfaz con un estilo adaptado.
• Usa el nombre y el logo originales de tu universidad.
• Un interruptor «Nueva interfaz» te devuelve a la vista original cuando quieras.

PRIVACIDAD
La extensión no recoge ni envía tus datos: todo se procesa en tu navegador, usando tu propia sesión en el aula virtual.

Proyecto independiente, no afiliado a ninguna universidad, a Sakai ni a Google.
```

**Categoría:** Educación
**Idioma:** Español

**Imágenes:**
- Icono de la tienda (128×128): `poliformat-classroom/icons/icon128.png`
- Capturas (1280×800): `store/screenshots/captura-1.png` … `captura-5.png`
- Mosaico promocional pequeño (440×280): `store/promo-440x280.png`
- Mosaico promocional de marquesina (1400×560): `store/marquee-1400x560.png`

## «Privacy practices» (Prácticas de privacidad)

**Propósito único (Single purpose):**
Mostrar las aulas virtuales basadas en Sakai con una interfaz moderna y más fácil de usar.

**Justificación de permisos:**
- `activeTab`: activar o desactivar la nueva interfaz en la pestaña actual cuando el usuario pulsa el botón de la extensión.
- `scripting`: guardar esa preferencia en la página y registrar la extensión en otras aulas Sakai solo cuando el usuario lo pide.
- Permisos de host (`poliformat.upv.es`, `aulavirtual.um.es`): mostrar la nueva interfaz en esas aulas virtuales.
- Permiso de host opcional (`https://*/*`): se solicita sitio a sitio, solo si el usuario pulsa «Usar la nueva interfaz en este sitio» en otra aula Sakai.

**¿Usas código remoto?** No. (Las fuentes de Google Fonts son hojas de estilo, no código.)

**Uso de datos — qué marcar:**
- Tipo de datos: marca «Contenido del sitio web» (lee de tu aula virtual asignaturas, tareas, notas… para mostrarlas). Nada más.
- Certifica las tres casillas: no se venden datos a terceros; no se usan para fines ajenos al propósito único; no se usan para evaluar solvencia ni préstamos.

**URL de la política de privacidad:**
https://miguelcoxcaballero.github.io/sakai-nueva-interfaz/

## Distribución

- Visibilidad: **Pública** (o **No listada** si solo quieres compartirla con enlace).
- Países: todos.
