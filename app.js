/* =========================================================================
   StickerLab — Maquetador de planchas de stickers en A4 (100% client-side)
   ========================================================================= */

(() => {
  'use strict';

  // ---- Constantes físicas -------------------------------------------------
  const MM_TO_PX = 96 / 25.4;          // 1 mm a 96 dpi
  const SHEET_W_MM = 210;
  const SHEET_H_MM = 297;
  const SHEET_W_PX = SHEET_W_MM * MM_TO_PX;
  const SHEET_H_PX = SHEET_H_MM * MM_TO_PX;
  const DEFAULT_MAX_INSERT_MM = 45;    // tamaño máximo por defecto al insertar un logo

  const mmToPx = mm => mm * MM_TO_PX;
  const pxToMm = px => px / MM_TO_PX;

  // ---- Estado global -------------------------------------------------------
  const state = {
    margin: 5,
    gap: 3,
    assets: new Map(), // id -> {id, name, svgText}
    assetCounter: 0,
    folderHandle: null, // FileSystemDirectoryHandle de /modelos, si está conectada
  };

  const MODELS_MANIFEST_URL = 'modelos/manifest.json';
  const MODELS_FOLDER_PATH = 'modelos/';
  const sourceToAssetId = new Map(); // evita duplicar en la galería un mismo modelo clicado varias veces

  let canvas;          // instancia fabric.Canvas
  let marginGuide;      // rect guía de margen

  // =========================================================================
  // INIT
  // =========================================================================
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setupCanvas();
    buildRulers();
    setupUploads();
    setupPropertiesPanel();
    setupToolButtons();
    setupMarginGapInputs();
    setupKeyboard();
    setupModelsGallery();
    setupClearButton();
    updateMarginGuide();
    tryRestoreFolderHandle();
    handleVectraHandoff();
  }

  // =========================================================================
  // LIENZO A4
  // =========================================================================
  function setupCanvas() {
    canvas = new fabric.Canvas('a4canvas', {
      width: SHEET_W_PX,
      height: SHEET_H_PX,
      backgroundColor: '#ffffff',
      selection: true,
      preserveObjectStacking: true,
    });

    fabric.Object.prototype.transparentCorners = false;
    fabric.Object.prototype.cornerColor = '#FF5A36';
    fabric.Object.prototype.cornerStrokeColor = '#1E2A3A';
    fabric.Object.prototype.borderColor = '#FF5A36';
    fabric.Object.prototype.cornerStyle = 'circle';
    fabric.Object.prototype.cornerSize = 9;
    fabric.Object.prototype.padding = 2;
    fabric.Object.prototype.borderScaleFactor = 1.4;

    canvas.on('selection:created', onSelectionChanged);
    canvas.on('selection:updated', onSelectionChanged);
    canvas.on('selection:cleared', onSelectionCleared);
    canvas.on('object:moving', syncPanelFromSelection);
    canvas.on('object:scaling', syncPanelFromSelection);
    canvas.on('object:rotating', syncPanelFromSelection);
    canvas.on('object:modified', syncPanelFromSelection);

    // Drag & drop de logos desde la galería directamente sobre el lienzo
    const wrap = document.getElementById('canvasWrap');
    wrap.addEventListener('dragover', e => e.preventDefault());
    wrap.addEventListener('drop', e => {
      e.preventDefault();
      const assetId = e.dataTransfer.getData('text/plain');
      if (!assetId || !state.assets.has(assetId)) return;
      const rect = canvas.getElement().getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      addAssetToCanvas(assetId, { left: x, top: y });
    });
  }

  function updateMarginGuide() {
    if (marginGuide) canvas.remove(marginGuide);
    const m = mmToPx(state.margin);
    marginGuide = new fabric.Rect({
      left: m, top: m,
      width: SHEET_W_PX - 2 * m,
      height: SHEET_H_PX - 2 * m,
      fill: 'transparent',
      stroke: '#B9C0C6',
      strokeDashArray: [4, 4],
      strokeWidth: 1,
      selectable: false,
      evented: false,
      excludeFromExport: true,
      data: { isGuide: true },
    });
    canvas.add(marginGuide);
    marginGuide.moveTo(0);
    canvas.requestRenderAll();
  }

  // =========================================================================
  // REGLAS (mm) — elemento distintivo de tipo "mesa de imprenta"
  // =========================================================================
  function buildRulers() {
    document.getElementById('rulerTop').innerHTML = rulerSvg('h', SHEET_W_MM, SHEET_W_PX);
    document.getElementById('rulerLeft').innerHTML = rulerSvg('v', SHEET_H_MM, SHEET_H_PX);
  }

  function rulerSvg(dir, lenMm, lenPx) {
    const thick = 22;
    let ticks = '';
    for (let mm = 0; mm <= lenMm; mm += 1) {
      const p = mm * MM_TO_PX;
      const isMajor = mm % 10 === 0;
      const tickLen = isMajor ? thick * 0.55 : (mm % 5 === 0 ? thick * 0.38 : thick * 0.22);
      if (dir === 'h') {
        ticks += `<line x1="${p}" y1="${thick}" x2="${p}" y2="${thick - tickLen}" stroke="#9AA4AC" stroke-width="${isMajor ? 1 : 0.6}"/>`;
        if (isMajor && mm > 0) ticks += `<text x="${p + 3}" y="9" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#6B7680">${mm}</text>`;
      } else {
        ticks += `<line x1="${thick}" y1="${p}" x2="${thick - tickLen}" y2="${p}" stroke="#9AA4AC" stroke-width="${isMajor ? 1 : 0.6}"/>`;
        if (isMajor && mm > 0) ticks += `<text x="3" y="${p + 9}" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#6B7680" transform="rotate(0)">${mm}</text>`;
      }
    }
    const w = dir === 'h' ? lenPx : thick;
    const h = dir === 'h' ? thick : lenPx;
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${ticks}</svg>`;
  }

  // =========================================================================
  // GALERÍA DE SVG
  // =========================================================================
  function setupUploads() {
    const input = document.getElementById('svgUploadInput');
    const dropzone = document.querySelector('.upload-dropzone');

    input.addEventListener('change', e => handleFiles(e.target.files));

    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });
  }

  function handleFiles(fileList) {
    const files = Array.from(fileList).filter(f => /\.svg$/i.test(f.name) || f.type === 'image/svg+xml');
    if (!files.length) { showToast('Selecciona archivos .svg válidos'); return; }

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = async ev => {
        const svgText = sanitizeSvgText(ev.target.result);
        if (!svgText) { showToast(`No se pudo leer "${file.name}"`); return; }
        const id = 'asset_' + (++state.assetCounter);
        state.assets.set(id, { id, name: file.name.replace(/\.svg$/i, ''), svgText });
        renderGalleryItem(state.assets.get(id));

        const saveToggle = document.getElementById('saveToModelsToggle');
        if (state.folderHandle && saveToggle && saveToggle.checked) {
          await writeSvgToFolder(file.name, svgText);
          if (!document.getElementById('modelsModalBackdrop').classList.contains('hidden')) {
            loadFolderModels(state.folderHandle);
          }
        }
      };
      reader.readAsText(file);
    });
  }

  // Limpieza mínima: aseguramos namespace SVG válido
  function sanitizeSvgText(text) {
    if (!/<svg[\s>]/i.test(text)) return null;
    return text.trim();
  }

  function renderGalleryItem(asset) {
    document.getElementById('galleryEmpty').style.display = 'none';
    const gallery = document.getElementById('gallery');

    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.draggable = true;
    item.dataset.assetId = asset.id;
    item.innerHTML = `
      <div class="gallery-thumb">${asset.svgText}</div>
      <div class="gallery-label">${escapeHtml(asset.name)}</div>
      <button class="gallery-remove" title="Quitar de la galería">&times;</button>
    `;

    item.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', asset.id);
      e.dataTransfer.effectAllowed = 'copy';
    });
    item.addEventListener('click', e => {
      if (e.target.closest('.gallery-remove')) return;
      addAssetToCanvas(asset.id, { center: true });
    });
    item.querySelector('.gallery-remove').addEventListener('click', e => {
      e.stopPropagation();
      state.assets.delete(asset.id);
      item.remove();
      if (!state.assets.size) document.getElementById('galleryEmpty').style.display = 'block';
    });

    gallery.appendChild(item);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // =========================================================================
  // AÑADIR UN LOGO AL LIENZO
  // =========================================================================
  function addAssetToCanvas(assetId, pos) {
    const asset = state.assets.get(assetId);
    if (!asset) return;

    fabric.loadSVGFromString(asset.svgText, (objects, options) => {
      if (!objects || !objects.length) { showToast('El SVG no contiene elementos visibles'); return; }
      const obj = objects.length === 1 ? objects[0] : fabric.util.groupSVGElements(objects, options);

      const naturalWidth = obj.width || options.width || 100;
      const naturalHeight = obj.height || options.height || 100;

      // Escala inicial: encajar dentro de un tamaño razonable de inserción
      const maxPx = mmToPx(DEFAULT_MAX_INSERT_MM);
      const largest = Math.max(naturalWidth, naturalHeight);
      const initialScale = largest > maxPx ? maxPx / largest : 1;

      let left, top;
      if (pos && pos.center) {
        left = SHEET_W_PX / 2; top = SHEET_H_PX / 2;
      } else if (pos) {
        left = pos.left; top = pos.top;
      } else {
        left = SHEET_W_PX / 2; top = SHEET_H_PX / 2;
      }

      obj.set({
        left, top,
        originX: 'center', originY: 'center',
        scaleX: initialScale, scaleY: initialScale,
        data: { assetId, naturalWidth, naturalHeight },
      });

      canvas.add(obj);
      canvas.setActiveObject(obj);
      canvas.requestRenderAll();
    });
  }

  // =========================================================================
  // PANEL DE PROPIEDADES
  // =========================================================================
  function setupPropertiesPanel() {
    const propW = document.getElementById('propW');
    const propH = document.getElementById('propH');
    const propX = document.getElementById('propX');
    const propY = document.getElementById('propY');
    const propR = document.getElementById('propR');
    const lockAspect = document.getElementById('lockAspect');

    propW.addEventListener('input', () => applyDimension('w', parseFloat(propW.value)));
    propH.addEventListener('input', () => applyDimension('h', parseFloat(propH.value)));
    propX.addEventListener('input', () => applyPosition('x', parseFloat(propX.value)));
    propY.addEventListener('input', () => applyPosition('y', parseFloat(propY.value)));
    propR.addEventListener('input', () => applyRotation(parseFloat(propR.value)));
  }

  function activeObj() {
    const o = canvas.getActiveObject();
    if (!o || (o.data && o.data.isGuide)) return null;
    return o;
  }

  function applyDimension(which, valueMm) {
    const obj = activeObj();
    if (!obj || isNaN(valueMm) || valueMm <= 0) return;
    const lockAspect = document.getElementById('lockAspect').checked;
    const targetPx = mmToPx(valueMm);

    if (lockAspect) {
      const currentPx = which === 'w' ? obj.getScaledWidth() : obj.getScaledHeight();
      const ratio = targetPx / currentPx;
      obj.set({ scaleX: obj.scaleX * ratio, scaleY: obj.scaleY * ratio });
    } else if (which === 'w') {
      obj.set({ scaleX: targetPx / obj.width });
    } else {
      obj.set({ scaleY: targetPx / obj.height });
    }
    obj.setCoords();
    canvas.requestRenderAll();
    syncPanelFromSelection();
  }

  function applyPosition(axis, valueMm) {
    const obj = activeObj();
    if (!obj || isNaN(valueMm)) return;
    obj.set(axis === 'x' ? { left: mmToPx(valueMm) } : { top: mmToPx(valueMm) });
    obj.setCoords();
    canvas.requestRenderAll();
  }

  function applyRotation(deg) {
    const obj = activeObj();
    if (!obj || isNaN(deg)) return;
    obj.set({ angle: deg });
    obj.setCoords();
    canvas.requestRenderAll();
  }

  function onSelectionChanged() { syncPanelFromSelection(); }
  function onSelectionCleared() {
    document.getElementById('selectionPanel').classList.add('hidden');
    document.getElementById('noSelection').classList.remove('hidden');
  }

  function syncPanelFromSelection() {
    const obj = activeObj();
    if (!obj) { onSelectionCleared(); return; }
    document.getElementById('selectionPanel').classList.remove('hidden');
    document.getElementById('noSelection').classList.add('hidden');

    document.getElementById('propW').value = round2(pxToMm(obj.getScaledWidth()));
    document.getElementById('propH').value = round2(pxToMm(obj.getScaledHeight()));
    document.getElementById('propX').value = round2(pxToMm(obj.left));
    document.getElementById('propY').value = round2(pxToMm(obj.top));
    document.getElementById('propR').value = Math.round(obj.angle % 360);
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  // =========================================================================
  // HERRAMIENTAS: duplicar, eliminar, alinear, auto-distribuir
  // =========================================================================
  function setupToolButtons() {
    document.getElementById('duplicateBtn').addEventListener('click', duplicateSelected);
    document.getElementById('deleteBtn').addEventListener('click', deleteSelected);
    document.getElementById('alignH').addEventListener('click', () => alignSelected('h'));
    document.getElementById('alignV').addEventListener('click', () => alignSelected('v'));
    document.getElementById('fillSheetBtn').addEventListener('click', fillSheet);
    document.getElementById('exportBtn').addEventListener('click', exportToPdf);
    document.getElementById('printBtn').addEventListener('click', printSheet);
  }

  function cloneAsync(obj) {
    return new Promise(resolve => obj.clone(resolve, ['data']));
  }

  async function duplicateSelected() {
    const obj = activeObj();
    if (!obj) { showToast('Selecciona un elemento primero'); return; }
    const clone = await cloneAsync(obj);
    clone.set({ left: obj.left + mmToPx(6), top: obj.top + mmToPx(6) });
    canvas.add(clone);
    canvas.setActiveObject(clone);
    canvas.requestRenderAll();
  }

  function deleteSelected() {
    const obj = activeObj();
    if (!obj) { showToast('Selecciona un elemento primero'); return; }
    const active = canvas.getActiveObject();
    if (active && active.type === 'activeSelection') {
      active.forEachObject(o => canvas.remove(o));
      canvas.discardActiveObject();
    } else {
      canvas.remove(obj);
    }
    canvas.requestRenderAll();
    onSelectionCleared();
  }

  function alignSelected(axis) {
    const obj = activeObj();
    if (!obj) { showToast('Selecciona un elemento primero'); return; }
    if (axis === 'h') obj.set({ left: SHEET_W_PX / 2 });
    else obj.set({ top: SHEET_H_PX / 2 });
    obj.setCoords();
    canvas.requestRenderAll();
    syncPanelFromSelection();
  }

  async function fillSheet() {
    const base = activeObj();
    if (!base) { showToast('Selecciona un elemento para distribuirlo'); return; }

    const gapPx = mmToPx(state.gap);
    const marginPx = mmToPx(state.margin);
    const bbox = base.getBoundingRect(true, true);
    const cellW = bbox.width;
    const cellH = bbox.height;

    const usableW = SHEET_W_PX - 2 * marginPx;
    const usableH = SHEET_H_PX - 2 * marginPx;

    const cols = Math.max(1, Math.floor((usableW + gapPx) / (cellW + gapPx)));
    const rows = Math.max(1, Math.floor((usableH + gapPx) / (cellH + gapPx)));

    if (cols * rows <= 1) { showToast('El elemento es demasiado grande para distribuirse'); return; }

    const totalGridW = cols * cellW + (cols - 1) * gapPx;
    const totalGridH = rows * cellH + (rows - 1) * gapPx;
    const startX = marginPx + (usableW - totalGridW) / 2;
    const startY = marginPx + (usableH - totalGridH) / 2;

    // Offset del centro del objeto respecto a la esquina de su bounding box
    const centerOffsetX = base.left - bbox.left;
    const centerOffsetY = base.top - bbox.top;

    let placed = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellLeft = startX + c * (cellW + gapPx);
        const cellTop = startY + r * (cellH + gapPx);
        if (r === 0 && c === 0) {
          base.set({ left: cellLeft + centerOffsetX, top: cellTop + centerOffsetY });
          base.setCoords();
        } else {
          const clone = await cloneAsync(base);
          clone.set({ left: cellLeft + centerOffsetX, top: cellTop + centerOffsetY });
          canvas.add(clone);
        }
        placed++;
      }
    }
    canvas.requestRenderAll();
    showToast(`Hoja distribuida: ${placed} copias (${cols}×${rows})`);
  }

  // =========================================================================
  // MÁRGENES / ESPACIADO
  // =========================================================================
  function setupMarginGapInputs() {
    const marginInput = document.getElementById('marginInput');
    const gapInput = document.getElementById('gapInput');
    marginInput.addEventListener('input', () => {
      const v = parseFloat(marginInput.value);
      if (!isNaN(v) && v >= 0) { state.margin = v; updateMarginGuide(); }
    });
    gapInput.addEventListener('input', () => {
      const v = parseFloat(gapInput.value);
      if (!isNaN(v) && v >= 0) state.gap = v;
    });
  }

  // =========================================================================
  // TECLADO
  // =========================================================================
  function setupKeyboard() {
    window.addEventListener('keydown', e => {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeObj()) { e.preventDefault(); deleteSelected(); }
      }
    });
  }

  // =========================================================================
  // EXPORTACIÓN A PDF VECTORIAL (jsPDF + svg2pdf.js)
  // =========================================================================
  async function exportToPdf() {
    const exportables = canvas.getObjects().filter(o => !(o.data && o.data.isGuide));
    if (!exportables.length) { showToast('No hay elementos para exportar'); return; }

    const btn = document.getElementById('exportBtn');
    const originalLabel = btn.innerHTML;
    btn.innerHTML = 'Generando PDF…';
    btn.disabled = true;

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const scratch = document.getElementById('pdfScratch');

      for (const obj of exportables) {
        const built = buildExportSvg(obj);
        if (!built) continue;
        scratch.innerHTML = built.wrapperHtml;
        const svgEl = scratch.querySelector('svg');
        await doc.svg(svgEl, { x: built.x, y: built.y, width: built.w, height: built.h });
        scratch.innerHTML = '';
      }

      doc.save('plancha-stickers-a4.pdf');
      showToast('PDF generado correctamente');
    } catch (err) {
      console.error(err);
      showToast('Error al exportar el PDF. Revisa la consola.');
    } finally {
      btn.innerHTML = originalLabel;
      btn.disabled = false;
    }
  }

  function buildExportSvg(obj) {
    const data = obj.data;
    if (!data || !data.svgText) {
      // Fallback: si el objeto no tiene referencia al SVG original, se omite.
      return null;
    }
    const parser = new DOMParser();
    const parsed = parser.parseFromString(data.svgText, 'image/svg+xml');
    const svgRoot = parsed.documentElement;
    if (svgRoot.querySelector('parsererror')) return null;

    svgRoot.setAttribute('x', '0');
    svgRoot.setAttribute('y', '0');
    svgRoot.setAttribute('width', data.naturalWidth);
    svgRoot.setAttribute('height', data.naturalHeight);
    const innerSvgString = new XMLSerializer().serializeToString(svgRoot);

    const angle = obj.angle || 0;
    const scaledWmm = pxToMm(obj.getScaledWidth());
    const scaledHmm = pxToMm(obj.getScaledHeight());
    const scaleFactor = scaledWmm / data.naturalWidth;

    const bbox = obj.getBoundingRect(true, true);
    const bboxWmm = pxToMm(bbox.width);
    const bboxHmm = pxToMm(bbox.height);
    const bboxLeftMm = pxToMm(bbox.left);
    const bboxTopMm = pxToMm(bbox.top);

    const wrapperHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="${bboxWmm}" height="${bboxHmm}" viewBox="0 0 ${bboxWmm} ${bboxHmm}">
      <g transform="translate(${bboxWmm / 2} ${bboxHmm / 2}) rotate(${angle}) scale(${scaleFactor}) translate(${-data.naturalWidth / 2} ${-data.naturalHeight / 2})">
        ${innerSvgString}
      </g>
    </svg>`;

    return { wrapperHtml, x: bboxLeftMm, y: bboxTopMm, w: bboxWmm, h: bboxHmm };
  }

  // =========================================================================
  // LIMPIAR PLANTILLA
  // =========================================================================
  function setupClearButton() {
    document.getElementById('clearBtn').addEventListener('click', clearSheet);
  }

  function clearSheet() {
    const objs = canvas.getObjects().filter(o => !(o.data && o.data.isGuide));
    if (!objs.length) { showToast('La hoja ya está vacía'); return; }
    const ok = window.confirm('¿Vaciar la hoja A4? Se eliminarán todos los elementos colocados (la galería no se ve afectada).');
    if (!ok) return;
    objs.forEach(o => canvas.remove(o));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    onSelectionCleared();
    showToast('Hoja vaciada');
  }

  // =========================================================================
  // GALERÍA DE MODELOS (/modelos): manifest estático + carpeta local opcional
  // =========================================================================
  function setupModelsGallery() {
    const openBtn = document.getElementById('modelsGalleryBtn');
    const backdrop = document.getElementById('modelsModalBackdrop');
    const closeBtn = document.getElementById('modelsModalClose');
    const connectBtn = document.getElementById('connectFolderBtn');

    openBtn.addEventListener('click', () => {
      backdrop.classList.remove('hidden');
      loadStaticModels();
      if (state.folderHandle) loadFolderModels(state.folderHandle);
    });
    closeBtn.addEventListener('click', () => backdrop.classList.add('hidden'));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.classList.add('hidden'); });

    if ('showDirectoryPicker' in window) {
      connectBtn.addEventListener('click', connectModelsFolder);
    } else {
      connectBtn.disabled = true;
      connectBtn.title = 'No disponible en este navegador';
      document.getElementById('folderApiHint').textContent =
        'Tu navegador no soporta conectar carpetas locales (disponible en Chrome, Edge y Opera). Los modelos incluidos en el sitio funcionan igual en cualquier navegador.';
    }
  }

  // ---- Modelos incluidos en el sitio (fetch estático, funciona en cualquier navegador) ----
  async function loadStaticModels() {
    const container = document.getElementById('modelsStaticGrid');
    const emptyEl = document.getElementById('modelsStaticEmpty');
    container.innerHTML = '';
    emptyEl.style.display = 'none';

    let list;
    try {
      const res = await fetch(MODELS_MANIFEST_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('manifest no encontrado');
      list = await res.json();
    } catch (err) {
      emptyEl.textContent = 'No se encontró la carpeta /modelos o su manifest.json.';
      emptyEl.style.display = 'block';
      return;
    }

    if (!Array.isArray(list) || !list.length) {
      emptyEl.textContent = 'La carpeta /modelos no tiene modelos listados en manifest.json.';
      emptyEl.style.display = 'block';
      return;
    }

    let loaded = 0;
    for (const filename of list) {
      try {
        const svgRes = await fetch(MODELS_FOLDER_PATH + filename, { cache: 'no-store' });
        if (!svgRes.ok) continue;
        const svgText = sanitizeSvgText(await svgRes.text());
        if (!svgText) continue;
        renderModelItem(container, 'static:' + filename, filename.replace(/\.svg$/i, ''), svgText);
        loaded++;
      } catch (err) { console.warn('No se pudo cargar el modelo', filename, err); }
    }
    if (!loaded) { emptyEl.textContent = 'No se pudo cargar ningún modelo desde /modelos.'; emptyEl.style.display = 'block'; }
  }

  // ---- Carpeta local conectada (File System Access API: lectura + escritura real) ----
  async function connectModelsFolder() {
    if (!('showDirectoryPicker' in window)) { showToast('Tu navegador no soporta esta función'); return; }
    try {
      const handle = await window.showDirectoryPicker({ id: 'modelos', mode: 'readwrite' });
      state.folderHandle = handle;
      await idbSet('modelosDirHandle', handle);
      await loadFolderModels(handle);
      showToast('Carpeta de Modelos conectada');
    } catch (err) {
      if (err.name !== 'AbortError') { console.error(err); showToast('No se pudo conectar la carpeta'); }
    }
  }

  async function loadFolderModels(dirHandle) {
    const container = document.getElementById('modelsFolderGrid');
    const emptyEl = document.getElementById('modelsFolderEmpty');
    const statusEl = document.getElementById('modelsFolderStatus');
    container.innerHTML = '';

    let count = 0;
    try {
      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind !== 'file' || !/\.svg$/i.test(name)) continue;
        try {
          const file = await handle.getFile();
          const svgText = sanitizeSvgText(await file.text());
          if (!svgText) continue;
          renderModelItem(container, 'folder:' + name, name.replace(/\.svg$/i, ''), svgText);
          count++;
        } catch (err) { console.warn('No se pudo leer', name, err); }
      }
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Se perdió el acceso a la carpeta conectada.';
      return;
    }

    emptyEl.style.display = count ? 'none' : 'block';
    statusEl.textContent = `Conectada: “${dirHandle.name}” — ${count} archivo(s) .svg`;

    document.getElementById('folderStatusText').textContent = `Carpeta de Modelos: conectada (${dirHandle.name})`;
    document.getElementById('saveToModelsRow').style.display = 'flex';
  }

  async function writeSvgToFolder(filename, svgText) {
    try {
      const fh = await state.folderHandle.getFileHandle(filename, { create: true });
      const writable = await fh.createWritable();
      await writable.write(svgText);
      await writable.close();
      showToast(`Guardado en /modelos: ${filename}`);
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar el archivo en la carpeta de Modelos');
    }
  }

  function renderModelItem(container, sourceKey, label, svgText) {
    const item = document.createElement('div');
    item.className = 'gallery-item model-item';
    item.title = 'Añadir a la hoja A4';
    item.innerHTML = `
      <div class="gallery-thumb">${svgText}</div>
      <div class="gallery-label">${escapeHtml(label)}</div>
    `;
    item.addEventListener('click', () => {
      const id = registerOrGetAsset(sourceKey, label, svgText);
      addAssetToCanvas(id, { center: true });
      showToast(`“${label}” añadido a la hoja`);
    });
    container.appendChild(item);
  }

  function registerOrGetAsset(sourceKey, label, svgText) {
    if (sourceToAssetId.has(sourceKey)) return sourceToAssetId.get(sourceKey);
    const id = 'asset_' + (++state.assetCounter);
    state.assets.set(id, { id, name: label, svgText });
    sourceToAssetId.set(sourceKey, id);
    renderGalleryItem(state.assets.get(id));
    return id;
  }

  // ---- Persistencia del permiso de carpeta entre sesiones (IndexedDB) ----
  const IDB_NAME = 'stickerlab-db';
  const IDB_STORE = 'handles';

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSet(key, val) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tryRestoreFolderHandle() {
    if (!('indexedDB' in window) || !('showDirectoryPicker' in window)) return;
    try {
      const handle = await idbGet('modelosDirHandle');
      if (!handle) return;
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        state.folderHandle = handle;
        await loadFolderModels(handle);
      } else {
        showReconnectHint(handle);
      }
    } catch (err) { console.warn('No se pudo restaurar la carpeta de Modelos', err); }
  }

  function showReconnectHint(handle) {
    document.getElementById('folderStatusText').textContent = 'Carpeta de Modelos: conexión anterior detectada';
    const status = document.getElementById('modelsFolderStatus');
    status.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn-ghost btn-small';
    btn.textContent = 'Reactivar carpeta conectada anteriormente';
    btn.addEventListener('click', async () => {
      try {
        const perm = await handle.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') { await loadFolderModels(handle); }
        else showToast('Permiso denegado');
      } catch (err) { console.error(err); showToast('No se pudo reactivar la carpeta'); }
    });
    status.appendChild(btn);
  }

  // =========================================================================
  // RECEPCIÓN DE HANDOFF DESDE VECTRA (conversor imagen → SVG)
  // =========================================================================
  function handleVectraHandoff() {
    const params = new URLSearchParams(window.location.search);
    const cameFromVectra = params.get('from') === 'vectra';

    let raw = null;
    try { raw = sessionStorage.getItem('vectra:handoff'); } catch (err) { /* noop */ }

    if (!raw) {
      if (cameFromVectra) {
        const msg = window.location.protocol === 'file:'
          ? 'No se recibió el SVG de Vectra: al abrir los archivos con file:// el navegador no comparte datos entre páginas. Serví el sitio con un servidor local o subilo a GitHub Pages para que el envío funcione.'
          : 'No se recibió ningún SVG desde Vectra. Probá exportarlo de nuevo o usá "Descargar SVG" e impórtalo manualmente.';
        showToast(msg);
        cleanupFromParam();
      }
      return;
    }

    try { sessionStorage.removeItem('vectra:handoff'); } catch (err) { /* noop */ }

    let data;
    try { data = JSON.parse(raw); } catch (err) { console.warn('Handoff de Vectra inválido', err); cleanupFromParam(); return; }
    if (!data || !data.svgText) { cleanupFromParam(); return; }

    const svgText = sanitizeSvgText(data.svgText);
    if (!svgText) { showToast('El SVG recibido desde Vectra no es válido'); cleanupFromParam(); return; }

    const label = (data.name || 'vectra').trim() || 'vectra';
    const id = 'asset_' + (++state.assetCounter);
    state.assets.set(id, { id, name: label, svgText });
    renderGalleryItem(state.assets.get(id));
    addAssetToCanvas(id, { center: true });
    showToast(`SVG de Vectra importado: “${label}”`);
    cleanupFromParam();
  }

  function cleanupFromParam() {
    if (window.history && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete('from');
      window.history.replaceState({}, '', url.toString());
    }
  }

  // =========================================================================
  // IMPRESIÓN DIRECTA (diálogo nativo del sistema, sin pasar por descargar el PDF)
  // =========================================================================
  // Nota: por seguridad del navegador, ninguna página web puede omitir el
  // diálogo de impresión del sistema operativo. Esto abre ese diálogo ya
  // apuntando a la hoja A4 vectorial armada, para elegir ahí la impresora
  // predeterminada e imprimir, sin necesidad de generar y abrir un PDF antes.
  //
  // Implementación: se vuelca la hoja como SVG dentro de un contenedor oculto
  // (#printSheetContainer) y se usa @media print para mostrar solo esa hoja al
  // imprimir. Se evita a propósito el patrón de iframe + srcdoc porque el
  // evento "load" de un iframe no dispara de forma confiable en todos los
  // navegadores (compite con la navegación inicial a about:blank), dejando el
  // botón sin efecto visible.
  function printSheet() {
    const exportables = canvas.getObjects().filter(o => !(o.data && o.data.isGuide));
    if (!exportables.length) { showToast('No hay elementos para imprimir'); return; }

    let innerMarkup = '';
    let skipped = 0;
    for (const obj of exportables) {
      const built = buildExportSvg(obj);
      if (!built) { skipped++; continue; }
      innerMarkup += built.wrapperHtml.replace('<svg ', `<svg x="${built.x}" y="${built.y}" `);
    }
    if (!innerMarkup) { showToast('No se pudo preparar la hoja para imprimir'); return; }
    if (skipped) console.warn(`${skipped} elemento(s) se omitieron al preparar la impresión`);

    const container = document.getElementById('printSheetContainer');
    container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 ${SHEET_W_MM} ${SHEET_H_MM}">${innerMarkup}</svg>`;

    window.print();
  }

  // Limpia la hoja oculta de impresión una vez cerrado el diálogo (buena práctica,
  // no afecta el contenido real del lienzo).
  window.addEventListener('afterprint', () => {
    const container = document.getElementById('printSheetContainer');
    if (container) container.innerHTML = '';
  });

  // =========================================================================
  // TOAST
  // =========================================================================
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    const duration = Math.min(7000, Math.max(2600, msg.length * 55));
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

})();