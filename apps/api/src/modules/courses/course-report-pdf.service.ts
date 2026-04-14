import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

type StudentRow = {
  studentId: string;
  name: string;
  sectionName: string;
  attendancePresent: number;
  attendanceTotal: number;
  assignmentTotal: number;
  labTaskTotal: number;
};

type AttendanceColumn = {
  label: string;
  values: Record<string, string>;
};

type ScoreColumn = {
  label: string;
  maxMarks: number;
  values: Record<string, number | null>;
};

type CourseReportPayload = {
  courseCode: string;
  courseTitle: string;
  semesterLabel: string;
  generatedAt: string;
  rows: StudentRow[];
  attendanceColumns: AttendanceColumn[];
  assignmentColumns: ScoreColumn[];
  labTaskColumns: ScoreColumn[];
};

@Injectable()
export class CourseReportPdfService {
  async generateCourseProgressPdf(payload: CourseReportPayload): Promise<string> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 28,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
      doc.on('error', reject);

      this.writeHeader(doc, payload);
      this.writeSummaryTable(doc, payload.rows);
      this.writeAttendanceTable(doc, payload.rows, payload.attendanceColumns);
      this.writeScoreTable(
        doc,
        'Assignment Marks',
        payload.rows,
        payload.assignmentColumns,
      );
      this.writeScoreTable(
        doc,
        'Lab Task Marks',
        payload.rows,
        payload.labTaskColumns,
      );

      doc.end();
    });
  }

  private writeHeader(doc: InstanceType<typeof PDFDocument>, payload: CourseReportPayload) {
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .text('LabAssist Course Progress Report', { align: 'center' });
    doc.moveDown(0.35);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(
        `${payload.courseCode} · ${payload.courseTitle} · ${payload.semesterLabel}`,
        { align: 'center' },
      );
    doc.moveDown(0.2);
    doc
      .fontSize(9)
      .fillColor('#5b6472')
      .text(`Generated: ${payload.generatedAt}`, { align: 'center' })
      .fillColor('#000000');
    doc.moveDown(1);
  }

  private writeSectionTitle(
    doc: InstanceType<typeof PDFDocument>,
    title: string,
    subtitle: string,
  ) {
    if (doc.y > doc.page.height - 120) {
      doc.addPage();
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(title);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#5b6472')
      .text(subtitle)
      .fillColor('#000000');
    doc.moveDown(0.5);
  }

  private drawTable(
    doc: InstanceType<typeof PDFDocument>,
    headers: string[],
    rows: string[][],
    columnWidths: number[],
  ) {
    const startX = doc.page.margins.left;
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    const rowHeight = 20;

    const drawRow = (values: string[], y: number, isHeader = false) => {
      let x = startX;
      for (let index = 0; index < values.length; index += 1) {
        const width = columnWidths[index] ?? 80;
        doc
          .save()
          .lineWidth(0.6)
          .rect(x, y, width, rowHeight)
          .fillAndStroke(isHeader ? '#eef2ff' : '#ffffff', '#d7dce5')
          .restore();
        doc
          .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(7.8)
          .fillColor('#111827')
          .text(values[index] ?? '', x + 4, y + 6, {
            width: width - 8,
            ellipsis: true,
          });
        x += width;
      }
    };

    let y = doc.y;
    drawRow(headers, y, true);
    y += rowHeight;

    for (const row of rows) {
      if (y + rowHeight > pageBottom) {
        doc.addPage();
        y = doc.page.margins.top;
        drawRow(headers, y, true);
        y += rowHeight;
      }
      drawRow(row, y);
      y += rowHeight;
    }

    doc.y = y + 10;
  }

  private writeSummaryTable(
    doc: InstanceType<typeof PDFDocument>,
    rows: StudentRow[],
  ) {
    this.writeSectionTitle(
      doc,
      'Summary',
      'Attendance and total marks collected up to the report date.',
    );

    this.drawTable(
      doc,
      [
        'Student ID',
        'Name',
        'Section',
        'Attendance',
        'Attendance %',
        'Assignment Total',
        'Lab Task Total',
      ],
      rows.map((row) => {
        const attendancePercent =
          row.attendanceTotal > 0
            ? `${((row.attendancePresent / row.attendanceTotal) * 100).toFixed(0)}%`
            : '—';

        return [
          row.studentId,
          row.name,
          row.sectionName,
          `${row.attendancePresent}/${row.attendanceTotal}`,
          attendancePercent,
          String(row.assignmentTotal),
          String(row.labTaskTotal),
        ];
      }),
      [90, 180, 80, 80, 80, 95, 90],
    );
  }

  private writeAttendanceTable(
    doc: InstanceType<typeof PDFDocument>,
    rows: StudentRow[],
    columns: AttendanceColumn[],
  ) {
    this.writeSectionTitle(
      doc,
      'Attendance Breakdown',
      columns.length
        ? 'Each lab shows Present (P), Absent (A), or no entry (—).'
        : 'No lab attendance has been recorded yet.',
    );

    if (!columns.length) {
      doc.font('Helvetica').fontSize(9).text('No attendance data available.');
      doc.moveDown(1);
      return;
    }

    const headers = ['Student ID', 'Name', 'Section', ...columns.map((column) => column.label)];
    const columnWidths = [85, 170, 70, ...columns.map(() => 54)];
    const tableRows = rows.map((row) => [
      row.studentId,
      row.name,
      row.sectionName,
      ...columns.map((column) => column.values[row.studentId] ?? '—'),
    ]);

    this.drawTable(doc, headers, tableRows, columnWidths);
  }

  private writeScoreTable(
    doc: InstanceType<typeof PDFDocument>,
    title: string,
    rows: StudentRow[],
    columns: ScoreColumn[],
  ) {
    this.writeSectionTitle(
      doc,
      title,
      columns.length
        ? 'Scores are shown per activity with the maximum marks in the header.'
        : `No ${title.toLowerCase()} data available yet.`,
    );

    if (!columns.length) {
      doc.font('Helvetica').fontSize(9).text('No scores available.');
      doc.moveDown(1);
      return;
    }

    const headers = [
      'Student ID',
      'Name',
      'Section',
      ...columns.map((column) => `${column.label} (${column.maxMarks})`),
    ];
    const columnWidths = [85, 170, 70, ...columns.map(() => 66)];
    const tableRows = rows.map((row) => [
      row.studentId,
      row.name,
      row.sectionName,
      ...columns.map((column) => {
        const value = column.values[row.studentId];
        return value == null ? '—' : String(value);
      }),
    ]);

    this.drawTable(doc, headers, tableRows, columnWidths);
  }
}
