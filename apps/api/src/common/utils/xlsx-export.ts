import ExcelJS from 'exceljs';

export type XlsxCell = string | number | boolean | null | undefined | Date;

export async function rowsToXlsxBuffer(
  sheets: Array<{ name: string; rows: XlsxCell[][] }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Мій дім';
  workbook.created = new Date();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet((sheet.name || 'Sheet').slice(0, 31));
    for (const row of sheet.rows) {
      ws.addRow(row.map((c) => (c === undefined ? null : c)));
    }
    ws.columns?.forEach((col) => {
      let max = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value ?? '').length;
        if (len > max) max = Math.min(len + 2, 48);
      });
      col.width = max;
    });
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
