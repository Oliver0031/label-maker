/**
 * Invoice & Label PDF Combiner
 * Core PDF processing module using pdf-lib and PDF.js.
 */

class PDFCombiner {
  constructor() {
    // Configure PDF.js worker if available
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    // A4 Standard Dimensions in PDF points (72 DPI)
    this.A4_WIDTH = 595.28;
    this.A4_HEIGHT = 841.89;
  }

  /**
   * Extract text content from a PDF ArrayBuffer using PDF.js
   * @param {ArrayBuffer} arrayBuffer
   * @returns {Promise<string>}
   */
  async extractText(arrayBuffer) {
    if (!window.pdfjsLib) {
      throw new Error('PDF.js library is not loaded');
    }
    // Clone arrayBuffer because PDF.js might detach the buffer
    const bufferClone = arrayBuffer.slice(0);
    const loadingTask = window.pdfjsLib.getDocument({ data: bufferClone });
    const pdfDoc = await loadingTask.promise;
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  }

  /**
   * Identify whether the document is an Invoice, Shipping Label, or Unknown
   * based on docs/pdf-spec.md rules.
   * @param {string} text
   * @returns {'invoice' | 'label' | 'unknown'}
   */
  identifyDocumentType(text) {
    const upperText = (text || '').toUpperCase();

    // Check Tax Invoice keywords: "TAX INVOICE" or "Bill To"
    const isInvoice = upperText.includes('TAX INVOICE') || upperText.includes('BILL TO');

    // Check Shipping Label keywords: "DELIVER TO", "AWB", or "TRACKING NO"
    const isLabel =
      upperText.includes('DELIVER TO') ||
      upperText.includes('AWB') ||
      upperText.includes('TRACKING NO');

    if (isInvoice && !isLabel) return 'invoice';
    if (isLabel && !isInvoice) return 'label';
    if (isInvoice && isLabel) {
      // If both match, check primary keyword prominence
      return upperText.indexOf('TAX INVOICE') !== -1 ? 'invoice' : 'label';
    }
    return 'unknown';
  }

  /**
   * Extract Product Name from shipping label text:
   * "Text under 'PRODUCT DETAILS' header. Extract the first 3 to 5 words for auto-naming."
   * @param {string} text
   * @returns {string}
   */
  extractProductName(text) {
    if (!text) return '';
    const upperText = text.toUpperCase();
    const marker = 'PRODUCT DETAILS';
    const index = upperText.indexOf(marker);

    if (index === -1) {
      return '';
    }

    // Substring following PRODUCT DETAILS
    const afterMarker = text.slice(index + marker.length).trim();
    // Match words (alphanumeric strings)
    const words = afterMarker.match(/[^\s\r\n\t]+/g);
    if (!words || words.length === 0) {
      return '';
    }

    // Take first 3 to 5 words (up to 5 words)
    const count = Math.min(words.length, 5);
    return words.slice(0, count).join(' ');
  }

