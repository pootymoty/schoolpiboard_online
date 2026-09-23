/**
 * Листы конспекта — одним PDF-файлом, а не картинками по одной.
 *
 * `jsPDF` подгружается по требованию, тем же приёмом, что и `pdfjs-dist`
 * в `pdf.ts`: библиотека нужна не всем, и тащить её в основной пакет
 * незачем. Единица измерения — «px»: страница листа уже нарисована в
 * пикселях (`renderBoard`), и печатать её через миллиметры значило бы
 * взять на себя лишний пересчёт там, где он не нужен.
 */
async function buildPdf(sheets: { name: string; blob: Blob }[]): Promise<import('jspdf').jsPDF> {
  const { jsPDF } = await import('jspdf');
  let doc: import('jspdf').jsPDF | null = null;

  for (const sheet of sheets) {
    const bitmap = await createImageBitmap(sheet.blob);
    const bytes = new Uint8Array(await sheet.blob.arrayBuffer());

    if (!doc) {
      doc = new jsPDF({ unit: 'px', format: [bitmap.width, bitmap.height] });
    } else {
      doc.addPage([bitmap.width, bitmap.height]);
    }

    doc.addImage(bytes, 'PNG', 0, 0, bitmap.width, bitmap.height);
    bitmap.close();
  }

  return doc!;
}

/** Сохраняет конспект PDF-файлом на диск. */
export async function sheetsToPdf(
  sheets: { name: string; blob: Blob }[], title: string,
): Promise<boolean> {
  if (sheets.length === 0) return false;

  const doc = await buildPdf(sheets);
  doc.save(`${title || 'Конспект'}.pdf`);
  return true;
}

/** Тот же файл, но как Blob — для отправки по почте вместо картинок. */
export async function sheetsToPdfBlob(sheets: { name: string; blob: Blob }[]): Promise<Blob | null> {
  if (sheets.length === 0) return null;

  const doc = await buildPdf(sheets);
  return doc.output('blob');
}
