import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter;

  constructor() {
    // Tạo đối tượng transporter từ các biến môi trường
    this.transporter = nodemailer.createTransport({
      service: 'gmail', // Hoặc dịch vụ email khác như SendGrid, Mailgun, v.v.
      auth: {
        user: process.env.EMAIL_USER, // Sử dụng biến môi trường EMAIL_USER
        pass: process.env.EMAIL_PASS, // Sử dụng biến môi trường EMAIL_PASS
      },
    });
  }

  // Phương thức gửi email cơ bản
  async sendMail(to: string, subject: string, text: string) {
    const mailOptions = {
      from: process.env.EMAIL_USER, // Địa chỉ email gửi
      to: to, // Địa chỉ email nhận
      subject: subject, // Tiêu đề email
      text: text, // Nội dung email
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully!');
    } catch (error) {
      console.error('Error sending email:', error);
    }
  }

  // Phương thức gửi email với tệp đính kèm
  // Phương thức gửi email với tệp đính kèm từ nội dung bộ nhớ
  async sendMailWithAttachment(to: string, subject: string, text: string, attachments: any[]) {
    const mailOptions = {
      from: process.env.EMAIL_USER,  // Địa chỉ email gửi
      to: to,                        // Địa chỉ email nhận
      subject: subject,              // Tiêu đề email
      text: text,                    // Nội dung email
      attachments: attachments,      // Tệp đính kèm
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully!');
    } catch (error) {
      console.error('Error sending email:', error);
    }
  }

  async sendPasswordResetEmail(to: string, resetToken: string) {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: 'Password Reset Request',
      html: `<p>Click the link below to reset your password:</p><a href="${resetLink}">${resetLink}</a>`,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Password reset email sent successfully!');
    } catch (error) {
      console.error('Error sending password reset email:', error);
    }
  }
}
