import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

export type LabQuizReportRow = {
  studentId: string;
  name: string;
  sectionName: string;
  submittedAt: string;
  mcqScore: number;
  shortScore: number;
  totalScore: number;
};

export type LabQuizReportPayload = {
  courseCode: string;
  courseTitle: string;
  quizTitle: string;
  sectionName: string;
  totalMarks: number;
  generatedAt: string;
  rows: LabQuizReportRow[];
};

@Injectable()
export class LabQuizReportPdfService {
  async generate(payload: LabQuizReportPayload): Promise<string> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 36 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
      doc.on('error', reject);

      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor('#0f172a')
        .text('LabAssist Lab Quiz Result');
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#475569')
        .text(`${payload.courseCode} - ${payload.courseTitle}`)
        .text(`${payload.quizTitle} · ${payload.sectionName}`)
        .text(`Total ${payload.totalMarks} · Generated ${payload.generatedAt}`);
      doc.moveDown(1);

      const columns = [
        { label: 'Student ID', width: 72 },
        { label: 'Name', width: 150 },
        { label: 'Section', width: 72 },
        { label: 'Submitted', width: 90 },
        { label: 'MCQ', width: 52 },
        { label: 'Short', width: 52 },
        { label: 'Total', width: 52 },
      ];
      this.drawRow(doc, columns, columns.map((column) => column.label), true);
      payload.rows.forEach((row, index) => {
        this.drawRow(
          doc,
          columns,
          [
            row.studentId,
            row.name,
            row.sectionName,
            row.submittedAt,
            row.mcqScore.toFixed(2),
            row.shortScore.toFixed(2),
            row.totalScore.toFixed(2),
          ],
          false,
          index,
        );
      });

      doc.end();
    });
  }

  private drawRow(
    doc: InstanceType<typeof PDFDocument>,
    columns: { label: string; width: number }[],
    values: string[],
    isHeader = false,
    rowIndex = 0,
  ) {
    const rowHeight = 28;
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + rowHeight > pageBottom) {
      doc.addPage();
    }

    let x = doc.page.margins.left;
    const y = doc.y;
    columns.forEach((column, index) => {
      doc
        .save()
        .rect(x, y, column.width, rowHeight)
        .fillAndStroke(
          isHeader ? '#e2e8f0' : rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc',
          '#cbd5e1',
        )
        .restore();
      doc
        .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(isHeader ? 8 : 7.5)
        .fillColor('#0f172a')
        .text(values[index] ?? '', x + 4, y + 8, {
          width: column.width - 8,
          lineBreak: false,
        });
      x += column.width;
    });
    doc.y = y + rowHeight;
  }
}
