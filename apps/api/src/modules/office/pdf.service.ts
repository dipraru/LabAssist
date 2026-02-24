import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

interface Credential {
  username: string;
  password: string;
  name: string;
}

@Injectable()
export class PdfService {
  async generateCredentialsPdf(credentials: Credential[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 30 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const margin = 30;
      const colWidth = (pageWidth - margin * 2 - 10) / 2;
      const cardHeight = 80;
      const cardPadding = 8;
      const rowsPerPage = Math.floor((doc.page.height - margin * 2) / (cardHeight + 8));

      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('LabAssist — Account Credentials', { align: 'center' });
      doc.moveDown(0.5);
      doc
        .fontSize(9)
        .font('Helvetica')
        .text(`Generated: ${new Date().toLocaleString()}  |  Total accounts: ${credentials.length}`, {
          align: 'center',
        });
      doc.moveDown(1);

      let col = 0;
      let row = 0;
      let firstCard = true;

      for (let i = 0; i < credentials.length; i++) {
        const cred = credentials[i];
        const x = margin + col * (colWidth + 10);
        const y = margin + 60 + row * (cardHeight + 8);

        // New page if needed
        if (!firstCard && row === 0 && col === 0) {
          doc.addPage();
        }
        firstCard = false;

        // Card border
        doc.rect(x, y, colWidth, cardHeight).stroke('#555555');

        // Card header
        doc
          .fillColor('#1a1a2e')
          .rect(x, y, colWidth, 20)
          .fill();

        doc
          .fillColor('#ffffff')
          .fontSize(8)
          .font('Helvetica-Bold')
          .text('LabAssist Account', x + cardPadding, y + 6, {
            width: colWidth - cardPadding * 2,
            align: 'left',
          });

        doc.fillColor('#000000');

        // Name
        doc
          .fontSize(8.5)
          .font('Helvetica-Bold')
          .text(cred.name, x + cardPadding, y + 26, {
            width: colWidth - cardPadding * 2,
            ellipsis: true,
          });

        // Username
        doc
          .fontSize(8)
          .font('Helvetica')
          .text(`Username: `, x + cardPadding, y + 40, { continued: true })
          .font('Helvetica-Bold')
          .text(cred.username);

        // Password
        doc
          .font('Helvetica')
          .text(`Password: `, x + cardPadding, y + 52, { continued: true })
          .font('Helvetica-Bold')
          .text(cred.password);

        // Note
        doc
          .fontSize(6.5)
          .font('Helvetica-Oblique')
          .fillColor('#555')
          .text('* Change your password on first login', x + cardPadding, y + 64, {
            width: colWidth - cardPadding * 2,
          });

        doc.fillColor('#000');

        // Advance grid position
        col++;
        if (col >= 2) {
          col = 0;
          row++;
          if (row >= rowsPerPage) {
            row = 0;
          }
        }
      }

      doc.end();
    });
  }
}
