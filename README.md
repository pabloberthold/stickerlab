# StickerLab — Maquetador de planchas de stickers en A4

App estática (sin backend) para maquetar SVG en hojas A4 y exportarlas a PDF listo para imprimir.

## Publicar en GitHub Pages
1. Sube estos archivos a la raíz del repositorio: `index.html`, `styles.css`, `app.js` y la carpeta `modelos/`.
2. En **Settings → Pages**, activa GitHub Pages apuntando a la rama (`main`) y carpeta `/root`.
3. Listo — todo corre 100% en el navegador (Tailwind, Fabric.js, jsPDF y svg2pdf.js se cargan por CDN).

## Vectra — convertir imágenes a SVG
El botón **"Convertir imagen a SVG (Vectra)"** de la barra lateral abre `vectra/index.html`, una
segunda página dentro del mismo sitio (mismo repositorio, mismo despliegue de GitHub Pages) que
vectoriza JPG/PNG/GIF con [ImageTracer.js](https://github.com/jankovicsandras/imagetracerjs),
100% en el navegador. Se restyleó para compartir la misma paleta, tipografías y componentes que
StickerLab, así que se siente como una sección más de la app y no como un sitio aparte.

Al terminar una conversión, el botón **"Enviar a StickerLab"** guarda el SVG resultante en
`sessionStorage` y vuelve a `index.html`; StickerLab lo detecta al cargar, lo agrega a la galería
y lo coloca automáticamente en el centro de la hoja A4, listo para usar.

```
vectra/
  index.html
  style.css
  script.js
```

## Carpeta `/modelos`
Como el sitio queda alojado en hosting estático, el navegador no puede "listar" una carpeta del servidor por sí solo.
Por eso `/modelos` funciona con un archivo `manifest.json` que indica qué `.svg` mostrar en el botón **Galería de Modelos**:

```
modelos/
  manifest.json      <- lista de nombres de archivo
  estrella.svg
  insignia.svg
  cinta.svg
```

**Para agregar un modelo nuevo al sitio publicado:**
1. Copia tu archivo `.svg` dentro de `modelos/`.
2. Agrega su nombre al arreglo de `modelos/manifest.json`.
3. Sube los cambios (commit + push) — al recargar la página aparecerá en la Galería de Modelos.

### Conectar una carpeta local (opcional, Chrome/Edge/Opera)
Dentro del popup "Galería de Modelos" hay un botón **Conectar carpeta…** que usa la API nativa
*File System Access* del navegador para leer (y guardar) archivos `.svg` directamente en una carpeta
de tu computadora — sin subir nada a ningún servidor. Al activarlo:
- Se listan todos los `.svg` de esa carpeta en el popup, junto a los modelos incluidos en el sitio.
- Si activas "Guardar copia en /modelos al importar" (aparece en la barra lateral una vez conectada
  la carpeta), cada SVG que importes desde "Importar SVG" también se guardará ahí automáticamente.
- El navegador recuerda la carpeta entre sesiones; solo pedirá reactivar el permiso con un clic.
- Firefox y Safari no soportan esta API todavía: en esos navegadores solo estarán disponibles los
  modelos incluidos en el sitio (sección "Incluidos en el sitio" del popup).
