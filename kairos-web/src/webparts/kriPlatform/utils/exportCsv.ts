/**
 * Unified Konstructum Executive Export Engine (ZIP containing CSV + At-A-Glance PDF).
 *
 * Every export or report action across GEMS and KAIROS produces a `.zip` archive
 * containing:
 *   1. `<name>.csv` — full structured spreadsheet data for Excel / BI analysis.
 *   2. `<name>.pdf` — formatted Landscape A4 Executive At-A-Glance PDF report with
 *      Konstructum branding, KPI summary cards, and paginated tables.
 */

export interface ExportMetric {
  label: string;
  value: string | number;
}

export interface ExportTableSection {
  title?: string;
  headers: string[];
  rows: string[][];
}

export interface ExportReportOptions {
  title?: string;
  subtitle?: string;
  platform?: 'GEMS' | 'KAIROS';
  metrics?: ExportMetric[];
  sections?: ExportTableSection[];
  additionalCsvFiles?: Array<{ filename: string; content: string }>;
}

export function escapeCsv(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsvIntoSections(
  lines: string[],
  fallbackTitle: string,
): { metrics: ExportMetric[]; sections: ExportTableSection[] } {
  const metrics: ExportMetric[] = [];
  const sections: ExportTableSection[] = [];

  const nonEmptyBlocks: string[][] = [];
  let currentBlock: string[] = [];
  for (const rawLine of lines) {
    const trimmed = String(rawLine || '').trim();
    if (!trimmed) {
      if (currentBlock.length > 0) {
        nonEmptyBlocks.push(currentBlock);
        currentBlock = [];
      }
    } else {
      currentBlock.push(trimmed);
    }
  }
  if (currentBlock.length > 0) nonEmptyBlocks.push(currentBlock);

  for (const block of nonEmptyBlocks) {
    let startIdx = 0;
    let blockTitle: string | undefined;

    const firstRow = parseCsvLine(block[0]);
    if (firstRow.length === 1 && block.length > 1) {
      blockTitle = firstRow[0];
      startIdx = 1;
    } else if (
      firstRow.length === 2
      && firstRow[0].toLowerCase() === 'generated'
      && block.length === 1
    ) {
      continue;
    }

    const remaining = block.slice(startIdx).map(parseCsvLine);
    if (remaining.length === 0) continue;

    const headers = remaining[0];
    const rows = remaining.slice(1);

    if (
      headers.length === 2
      && headers[0].toLowerCase() === 'metric'
      && headers[1].toLowerCase() === 'value'
    ) {
      for (const r of rows) {
        if (r[0] && r[1] !== undefined) {
          metrics.push({ label: r[0], value: r[1] });
        }
      }
      continue;
    }

    if (rows.length > 0 || headers.length > 1) {
      sections.push({
        title: blockTitle,
        headers,
        rows,
      });
    }
  }

  if (metrics.length === 0 && sections.length > 0) {
    const main = sections[0];
    metrics.push({ label: 'Total Records', value: main.rows.length });
    metrics.push({ label: 'Columns Tracked', value: main.headers.length });

    const statusIdx = main.headers.findIndex((h) => /status|stage/i.test(h));
    if (statusIdx >= 0 && main.rows.length > 0) {
      const counts = new Map<string, number>();
      main.rows.forEach((r) => {
        const val = String(r[statusIdx] || '').trim();
        if (val) counts.set(val, (counts.get(val) || 0) + 1);
      });
      Array.from(counts.entries())
        .slice(0, 3)
        .forEach(([k, v]) => {
          metrics.push({ label: k, value: v });
        });
    } else {
      metrics.push({
        label: 'Report Scope',
        value: fallbackTitle.replace(/[-_]/g, ' ').slice(0, 22),
      });
    }
  }

  return { metrics, sections };
}

function sanitizePdfText(input: unknown): string {
  return String(input ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u2192/g, '->')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfLiteral(input: string): string {
  return sanitizePdfText(input)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function truncateText(text: string, maxChars: number): string {
  const clean = sanitizePdfText(text);
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(maxChars - 2, 1))}..`;
}

export function buildExecutivePdfBytes(options: {
  title: string;
  subtitle: string;
  platform: 'GEMS' | 'KAIROS';
  metrics: ExportMetric[];
  sections: ExportTableSection[];
}): Uint8Array {
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const marginX = 34;
  const usableWidth = pageWidth - marginX * 2;

  const pages: string[][] = [];
  let cmds: string[] = [];
  let cursorY = 0;

  const isGems = options.platform === 'GEMS';
  const primaryRgb = isGems ? '0.05 0.58 0.53' : '0.15 0.39 0.92';
  const headerBgRgb = isGems ? '0.035 0.118 0.173' : '0.043 0.082 0.157';
  const generatedStr = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const startNewPage = (isFirstPage: boolean) => {
    if (cmds.length > 0) {
      pages.push(cmds);
    }
    cmds = [];

    cmds.push('1 1 1 rg');
    cmds.push(`0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)} re f`);

    const bannerHeight = isFirstPage ? 68 : 46;
    const bannerBottom = pageHeight - bannerHeight;
    cmds.push(`${headerBgRgb} rg`);
    cmds.push(`0 ${bannerBottom.toFixed(2)} ${pageWidth.toFixed(2)} ${bannerHeight.toFixed(2)} re f`);

    cmds.push(`${primaryRgb} rg`);
    cmds.push(`0 ${(bannerBottom - 3).toFixed(2)} ${pageWidth.toFixed(2)} 3 re f`);

    cmds.push('BT');
    cmds.push('/F2 9 Tf');
    cmds.push('0.37 0.92 0.83 rg');
    cmds.push(`${marginX} ${(pageHeight - 20).toFixed(2)} Td`);
    cmds.push(`(${escapePdfLiteral(`KONSTRUCTUM  |  ${options.platform} EXECUTIVE AT-A-GLANCE REPORT`)}) Tj`);
    cmds.push('ET');

    cmds.push('BT');
    cmds.push(`/F2 ${isFirstPage ? 16 : 12} Tf`);
    cmds.push('1 1 1 rg');
    cmds.push(`${marginX} ${(pageHeight - (isFirstPage ? 42 : 36)).toFixed(2)} Td`);
    cmds.push(`(${escapePdfLiteral(truncateText(options.title, 72))}) Tj`);
    cmds.push('ET');

    if (isFirstPage && options.subtitle) {
      cmds.push('BT');
      cmds.push('/F1 8.5 Tf');
      cmds.push('0.80 0.86 0.92 rg');
      cmds.push(`${marginX} ${(pageHeight - 57).toFixed(2)} Td`);
      cmds.push(`(${escapePdfLiteral(truncateText(options.subtitle, 110))}) Tj`);
      cmds.push('ET');
    }

    cmds.push('BT');
    cmds.push('/F1 8 Tf');
    cmds.push('0.80 0.86 0.92 rg');
    cmds.push(`${(pageWidth - marginX - 165).toFixed(2)} ${(pageHeight - 22).toFixed(2)} Td`);
    cmds.push(`(${escapePdfLiteral(`Generated: ${generatedStr}`)}) Tj`);
    cmds.push('ET');

    cursorY = bannerBottom - 18;

    if (isFirstPage && options.metrics.length > 0) {
      const visibleMetrics = options.metrics.slice(0, 5);
      const gap = 10;
      const cardWidth = (usableWidth - gap * (visibleMetrics.length - 1)) / visibleMetrics.length;
      const cardHeight = 46;
      const cardBottom = cursorY - cardHeight;

      visibleMetrics.forEach((m, idx) => {
        const x = marginX + idx * (cardWidth + gap);
        cmds.push('0.973 0.980 0.988 rg');
        cmds.push(`${x.toFixed(2)} ${cardBottom.toFixed(2)} ${cardWidth.toFixed(2)} ${cardHeight} re f`);
        cmds.push('0.886 0.910 0.941 RG 0.75 w');
        cmds.push(`${x.toFixed(2)} ${cardBottom.toFixed(2)} ${cardWidth.toFixed(2)} ${cardHeight} re S`);
        cmds.push(`${primaryRgb} rg`);
        cmds.push(`${x.toFixed(2)} ${(cardBottom + cardHeight - 2.5).toFixed(2)} ${cardWidth.toFixed(2)} 2.5 re f`);

        cmds.push('BT');
        cmds.push('/F2 7.5 Tf');
        cmds.push('0.39 0.45 0.55 rg');
        cmds.push(`${(x + 10).toFixed(2)} ${(cardBottom + 30).toFixed(2)} Td`);
        cmds.push(`(${escapePdfLiteral(truncateText(m.label.toUpperCase(), 24))}) Tj`);
        cmds.push('ET');

        cmds.push('BT');
        cmds.push('/F2 13 Tf');
        cmds.push('0.06 0.09 0.16 rg');
        cmds.push(`${(x + 10).toFixed(2)} ${(cardBottom + 11).toFixed(2)} Td`);
        cmds.push(`(${escapePdfLiteral(truncateText(String(m.value), 22))}) Tj`);
        cmds.push('ET');
      });

      cursorY = cardBottom - 16;
    }
  };

  startNewPage(true);

  const bottomLimit = 44;

  for (const section of options.sections) {
    const rawHeaders = section.headers.slice(0, 10);
    const colCount = Math.max(rawHeaders.length, 1);

    if (cursorY - 45 < bottomLimit) {
      startNewPage(false);
    }

    if (section.title) {
      cmds.push('BT');
      cmds.push('/F2 10.5 Tf');
      cmds.push('0.06 0.09 0.16 rg');
      cmds.push(`${marginX} ${(cursorY - 10).toFixed(2)} Td`);
      cmds.push(`(${escapePdfLiteral(truncateText(section.title, 90))}) Tj`);
      cmds.push('ET');
      cursorY -= 18;
    }

    const weights = rawHeaders.map((h, colIdx) => {
      let maxLen = h.length;
      for (let r = 0; r < Math.min(section.rows.length, 25); r++) {
        const cellLen = String(section.rows[r]?.[colIdx] || '').length;
        if (cellLen > maxLen) maxLen = cellLen;
      }
      return Math.min(Math.max(maxLen, 8), 38);
    });
    const totalWeight = weights.reduce((acc, w) => acc + w, 0) || 1;
    const colWidths = weights.map((w) => (w / totalWeight) * usableWidth);

    const drawTableHeader = () => {
      const thHeight = 20;
      const thBottom = cursorY - thHeight;
      cmds.push('0.06 0.09 0.16 rg');
      cmds.push(`${marginX} ${thBottom.toFixed(2)} ${usableWidth.toFixed(2)} ${thHeight} re f`);

      let colX = marginX;
      rawHeaders.forEach((h, cIdx) => {
        const w = colWidths[cIdx];
        const maxChars = Math.max(Math.floor((w - 8) / 4.3), 4);
        cmds.push('BT');
        cmds.push('/F2 7.5 Tf');
        cmds.push('1 1 1 rg');
        cmds.push(`${(colX + 5).toFixed(2)} ${(thBottom + 6.5).toFixed(2)} Td`);
        cmds.push(`(${escapePdfLiteral(truncateText(h, maxChars))}) Tj`);
        cmds.push('ET');
        colX += w;
      });
      cursorY = thBottom;
    };

    drawTableHeader();

    const rowHeight = 17.5;
    if (section.rows.length === 0) {
      const emptyBottom = cursorY - rowHeight;
      cmds.push('0.98 0.98 0.99 rg');
      cmds.push(`${marginX} ${emptyBottom.toFixed(2)} ${usableWidth.toFixed(2)} ${rowHeight} re f`);
      cmds.push('BT /F1 8 Tf 0.45 0.50 0.58 rg');
      cmds.push(`${marginX + 8} ${(emptyBottom + 5.5).toFixed(2)} Td (No records in this section.) Tj ET`);
      cursorY = emptyBottom - 12;
      continue;
    }

    section.rows.forEach((row, rIdx) => {
      if (cursorY - rowHeight < bottomLimit) {
        startNewPage(false);
        drawTableHeader();
      }

      const rowBottom = cursorY - rowHeight;
      if (rIdx % 2 === 1) {
        cmds.push('0.973 0.980 0.988 rg');
        cmds.push(`${marginX} ${rowBottom.toFixed(2)} ${usableWidth.toFixed(2)} ${rowHeight} re f`);
      }

      cmds.push('0.89 0.91 0.94 RG 0.4 w');
      cmds.push(`${marginX} ${rowBottom.toFixed(2)} m ${(marginX + usableWidth).toFixed(2)} ${rowBottom.toFixed(2)} l S`);

      let colX = marginX;
      for (let cIdx = 0; cIdx < colCount; cIdx++) {
        const w = colWidths[cIdx];
        const maxChars = Math.max(Math.floor((w - 8) / 4.1), 4);
        const cellVal = String(row[cIdx] ?? '-');
        cmds.push('BT');
        cmds.push('/F1 7.5 Tf');
        cmds.push('0.12 0.16 0.23 rg');
        cmds.push(`${(colX + 5).toFixed(2)} ${(rowBottom + 5.2).toFixed(2)} Td`);
        cmds.push(`(${escapePdfLiteral(truncateText(cellVal, maxChars))}) Tj`);
        cmds.push('ET');
        colX += w;
      }

      cursorY = rowBottom;
    });

    cursorY -= 16;
  }

  if (cmds.length > 0) {
    pages.push(cmds);
  }

  const totalPages = pages.length;
  pages.forEach((pCmds, idx) => {
    pCmds.push('0.88 0.91 0.94 RG 0.6 w');
    pCmds.push(`${marginX} 28 m ${(pageWidth - marginX).toFixed(2)} 28 l S`);

    pCmds.push('BT /F1 7.5 Tf 0.45 0.50 0.58 rg');
    pCmds.push(`${marginX} 16 Td`);
    pCmds.push(
      `(${escapePdfLiteral('KONSTRUCTUM GROUP  |  40 Adetokunbo Ademola Street, Victoria Island, Lagos  |  Confidential Internal Report')}) Tj`,
    );
    pCmds.push('ET');

    pCmds.push('BT /F2 7.5 Tf 0.30 0.35 0.45 rg');
    pCmds.push(`${(pageWidth - marginX - 65).toFixed(2)} 16 Td`);
    pCmds.push(`(${escapePdfLiteral(`Page ${idx + 1} of ${totalPages}`)}) Tj`);
    pCmds.push('ET');
  });

  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('');
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj');
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj');

  const pageObjNums: number[] = [];
  pages.forEach((pCmds) => {
    const streamContent = pCmds.join('\n');
    const contentObjNum = objects.length + 1;
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj`,
    );

    const pageObjNum = objects.length + 1;
    pageObjNums.push(pageObjNum);
    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj`,
    );
  });

  objects[1] = `2 0 obj\n<< /Type /Pages /Count ${pageObjNums.length} /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] >>\nendobj`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((obj) => {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildZipArchive(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0x0f) << 5) | (now.getDate() & 0x1f);

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, file.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLength = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of localParts) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(eocd, pos);
  return out;
}

function triggerZipDownload(zipFilename: string, zipBytes: Uint8Array): void {
  const blob = new Blob([zipBytes as unknown as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function humanizeFilename(baseName: string): string {
  return baseName
    .replace(/\.(csv|zip|pdf)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function downloadCsv(
  filename: string,
  lines: string[],
  options?: ExportReportOptions,
): void {
  const baseName = filename.replace(/\.(csv|zip|pdf)$/i, '');
  const csvContent = `\uFEFF${lines.join('\r\n')}`;
  const csvBytes = new TextEncoder().encode(csvContent);

  const parsed = parseCsvIntoSections(lines, baseName);
  const reportTitle = options?.title || humanizeFilename(baseName);
  const platform: 'GEMS' | 'KAIROS' =
    options?.platform || (baseName.toLowerCase().includes('kri') || baseName.toLowerCase().includes('kairos') ? 'KAIROS' : 'GEMS');
  const subtitle =
    options?.subtitle
    || `Executive summary and structured data export (${lines.length} rows). Includes CSV spreadsheet and PDF visual overview.`;

  const pdfBytes = buildExecutivePdfBytes({
    title: reportTitle,
    subtitle,
    platform,
    metrics: options?.metrics?.length ? options.metrics : parsed.metrics,
    sections: options?.sections?.length ? options.sections : parsed.sections,
  });

  const zipEntries: Array<{ name: string; data: Uint8Array }> = [
    { name: `${baseName}.csv`, data: csvBytes },
    { name: `${baseName}.pdf`, data: pdfBytes },
  ];

  if (options?.additionalCsvFiles?.length) {
    for (const extra of options.additionalCsvFiles) {
      const extraName = extra.filename.endsWith('.csv') ? extra.filename : `${extra.filename}.csv`;
      zipEntries.push({
        name: extraName,
        data: new TextEncoder().encode(`\uFEFF${extra.content}`),
      });
    }
  }

  const zipBytes = buildZipArchive(zipEntries);
  triggerZipDownload(`${baseName}.zip`, zipBytes);
}
