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

type TableColumn = {
  label: string;
  width: number;
  align?: 'left' | 'center' | 'right';
};

@Injectable()
export class CourseReportPdfService {
  async generateCourseProgressPdf(
    payload: CourseReportPayload,
  ): Promise<string> {
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

  private getContentWidth(doc: InstanceType<typeof PDFDocument>): number {
    return doc.page.width - doc.page.margins.left - doc.page.margins.right;
  }

  private ensureSpace(
    doc: InstanceType<typeof PDFDocument>,
    neededHeight: number,
  ) {
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + neededHeight > pageBottom) {
      doc.addPage();
    }
  }

  private writeHeader(
    doc: InstanceType<typeof PDFDocument>,
    payload: CourseReportPayload,
  ) {
    const startX = doc.page.margins.left;
    const startY = doc.y;
    const width = this.getContentWidth(doc);
    const headerHeight = 86;

    doc
      .save()
      .roundedRect(startX, startY, width, headerHeight, 18)
      .fill('#0f172a')
      .restore();

    doc
      .font('Helvetica-Bold')
      .fontSize(19)
      .fillColor('#ffffff')
      .text('LabAssist Course Progress Report', startX + 20, startY + 18, {
        width: width - 40,
      });

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#cbd5e1')
      .text(
        `${payload.courseCode} · ${payload.courseTitle}`,
        startX + 20,
        startY + 44,
        {
          width: width - 40,
        },
      )
      .text(
        `${payload.semesterLabel} · Generated ${payload.generatedAt}`,
        startX + 20,
        startY + 59,
        { width: width - 40 },
      )
      .fillColor('#000000');

    doc.y = startY + headerHeight + 18;
  }

  private writeSectionTitle(
    doc: InstanceType<typeof PDFDocument>,
    title: string,
    subtitle: string,
  ) {
    this.ensureSpace(doc, 56);

    doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text(title);
    doc.font('Helvetica').fontSize(9).fillColor('#475569').text(subtitle);
    doc.fillColor('#000000');
    doc.moveDown(0.45);
  }

  private drawTable(
    doc: InstanceType<typeof PDFDocument>,
    columns: TableColumn[],
    rows: string[][],
  ) {
    const startX = doc.page.margins.left;
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    const paddingX = 5;
    const paddingY = 6;
    const minHeaderHeight = 28;
    const minRowHeight = 24;

    const measureRowHeight = (values: string[], isHeader = false) => {
      return values.reduce(
        (height, value, index) => {
          const column = columns[index];
          const textWidth = Math.max(10, (column?.width ?? 80) - paddingX * 2);
          doc
            .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(isHeader ? 8 : 7.8);
          const textHeight = doc.heightOfString(value ?? '', {
            width: textWidth,
            align: column?.align ?? 'left',
          });
          const minHeight = isHeader ? minHeaderHeight : minRowHeight;
          return Math.max(
            height,
            Math.max(minHeight, textHeight + paddingY * 2),
          );
        },
        isHeader ? minHeaderHeight : minRowHeight,
      );
    };

    const drawRow = (
      values: string[],
      y: number,
      rowIndex: number,
      isHeader = false,
    ) => {
      const rowHeight = measureRowHeight(values, isHeader);
      let x = startX;

      for (let index = 0; index < columns.length; index += 1) {
        const column = columns[index];
        const cellValue = values[index] ?? '';
        const fillColor = isHeader
          ? '#e2e8f0'
          : rowIndex % 2 === 0
            ? '#ffffff'
            : '#f8fafc';

        doc
          .save()
          .lineWidth(0.65)
          .rect(x, y, column.width, rowHeight)
          .fillAndStroke(fillColor, '#cbd5e1')
          .restore();

        doc
          .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(isHeader ? 8 : 7.8)
          .fillColor('#0f172a')
          .text(cellValue, x + paddingX, y + paddingY, {
            width: column.width - paddingX * 2,
            align: column.align ?? 'left',
          });

        x += column.width;
      }

      return rowHeight;
    };

    const headers = columns.map((column) => column.label);
    let y = doc.y;

    const drawHeader = () => {
      y = doc.y;
      y += drawRow(headers, y, 0, true);
    };

    drawHeader();

    rows.forEach((row, index) => {
      const rowHeight = measureRowHeight(row);
      if (y + rowHeight > pageBottom) {
        doc.addPage();
        drawHeader();
      }
      y += drawRow(row, y, index, false);
    });

    doc.y = y + 12;
  }

