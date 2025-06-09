

export const contactFormTemplate = (subject: string, fullName: string, content: string, phone: string, email: string) => `
  <div style="font-family: Arial, sans-serif; line-height: 1.6;">
    <h2>Thông báo Liên hệ</h2>
    <p><strong>Chủ đề:</strong> ${subject}</p>
    <p><strong>Tên liên hệ:</strong> ${fullName}</p>
    <p><strong>Số điện thoại khách hàng:</strong> ${phone}</p>
    <p><strong>Email khách hàng:</strong> ${email}</p>
    <p><strong>Nội dung:</strong></p>
    <p>${content}</p>
    <footer style="margin-top: 20px; color: #555;">
      <p>Đây là email tự động. Vui lòng không trả lời email này.</p>
    </footer>
  </div>
`;
