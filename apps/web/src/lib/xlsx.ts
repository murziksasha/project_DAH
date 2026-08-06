export type XlsxCell = string | number | boolean | null | undefined | Date;

export interface XlsxSheet {
  name: string;
  rows: XlsxCell[][];
}

/** Build and download an .xlsx workbook (dynamic import keeps exceljs out of the initial bundle). */
export async function downloadXlsx(filename: string, sheets: XlsxSheet[]): Promise<void> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Мій дім';
  workbook.created = new Date();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31) || 'Sheet');
    for (const row of sheet.rows) {
      ws.addRow(row.map((c) => (c === undefined ? null : c)));
    }
    // Auto-width (capped)
    ws.columns?.forEach((col) => {
      let max = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value ?? '').length;
        if (len > max) max = Math.min(len + 2, 48);
      });
      col.width = max;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
