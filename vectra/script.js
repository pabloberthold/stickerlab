(() => {
  'use strict';

  // ---------- Element references ----------
  const dropzone       = document.getElementById('dropzone');
  const fileInput      = document.getElementById('file-input');
  const errorMsg       = document.getElementById('error-msg');
  const pasteBtn       = document.getElementById('paste-btn');

  const uploadPanel     = document.getElementById('upload-panel');
  const convertPanel    = document.getElementById('convert-panel');
  const resultsPanel    = document.getElementById('results-panel');

  const modeToggle      = document.getElementById('mode-toggle');
  const colorsControl   = document.getElementById('colors-control');
  const thresholdControl= document.getElementById('threshold-control');

  const numColorsRange  = document.getElementById('numcolors-range');
  const numColorsVal    = document.getElementById('numcolors-val');
  const thresholdRange  = document.getElementById('threshold-range');
  const thresholdVal    = document.getElementById('threshold-val');
  const detailRange     = document.getElementById('detail-range');
  const detailVal       = document.getElementById('detail-val');
  const blurRange       = document.getElementById('blur-range');
  const blurVal         = document.getElementById('blur-val');
  const rightAngleCheck = document.getElementById('rightangle-check');

  const convertBtn      = document.getElementById('convert-btn');
  const progressWrap    = document.getElementById('progress-wrap');
  const progressFill    = document.getElementById('progress-fill');
  const progressLabel   = document.getElementById('progress-label');

  const originalPreview = document.getElementById('original-preview');
  const originalSizeEl  = document.getElementById('original-size');
  const svgPreview      = document.getElementById('svg-preview');
  const svgSizeEl       = document.getElementById('svg-size');

  const downloadBtn     = document.getElementById('download-btn');
  const resetBtn        = document.getElementById('reset-btn');
  const sendToStickerBtn = document.getElementById('send-to-sticker-btn');

  const brandPath        = document.getElementById('brand-path');

  const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif'];

  // ---------- State ----------
  let state = {
    file: null,
    imageEl: null,     // decoded <img>
    colorMode: 'color', // 'color' | 'bw'
    svgString: null,
    originalName: 'imagen'
  };

  // ---------- Helpers ----------
  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.hidden = false;
  }

  function clearError() {
    errorMsg.hidden = true;
    errorMsg.textContent = '';
  }

  function resetToUpload() {
    state = { file: null, imageEl: null, colorMode: state.colorMode, svgString: null, originalName: 'imagen' };
    fileInput.value = '';
    convertPanel.hidden = true;
    resultsPanel.hidden = true;
    uploadPanel.hidden = false;
    clearError();
    progressWrap.hidden = true;
    progressFill.style.width = '0%';
    convertBtn.disabled = false;
    convertBtn.querySelector('.btn-label').textContent = 'Convertir a SVG';
  }

  // ---------- File intake ----------
  function handleIncomingFile(file) {
    clearError();

    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      showError(`Formato no soportado (${file.type || 'desconocido'}). Usá JPG, PNG o GIF.`);
      return;
    }

    const MAX_BYTES = 25 * 1024 * 1024; // 25MB safety cap for in-browser processing
    if (file.size > MAX_BYTES) {
      showError('El archivo es demasiado grande para procesarlo en el navegador (máx. 25MB).');
      return;
    }

    state.file = file;
    state.originalName = file.name.replace(/\.[^/.]+$/, '') || 'imagen';

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      state.imageEl = img;
      originalPreview.src = objectUrl;
      originalSizeEl.textContent = `${formatBytes(file.size)} · ${img.naturalWidth}×${img.naturalHeight}px`;

      uploadPanel.hidden = true;
      convertPanel.hidden = false;
      resultsPanel.hidden = true;
      convertPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    img.onerror = () => {
      showError('No se pudo leer la imagen. Puede estar dañada o el formato no es válido.');
    };
    img.src = objectUrl;
  }

  // ---------- Dropzone interactions ----------
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
  });

  ['dragleave', 'dragend'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleIncomingFile(file);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    handleIncomingFile(file);
  });

  // ---------- Paste from clipboard ----------

  function extensionForMime(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/gif') return 'gif';
    return 'jpg';
  }

  function blobToNamedFile(blob) {
    const type = ACCEPTED_TYPES.includes(blob.type) ? blob.type : 'image/png';
    const name = `pegado-${Date.now()}.${extensionForMime(type)}`;
    try {
      return new File([blob], name, { type });
    } catch (_) {
      // Safari fallback: File constructor with Blob parts works, but guard just in case.
      blob.name = name;
      return blob;
    }
  }

  function flashDropzone() {
    dropzone.classList.add('paste-flash');
    setTimeout(() => dropzone.classList.remove('paste-flash'), 600);
  }

  // Works as soon as the page has focus, no permission prompt: Ctrl+V / Cmd+V anywhere.
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    let imageItem = null;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        imageItem = item;
        break;
      }
    }
    if (!imageItem) return;

    e.preventDefault();
    const blob = imageItem.getAsFile();
    if (!blob) return;

    flashDropzone();
    handleIncomingFile(blobToNamedFile(blob));
  });

  // Explicit button for browsers/devices where the keyboard shortcut isn't practical
  // (e.g. touch devices). Uses the async Clipboard API, which requires a user gesture
  // and, in some browsers, a one-time permission grant.
  if (pasteBtn) {
    pasteBtn.addEventListener('click', async () => {
      clearError();

      if (!navigator.clipboard || !navigator.clipboard.read) {
        showError('Tu navegador no permite leer el portapapeles con este botón. Probá Ctrl+V / Cmd+V sobre la página.');
        return;
      }

      try {
        const items = await navigator.clipboard.read();
        let found = null;

        outer:
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              found = { item, type };
              break outer;
            }
          }
        }

        if (!found) {
          showError('No se encontró ninguna imagen en el portapapeles. Copiá una imagen primero.');
          return;
        }

        const blob = await found.item.getType(found.type);
        flashDropzone();
        handleIncomingFile(blobToNamedFile(blob));
      } catch (err) {
        console.error(err);
        showError('No se pudo leer el portapapeles. Revisá los permisos del navegador o usá Ctrl+V / Cmd+V.');
      }
    });
  }

  // ---------- Settings UI ----------
  modeToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    modeToggle.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.colorMode = btn.dataset.mode;
    const isBw = state.colorMode === 'bw';
    thresholdControl.hidden = !isBw;
    colorsControl.hidden = isBw;
  });

  numColorsRange.addEventListener('input', () => { numColorsVal.textContent = numColorsRange.value; });
  thresholdRange.addEventListener('input', () => { thresholdVal.textContent = thresholdRange.value; });
  detailRange.addEventListener('input', () => { detailVal.textContent = detailRange.value; });
  blurRange.addEventListener('input', () => { blurVal.textContent = blurRange.value; });

  // ---------- Preprocessing: threshold to pure B/W bitmap on a canvas ----------
  function buildImageData(img, { bw, threshold }) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (bw) {
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        // Perceptual luminance
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const v = lum >= threshold ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        // keep alpha as-is
      }
    }
    return imageData;
  }

  // ---------- Conversion ----------
  convertBtn.addEventListener('click', runConversion);

  function runConversion() {
    if (!state.imageEl) return;

    convertBtn.disabled = true;
    convertBtn.querySelector('.btn-label').textContent = 'Procesando…';
    progressWrap.hidden = false;
    progressFill.style.width = '10%';
    progressLabel.textContent = 'Preparando la imagen…';

    const isBw = state.colorMode === 'bw';
    const detail = parseFloat(detailRange.value);       // maps to ltres / qtres
    const numberOfColors = parseInt(numColorsRange.value, 10);
    const threshold = parseInt(thresholdRange.value, 10);
    const blur = parseInt(blurRange.value, 10);
    const rightAngle = rightAngleCheck.checked;

    // Yield to the browser so the progress bar actually paints before the
    // (synchronous, potentially heavy) tracing work blocks the main thread.
    setTimeout(() => {
      try {
        const imageData = buildImageData(state.imageEl, { bw: isBw, threshold });
        progressFill.style.width = '35%';
        progressLabel.textContent = 'Cuantizando color y construyendo el mapa de trazos…';

        const options = {
          ltres: detail,
          qtres: detail,
          pathomit: Math.max(1, Math.round(detail * 4)),
          rightangleenhance: rightAngle,
          colorsampling: 2,
          numberofcolors: isBw ? 2 : numberOfColors,
          mincolorratio: 0,
          colorquantcycles: 3,
          blurradius: blur,
          blurdelta: 20,
          strokewidth: 0,
          linefilter: false,
          roundcoords: 2,
          scale: 1,
          viewbox: true,
          desc: false
        };

        setTimeout(() => {
          progressFill.style.width = '65%';
          progressLabel.textContent = 'Ajustando curvas de Bézier y esquinas…';

          setTimeout(() => {
            let svgString;
            try {
              svgString = ImageTracer.imagedataToSVG(imageData, options);
            } catch (err) {
              console.error(err);
              progressWrap.hidden = true;
              convertBtn.disabled = false;
              convertBtn.querySelector('.btn-label').textContent = 'Convertir a SVG';
              showError('Ocurrió un error durante el trazado. Probá reducir el detalle o el tamaño de la imagen.');
              return;
            }

            progressFill.style.width = '90%';
            progressLabel.textContent = 'Generando el archivo SVG…';

            setTimeout(() => {
              state.svgString = svgString;
              displayResults(svgString);

              progressFill.style.width = '100%';
              setTimeout(() => { progressWrap.hidden = true; }, 400);
              convertBtn.disabled = false;
              convertBtn.querySelector('.btn-label').textContent = 'Convertir a SVG';
            }, 120);
          }, 120);
        }, 120);

      } catch (err) {
        console.error(err);
        progressWrap.hidden = true;
        convertBtn.disabled = false;
        convertBtn.querySelector('.btn-label').textContent = 'Convertir a SVG';
        showError('No se pudo procesar la imagen. Probá con otro archivo.');
      }
    }, 60);
  }

  function displayResults(svgString) {
    svgPreview.innerHTML = svgString;
    const svgEl = svgPreview.querySelector('svg');
    if (svgEl) {
      svgEl.removeAttribute('width');
      svgEl.removeAttribute('height');
      svgEl.style.width = '100%';
      svgEl.style.height = 'auto';
    }

    const svgBytes = new Blob([svgString], { type: 'image/svg+xml' }).size;
    svgSizeEl.textContent = formatBytes(svgBytes);

    resultsPanel.hidden = false;
    resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Download ----------
  downloadBtn.addEventListener('click', () => {
    if (!state.svgString) return;
    const blob = new Blob([state.svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.originalName}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  resetBtn.addEventListener('click', resetToUpload);

  // ---------- Enviar a StickerLab (handoff dentro del mismo sitio) ----------
  if (sendToStickerBtn) {
    sendToStickerBtn.addEventListener('click', () => {
      if (!state.svgString) return;

      const payload = JSON.stringify({
        name: state.originalName,
        svgText: state.svgString,
      });

      try {
        sessionStorage.setItem('vectra:handoff', payload);
        // Verificación inmediata: algunos navegadores (o modos de privacidad) aceptan
        // el setItem sin error pero no llegan a persistirlo.
        if (sessionStorage.getItem('vectra:handoff') !== payload) {
          throw new Error('No se pudo verificar el guardado en sessionStorage');
        }
      } catch (err) {
        console.error(err);
        if (window.location.protocol === 'file:') {
          showError('No se pudo enviar el SVG a StickerLab: al abrir los archivos directamente (file://), el navegador no comparte datos entre páginas. Serví el sitio con un servidor local (por ej. "npx serve" o la extensión Live Server de VS Code) o subilo a GitHub Pages, y volvé a intentarlo. Mientras tanto podés usar "Descargar SVG" e importarlo manualmente en StickerLab.');
        } else {
          showError('No se pudo preparar el envío a StickerLab. Descargá el SVG e importalo manualmente.');
        }
        return;
      }

      window.location.href = '../index.html?from=vectra';
    });
  }

  // ---------- Decorative header trace animation ----------
  if (brandPath) {
    const len = brandPath.getTotalLength();
    brandPath.style.strokeDasharray = `${len}`;
    brandPath.style.strokeDashoffset = `${len}`;
    brandPath.getBoundingClientRect(); // force reflow
    brandPath.style.transition = 'stroke-dashoffset 1.4s ease';
    requestAnimationFrame(() => { brandPath.style.strokeDashoffset = '0'; });
  }

})();
