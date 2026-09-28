# Nueva interfaz para Sakai

Extensión para Brave/Chrome que da a las aulas virtuales hechas con Sakai (PoliformaT de la UPV, Aula Virtual de la UM…) una interfaz al estilo de Google Classroom. Usa el nombre y el logo originales de cada sitio.

## Instalación en Brave

1. Abre `brave://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** y elige esta carpeta (`poliformat-classroom`).
4. Entra en tu aula virtual e inicia sesión.

Tras editar algún archivo, pulsa el botón ↻ de la extensión en `brave://extensions` y recarga la página.

## Otras aulas virtuales Sakai

PoliformaT y el Aula Virtual de la UM funcionan directamente. Para cualquier otra aula Sakai, ábrela, pulsa el icono de la extensión en la barra de Brave y elige **"Usar la nueva interfaz en este sitio"** (Brave pedirá permiso para ese sitio). Desde el mismo botón se puede desactivar o quitar.

## Qué incluye

- **Menú lateral fijo** como el de Classroom (☰ lo pliega a iconos): Página principal, Calendario, Pendientes, tus clases y "Mi espacio".
  - Elige el curso académico que se muestra (por defecto, el más reciente).
  - Pulsa ☆ junto a una asignatura (al pasar el ratón) para hacerla favorita: las favoritas salen a la vista y el resto queda en el desplegable "Mostrar más". La primera vez se importan tus favoritas de PoliformaT.
  - Arrastra las favoritas (por el asa ⋮⋮ de la izquierda) para cambiar su orden. La página principal usa el mismo orden.
  - Cambia el color de cada asignatura con el icono de paleta (al pasar el ratón), el menú ⋮ de su tarjeta o el botón "Personalizar" del tablón.
- **Página principal**: tarjetas de clases con las entregas y exámenes de los próximos 7 días. Filtro por curso académico.
- **Calendario**: vista semanal con tareas y exámenes, filtrable por clase.
- **Pendientes**: tareas y exámenes de todas las asignaturas agrupados por semana. En "Fecha pasada", lo que venció hace más de un mes queda tras "Mostrar más".
- **Asignatura** con las pestañas de Classroom:
  - *Tablón*: anuncios, tareas y exámenes nuevos, y el recuadro "Próximamente".
  - *Trabajo de clase*: tareas y exámenes (con icono propio) y recursos agrupados por carpeta.
  - *Personas*: profesores y compañeros.
  - *Calificaciones*: tus notas con la media, al estilo de "Ver tu trabajo".
- El resto de herramientas se abren incrustadas bajo la barra, con un estilo adaptado.
- **Interruptor "Nueva interfaz"** arriba a la derecha para activar o desactivar esta interfaz (también aparece sobre la vista original). El botón de la extensión en la barra de Brave también permite activarla o desactivarla.

## Cómo funciona

Lee los datos de la API REST de Sakai (`/direct/...`) con tu propia sesión; no envía nada a ningún otro sitio. Si una llamada falla (por ejemplo, si no tienes permiso para ver la lista de participantes), muestra la herramienta original en su lugar.

`mock/server.js` (en la carpeta superior) es un servidor de pruebas que imita la API para ver la interfaz sin PoliformaT: `node mock/server.js` y abre http://localhost:8123/portal.
