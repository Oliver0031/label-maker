/**
 * Invoice & Label Studio - Application Controller
 * Handles UI interactions, file drops, real-time preview updates, and export.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const uploadedFilesList = document.getElementById('uploaded-files-list');
  const productPrefixInput = document.getElementById('product-prefix');
  const extractedProductNameInput = document.getElementById('extracted-product-name');
  const posXInput = document.getElementById('pos-x');
  const posYInput = document.getElementById('pos-y');
  const posRotationSelect = document.getElementById('pos-rotation');
  const generateBtn = document.getElementById('generate-btn');
  const downloadBtn = document.getElementById('download-btn');
  const printBtn = document.getElementById('print-btn');
  const pageStatus = document.getElementById('page-status');
  const emptyState = document.getElementById('empty-state');
  const previewCanvas = document.getElementById('pdf-preview-canvas');

  // Application State
  const state = {
    invoiceFile: null,
    invoiceBuffer: null,
    labelFile: null,
    labelBuffer: null,
    extractedName: '',
    mergedPdfBytes: null,
    combiner: new window.PDFCombiner()
  };

  // Drag and Drop Listeners
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type === 'application/pdf');
    if (files.length > 0) {
      handleFiles(files);
    }
  });

  // File Input Change
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []).filter(f => f.type === 'application/pdf');
    if (files.length > 0) {
      handleFiles(files);
    }
  });

  // Clicking drop-zone triggers file input
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  // Handle uploaded PDF files
  async function handleFiles(files) {
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      try {
        const text = await state.combiner.extractText(buffer);
        const docType = state.combiner.identifyDocumentType(text);

        if (docType === 'invoice') {
          state.invoiceFile = file;
          state.invoiceBuffer = buffer;
        } else if (docType === 'label') {
          state.labelFile = file;
          state.labelBuffer = buffer;
          const extracted = state.combiner.extractProductName(text);
          if (extracted) {
            state.extractedName = extracted;
            extractedProductNameInput.value = extracted;
          }
        } else {
          // If unclassified, assign to first available slot
          if (!state.invoiceBuffer) {
            state.invoiceFile = file;
            state.invoiceBuffer = buffer;
          } else if (!state.labelBuffer) {
            state.labelFile = file;
            state.labelBuffer = buffer;
          }
        }
      } catch (err) {
        console.warn('PDF parsing error, defaulting to manual slot', err);
        if (!state.invoiceBuffer) {
          state.invoiceFile = file;
          state.invoiceBuffer = buffer;
        } else if (!state.labelBuffer) {
          state.labelFile = file;
          state.labelBuffer = buffer;
        }
      }
    }

    renderFileList();
    updateUIState();

    // Trigger auto-preview generation if both or either document is available
    if (state.invoiceBuffer || state.labelBuffer) {
      await generateMergedPreview();
    }
  }

  function renderFileList() {
    uploadedFilesList.innerHTML = '';

    if (state.invoiceFile) {
      const item = document.createElement('div');
      item.className = 'file-item';

      const fileInfo = document.createElement('div');
      fileInfo.className = 'file-info';
      fileInfo.title = state.invoiceFile.name;

      const badge = document.createElement('span');
      badge.className = 'file-badge badge-invoice';
      badge.textContent = 'Invoice';

      const fileName = document.createElement('span');
      fileName.textContent = state.invoiceFile.name;

      fileInfo.appendChild(badge);
      fileInfo.appendChild(fileName);
      item.appendChild(fileInfo);
      uploadedFilesList.appendChild(item);
    }

    if (state.labelFile) {
      const item = document.createElement('div');
      item.className = 'file-item';

      const fileInfo = document.createElement('div');
      fileInfo.className = 'file-info';
      fileInfo.title = state.labelFile.name;

      const badge = document.createElement('span');
      badge.className = 'file-badge badge-label';
      badge.textContent = 'Label';

      const fileName = document.createElement('span');
      fileName.textContent = state.labelFile.name;

      fileInfo.appendChild(badge);
      fileInfo.appendChild(fileName);
      item.appendChild(fileInfo);
      uploadedFilesList.appendChild(item);
    }
  }

  function updateUIState() {
    const hasFiles = Boolean(state.invoiceBuffer || state.labelBuffer);
    generateBtn.disabled = !hasFiles;

    if (state.invoiceBuffer && state.labelBuffer) {
      pageStatus.textContent = 'Invoice & Label Loaded';
      pageStatus.className = 'badge ready';
    } else if (state.invoiceBuffer) {
      pageStatus.textContent = 'Invoice Loaded (Missing Label)';
      pageStatus.className = 'badge';
    } else if (state.labelBuffer) {
      pageStatus.textContent = 'Label Loaded (Missing Invoice)';
      pageStatus.className = 'badge';
    } else {
      pageStatus.textContent = 'No document loaded';
      pageStatus.className = 'badge';
    }
  }

  // Generate / Update Merged Preview
  async function generateMergedPreview() {
    if (!state.invoiceBuffer && !state.labelBuffer) return;

    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span class="btn-icon">⏳</span> Processing...';

    try {
      const labelX = parseFloat(posXInput.value) || 0;
      const labelY = parseFloat(posYInput.value) || 0;
      const labelRotation = parseInt(posRotationSelect.value, 10) || 0;
      const productPrefix = productPrefixInput.value.trim();
      const extractedName = extractedProductNameInput.value.trim();

      const mergedBytes = await state.combiner.combineDocuments({
        invoiceBuffer: state.invoiceBuffer,
        labelBuffer: state.labelBuffer,
        labelX,
        labelY,
        labelRotation,
        productPrefix,
        extractedName
      });

      state.mergedPdfBytes = mergedBytes;

      // Render to canvas
      await state.combiner.renderToCanvas(mergedBytes, previewCanvas);

      emptyState.style.display = 'none';
      previewCanvas.style.display = 'block';
      downloadBtn.style.display = 'inline-flex';
    } catch (err) {
      console.error('Failed to merge documents:', err);
      alert('Error generating combined PDF preview. See console for details.');
    } finally {
      generateBtn.disabled = false;
      generateBtn.innerHTML = '<span class="btn-icon">⚡</span> Generate Combined PDF';
    }
  }

  // Event Listeners for Controls
  generateBtn.addEventListener('click', generateMergedPreview);

  [posXInput, posYInput, posRotationSelect].forEach(input => {
    input.addEventListener('change', () => {
      if (state.invoiceBuffer || state.labelBuffer) {
        generateMergedPreview();
      }
    });
  });

  productPrefixInput.addEventListener('input', () => {
    if (state.mergedPdfBytes) {
      // Debounced or on-demand re-generation
      generateMergedPreview();
    }
  });

  // Download Action
  downloadBtn.addEventListener('click', () => {
    if (!state.mergedPdfBytes) return;
    const blob = new Blob([state.mergedPdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    const prefix = productPrefixInput.value.trim();
    const prodName = extractedProductNameInput.value.trim();
    const filenameParts = ['combined'];
    if (prefix) filenameParts.push(prefix.replace(/[^a-zA-Z0-9_-]/g, '_'));
    if (prodName) filenameParts.push(prodName.replace(/[^a-zA-Z0-9_-]/g, '_'));
    const filename = `${filenameParts.join('_')}.pdf`;

    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Print Action
  printBtn.addEventListener('click', () => {
    window.print();
  });

  // Export state to window for testing / automated verification
  window.__APP_STATE__ = state;
  window.__GENERATE_PREVIEW__ = generateMergedPreview;
});