  private getDynamicChunkSize(
    doc: InstanceType<typeof PDFDocument>,
    baseColumns: TableColumn[],
    dynamicWidth: number,
  ): number {
    const baseWidth = baseColumns.reduce(
      (sum, column) => sum + column.width,
      0,
    );
    const available = Math.max(0, this.getContentWidth(doc) - baseWidth);
    return Math.max(1, Math.floor(available / dynamicWidth));
  }

  private chunkColumns<T>(columns: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < columns.length; index += chunkSize) {
      chunks.push(columns.slice(index, index + chunkSize));
    }
    return chunks;
  }

  private writeSummaryTable(
    doc: InstanceType<typeof PDFDocument>,
    rows: StudentRow[],
  ) {
    this.writeSectionTitle(
      doc,
      'Summary',
      'Attendance and cumulative marks captured up to the report generation time.',
    );

    const columns: TableColumn[] = [
      { label: 'Student ID', width: 92 },
      { label: 'Student Name', width: 188 },
      { label: 'Section', width: 78 },
      { label: 'Attendance', width: 82, align: 'center' },
      { label: 'Attendance %', width: 78, align: 'center' },
      { label: 'Assignment Total', width: 94, align: 'center' },
      { label: 'Lab Task Total', width: 94, align: 'center' },
    ];

    this.drawTable(
      doc,
      columns,
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
        ? 'Each lab shows Present (P), Absent (A), or no entry (—). Wide reports are split into clean column groups.'
        : 'No lab attendance has been recorded yet.',
    );

    if (!columns.length) {
      doc.font('Helvetica').fontSize(9).text('No attendance data available.');
      doc.moveDown(1);
      return;
    }

    const baseColumns: TableColumn[] = [
      { label: 'Student ID', width: 84 },
      { label: 'Student Name', width: 170 },
      { label: 'Section', width: 70 },
    ];
    const dynamicWidth = 56;
    const chunkSize = this.getDynamicChunkSize(doc, baseColumns, dynamicWidth);
    const columnChunks = this.chunkColumns(columns, chunkSize);

    columnChunks.forEach((chunk, index) => {
      if (index > 0) {
        this.writeSectionTitle(
          doc,
          'Attendance Breakdown (Continued)',
          `Activities ${index * chunkSize + 1}-${index * chunkSize + chunk.length} of ${columns.length}.`,
        );
      }

      this.drawTable(
        doc,
        [
          ...baseColumns,
          ...chunk.map((column) => ({
            label: column.label,
            width: dynamicWidth,
            align: 'center' as const,
          })),
        ],
        rows.map((row) => [
          row.studentId,
          row.name,
          row.sectionName,
          ...chunk.map((column) => column.values[row.studentId] ?? '—'),
        ]),
      );
    });
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
        ? 'Scores are grouped into compact, repeatable tables to keep every page aligned and readable.'
        : `No ${title.toLowerCase()} data available yet.`,
    );

    if (!columns.length) {
      doc.font('Helvetica').fontSize(9).text('No scores available.');
      doc.moveDown(1);
      return;
    }

    const baseColumns: TableColumn[] = [
      { label: 'Student ID', width: 84 },
      { label: 'Student Name', width: 170 },
      { label: 'Section', width: 70 },
    ];
    const dynamicWidth = 68;
    const chunkSize = this.getDynamicChunkSize(doc, baseColumns, dynamicWidth);
    const columnChunks = this.chunkColumns(columns, chunkSize);

    columnChunks.forEach((chunk, index) => {
      if (index > 0) {
        this.writeSectionTitle(
          doc,
          `${title} (Continued)`,
          `Activities ${index * chunkSize + 1}-${index * chunkSize + chunk.length} of ${columns.length}.`,
        );
      }

      this.drawTable(
        doc,
        [
          ...baseColumns,
          ...chunk.map((column) => ({
            label: `${column.label}\nMax ${column.maxMarks}`,
            width: dynamicWidth,
            align: 'center' as const,
          })),
        ],
        rows.map((row) => [
          row.studentId,
          row.name,
          row.sectionName,
          ...chunk.map((column) => {
            const value = column.values[row.studentId];
            return value == null ? '—' : String(value);
          }),
        ]),
      );
    });
  }
}
