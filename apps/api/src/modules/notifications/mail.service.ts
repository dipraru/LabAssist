import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get('MAIL_HOST'),
      port: config.get<number>('MAIL_PORT') ?? 587,
      secure: false,
      auth: {
        user: config.get('MAIL_USER'),
        pass: config.get('MAIL_PASS'),
      },
    });
  }

  async sendMail(opts: { to: string; subject: string; body: string }): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM'),
      to: opts.to,
      subject: `[LabAssist] ${opts.subject}`,
      text: opts.body,
      html: `<div style="font-family:sans-serif;max-width:600px;">
        <h2 style="color:#1a1a2e;">${opts.subject}</h2>
        <p>${opts.body}</p>
        <hr/>
        <small style="color:#888;">LabAssist — CSE Lab Portal</small>
      </div>`,
    });
  }
}