  /**
   * Merge Invoice and Label PDF pages onto an A4 PDF output page
   *
   * Specification:
   * - Tax Invoice: Placed at top portion of the combined A4 page.
   * - Shipping Label: Placed at bottom portion, rotated 90 degrees horizontally.
   *
   * @param {Object} options
   * @param {ArrayBuffer} options.invoiceBuffer
   * @param {ArrayBuffer} options.labelBuffer
   * @param {number} [options.labelX=30]
   * @param {number} [options.labelY=30]
   * @param {number} [options.labelRotation=90]
   * @param {string} [options.productPrefix='']
   * @param {string} [options.extractedName='']
   * @returns {Promise<Uint8Array>} Merged PDF bytes
   */
  async combineDocuments({
    invoiceBuffer,
    labelBuffer,
    labelX = 30,
    labelY = 30,
    labelRotation = 90,
    productPrefix = '',
    extractedName = ''
  }) {
    if (!window.PDFLib) {
      throw new Error('pdf-lib is not loaded');
    }
    const { PDFDocument, rgb, degrees } = window.PDFLib;

    // Create target A4 PDF document
    const mergedDoc = await PDFDocument.create();
    const targetPage = mergedDoc.addPage([this.A4_WIDTH, this.A4_HEIGHT]);
    const { width: a4W, height: a4H } = targetPage.getSize();

    // 1. Process Invoice if provided
    if (invoiceBuffer) {
      const srcInvoiceDoc = await PDFDocument.load(invoiceBuffer);
      const [embeddedInvoice] = await mergedDoc.embedPages(srcInvoiceDoc.getPages().slice(0, 1));
      const invoiceDims = embeddedInvoice.scale(1.0);

      // Scale to fit width while keeping aspect ratio and staying in top half/portion
      const maxWidth = a4W;
      const maxHeight = a4H * 0.65; // Allocate upper ~65% for invoice
      const scaleW = maxWidth / invoiceDims.width;
      const scaleH = maxHeight / invoiceDims.height;
      const scale = Math.min(scaleW, scaleH, 1.0);

      const drawW = invoiceDims.width * scale;
      const drawH = invoiceDims.height * scale;
      // Center horizontally, align near top
      const drawX = (a4W - drawW) / 2;
      const drawY = a4H - drawH;

      targetPage.drawPage(embeddedInvoice, {
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH
      });
    }

    // 2. Process Shipping Label if provided
    if (labelBuffer) {
      const srcLabelDoc = await PDFDocument.load(labelBuffer);
      const [embeddedLabel] = await mergedDoc.embedPages(srcLabelDoc.getPages().slice(0, 1));
      const labelDims = embeddedLabel.scale(1.0);

      // Calculate placement dimensions considering rotation
      const rad = (labelRotation * Math.PI) / 180;
      const absCos = Math.abs(Math.cos(rad));
      const absSin = Math.abs(Math.sin(rad));

      const boundingWidth = labelDims.width * absCos + labelDims.height * absSin;
      const boundingHeight = labelDims.width * absSin + labelDims.height * absCos;

      // Ensure label fits nicely into lower portion (max width ~a4W - 40, max height ~a4H * 0.38)
      const maxLWidth = a4W - 40;
      const maxLHeight = a4H * 0.38;
      const scale = Math.min(maxLWidth / boundingWidth, maxLHeight / boundingHeight, 1.0);

      const scaledLabelW = labelDims.width * scale;
      const scaledLabelH = labelDims.height * scale;

      // Handle origin offsets when rotating around (0,0) in PDF coordinates
      let renderX = Number(labelX);
      let renderY = Number(labelY);

      if (labelRotation === 90) {
        renderX += scaledLabelH;
      } else if (labelRotation === 180) {
        renderX += scaledLabelW;
        renderY += scaledLabelH;
      } else if (labelRotation === 270) {
        renderY += scaledLabelW;
      }

      targetPage.drawPage(embeddedLabel, {
        x: renderX,
        y: renderY,
        width: scaledLabelW,
        height: scaledLabelH,
        rotate: degrees(Number(labelRotation))
      });
    }

    // 3. Optional metadata / text annotation if prefix or product name is present
    const combinedProductName = [productPrefix, extractedName].filter(Boolean).join(' ');
    if (combinedProductName) {
      // Draw subtle product annotation
      try {
        targetPage.drawText(`Product: ${combinedProductName}`, {
          x: 30,
          y: 12,
          size: 8,
          color: rgb(0.3, 0.3, 0.3)
        });
      } catch (e) {
        console.warn('Could not draw text annotation:', e);
      }
    }

    const mergedPdfBytes = await mergedDoc.save();
    return mergedPdfBytes;
  }

  /**
   * Render a PDF byte array into an HTML5 Canvas using PDF.js
   * @param {Uint8Array} pdfBytes
   * @param {HTMLCanvasElement} canvas
   * @returns {Promise<void>}
   */
  async renderToCanvas(pdfBytes, canvas) {
    if (!window.pdfjsLib) {
      throw new Error('PDF.js is not loaded');
    }
    const loadingTask = window.pdfjsLib.getDocument({ data: pdfBytes });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    // Render at crisp resolution (scale 1.5 to 2.0)
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };

    await page.render(renderContext).promise;
  }
}

// Export singleton or class to window
window.PDFCombiner = PDFCombiner;
