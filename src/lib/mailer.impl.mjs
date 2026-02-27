import nodemailer from "nodemailer";
import { PaymentMethod } from "@prisma/client";
import {
  APP_BASE_URL,
  SMTP_FROM,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
} from "../config/env.js";
const DATE_TIMEZONE = "Asia/Jakarta";
const MS_PER_DAY = 24 * 60 * 60 * 1e3;
const resolveFromAddress = () =>
  SMTP_FROM || SMTP_USER || "no-reply@bookin.local";
const logEmailSent = (label, to, metadata = "") => {
  const suffix = metadata ? ` | ${metadata}` : "";
  console.info(`[Email] Sent ${label} | To: ${to}${suffix}`);
};
const createTransporter = () =>
  nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE || SMTP_PORT === 465,
    auth:
      SMTP_USER && SMTP_PASS
        ? {
            user: SMTP_USER,
            pass: SMTP_PASS,
          }
        : void 0,
  });
const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const formatRupiah = (value) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(parsed)) return String(value);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(parsed);
};
const formatDate = (value) =>
  new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: DATE_TIMEZONE,
  }).format(value);
const formatDateTime = (value) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DATE_TIMEZONE,
  }).format(value);
const toPaymentMethodLabel = (method) => {
  if (method === PaymentMethod.MANUAL_TRANSFER) return "Transfer Manual";
  if (method === PaymentMethod.XENDIT) return "Xendit Payment Gateway";
  return method;
};
const countNights = (checkIn, checkOut) => {
  const start = Date.UTC(
    checkIn.getUTCFullYear(),
    checkIn.getUTCMonth(),
    checkIn.getUTCDate(),
  );
  const end = Date.UTC(
    checkOut.getUTCFullYear(),
    checkOut.getUTCMonth(),
    checkOut.getUTCDate(),
  );
  const nights = Math.round((end - start) / MS_PER_DAY);
  return nights > 0 ? nights : 1;
};
const sendVerificationEmail = async (payload) => {
  const verifyUrl = `${APP_BASE_URL}/verify-email?token=${payload.token}`;
  const expiresAtText = formatDateTime(payload.expiresAt);
  if (!SMTP_HOST) {
    console.info(
      `[Email] To: ${payload.to} | Hi ${payload.name}, verify at: ${verifyUrl} (expires ${payload.expiresAt.toISOString()})`,
    );
    console.warn(
      "[Email] SMTP_HOST belum di-set. Email verifikasi belum dikirim.",
    );
    return;
  }
  const transporter = createTransporter();
  const fromAddress = resolveFromAddress();
  const subject = `[BookIn] Verifikasi Akun - ${payload.to}`;
  const text = [
    `Yth. ${payload.name},`,
    "",
    "Terima kasih telah mendaftar di BookIn.",
    "Untuk menyelesaikan proses pendaftaran, mohon lakukan verifikasi email melalui tautan berikut:",
    verifyUrl,
    "",
    `Batas waktu verifikasi: ${expiresAtText} WIB`,
    "Apabila Anda tidak merasa melakukan pendaftaran ini, silakan abaikan email ini.",
    "",
    "Hormat kami,",
    "Tim BookIn",
    "",
    "-----",
    "",
    `Dear ${payload.name},`,
    "",
    "Thank you for registering with BookIn.",
    "To complete your registration, please verify your email using the link below:",
    verifyUrl,
    "",
    `Verification expiry time: ${expiresAtText} WIB`,
    "If you did not initiate this registration, please disregard this email.",
    "",
    "Sincerely,",
    "BookIn Team",
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 640px;">
      <h2 style="margin:0 0 12px;">[BookIn] Verifikasi Akun / Account Verification</h2>
      <p>Yth. ${escapeHtml(payload.name)},</p>
      <p>Terima kasih telah mendaftar di BookIn.</p>
      <p>Untuk menyelesaikan proses pendaftaran, mohon lakukan verifikasi email melalui tombol berikut.</p>
      <p style="margin:16px 0;">
        <a href="${verifyUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:20px;">
          Verifikasi Email
        </a>
      </p>
      <p>Atau gunakan tautan ini: <a href="${verifyUrl}">${verifyUrl}</a></p>
      <p><strong>Batas waktu verifikasi:</strong> ${escapeHtml(expiresAtText)} WIB</p>
      <p>Apabila Anda tidak merasa melakukan pendaftaran ini, silakan abaikan email ini.</p>
      <p>Hormat kami,<br/>Tim BookIn</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0;" />
      <p>Dear ${escapeHtml(payload.name)},</p>
      <p>Thank you for registering with BookIn.</p>
      <p>To complete your registration, please verify your email using the button below.</p>
      <p style="margin:16px 0;">
        <a href="${verifyUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:20px;">
          Verify Email
        </a>
      </p>
      <p>Or use this link: <a href="${verifyUrl}">${verifyUrl}</a></p>
      <p><strong>Verification expiry time:</strong> ${escapeHtml(expiresAtText)} WIB</p>
      <p>If you did not initiate this registration, please disregard this email.</p>
      <p>Sincerely,<br/>BookIn Team</p>
    </div>
  `;
  await transporter.sendMail({
    from: fromAddress,
    to: payload.to,
    subject,
    text,
    html,
  });
  logEmailSent("verification", payload.to);
};
const sendPasswordResetEmail = async (payload) => {
  const resetUrl = `${APP_BASE_URL}/reset-password/confirm?token=${payload.token}`;
  const expiresAtText = formatDateTime(payload.expiresAt);
  if (!SMTP_HOST) {
    console.info(
      `[Email] To: ${payload.to} | Hi ${payload.name}, reset at: ${resetUrl} (expires ${payload.expiresAt.toISOString()})`,
    );
    console.warn(
      "[Email] SMTP_HOST belum di-set. Email reset password belum dikirim.",
    );
    return;
  }
  const transporter = createTransporter();
  const fromAddress = resolveFromAddress();
  const subject = `[BookIn] Reset Password - ${payload.to}`;
  const text = [
    `Yth. ${payload.name},`,
    "",
    "Kami menerima permintaan reset password untuk akun BookIn Anda.",
    "Silakan gunakan tautan berikut untuk melanjutkan proses reset password:",
    resetUrl,
    "",
    `Batas waktu tautan reset: ${expiresAtText} WIB`,
    "Apabila Anda tidak melakukan permintaan ini, silakan abaikan email ini.",
    "",
    "Hormat kami,",
    "Tim BookIn",
    "",
    "-----",
    "",
    `Dear ${payload.name},`,
    "",
    "We received a password reset request for your BookIn account.",
    "Please use the link below to continue the password reset process:",
    resetUrl,
    "",
    `Reset link expiry time: ${expiresAtText} WIB`,
    "If you did not request this, please disregard this email.",
    "",
    "Sincerely,",
    "BookIn Team",
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 640px;">
      <h2 style="margin:0 0 12px;">[BookIn] Reset Password</h2>
      <p>Yth. ${escapeHtml(payload.name)},</p>
      <p>Kami menerima permintaan reset password untuk akun BookIn Anda.</p>
      <p>Silakan lanjutkan proses reset password melalui tombol berikut.</p>
      <p style="margin:16px 0;">
        <a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:20px;">
          Reset Password
        </a>
      </p>
      <p>Atau gunakan tautan ini: <a href="${resetUrl}">${resetUrl}</a></p>
      <p><strong>Batas waktu tautan reset:</strong> ${escapeHtml(expiresAtText)} WIB</p>
      <p>Apabila Anda tidak melakukan permintaan ini, silakan abaikan email ini.</p>
      <p>Hormat kami,<br/>Tim BookIn</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0;" />
      <p>Dear ${escapeHtml(payload.name)},</p>
      <p>We received a password reset request for your BookIn account.</p>
      <p>Please continue the password reset process using the button below.</p>
      <p style="margin:16px 0;">
        <a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:20px;">
          Reset Password
        </a>
      </p>
      <p>Or use this link: <a href="${resetUrl}">${resetUrl}</a></p>
      <p><strong>Reset link expiry time:</strong> ${escapeHtml(expiresAtText)} WIB</p>
      <p>If you did not request this, please disregard this email.</p>
      <p>Sincerely,<br/>BookIn Team</p>
    </div>
  `;
  await transporter.sendMail({
    from: fromAddress,
    to: payload.to,
    subject,
    text,
    html,
  });
  logEmailSent("password-reset", payload.to);
};
const sendBookingReceiptEmail = async (payload) => {
  const nights = countNights(payload.checkIn, payload.checkOut);
  const paymentMethodLabel = toPaymentMethodLabel(payload.paymentMethod);
  const totalAmountText = formatRupiah(payload.totalAmount);
  const checkInText = formatDate(payload.checkIn);
  const checkOutText = formatDate(payload.checkOut);
  const approvedAtText = formatDateTime(payload.approvedAt);
  const createdAtText = formatDateTime(payload.bookingCreatedAt);
  const portalUrl = APP_BASE_URL
    ? `${APP_BASE_URL.replace(/\/$/, "")}/my-transaction`
    : "";
  if (!SMTP_HOST) {
    console.info(
      `[Email] Receipt | To: ${payload.to} | Order: ${payload.orderNo} | Total: ${totalAmountText}`,
    );
    console.warn(
      "[Email] SMTP_HOST belum di-set. Email kwitansi transaksi belum dikirim.",
    );
    return;
  }
  const transporter = createTransporter();
  const fromAddress = resolveFromAddress();
  const subject = `[BookIn] Konfirmasi Pembayaran - ${payload.orderNo}`;
  const tenantText = payload.tenantName?.trim()
    ? payload.tenantName.trim()
    : "Tim Tenant";
  const reviewNotesText = payload.reviewNotes?.trim() ?? "";
  const text = [
    `Yth. ${payload.userName},`,
    "",
    "Dengan ini kami informasikan bahwa pembayaran Anda telah berhasil dikonfirmasi.",
    "",
    "Rincian transaksi:",
    `No. Pesanan: ${payload.orderNo}`,
    `Properti: ${payload.propertyName}`,
    `Tipe Room: ${payload.roomTypeName}`,
    `Check-in: ${checkInText}`,
    `Check-out: ${checkOutText}`,
    `Durasi: ${nights} malam`,
    `Jumlah Tamu/Kamar: ${payload.guests} / ${payload.rooms}`,
    `Metode Pembayaran: ${paymentMethodLabel}`,
    `Total Pembayaran: ${totalAmountText}`,
    `Waktu booking: ${createdAtText} WIB`,
    `Waktu konfirmasi: ${approvedAtText} WIB`,
    "",
    "Tata cara penggunaan properti:",
    "1. Tunjukkan identitas asli dan nomor pesanan saat check-in.",
    "2. Ikuti ketentuan check-in/check-out dari properti.",
    "3. Hubungi pihak properti melalui aplikasi jika membutuhkan bantuan.",
    "",
    "Aturan properti:",
    "1. Dilarang merokok di area non-smoking.",
    "2. Jaga ketenangan, kebersihan, dan fasilitas properti.",
    "3. Kerusakan akibat kelalaian menjadi tanggung jawab tamu.",
    reviewNotesText ? `Catatan Tenant: ${reviewNotesText}` : "",
    "",
    portalUrl
      ? `Lihat detail transaksi di: ${portalUrl}`
      : "Silakan cek detail transaksi di aplikasi BookIn.",
    "",
    "Hormat kami,",
    "Tim BookIn",
    "",
    "-----",
    "",
    `Dear ${payload.userName},`,
    "",
    "We would like to inform you that your payment has been successfully confirmed.",
    "",
    "Transaction details:",
    `Order No: ${payload.orderNo}`,
    `Property: ${payload.propertyName}`,
    `Room Type: ${payload.roomTypeName}`,
    `Check-in: ${checkInText}`,
    `Check-out: ${checkOutText}`,
    `Nights: ${nights}`,
    `Guests/Rooms: ${payload.guests} / ${payload.rooms}`,
    `Payment Method: ${paymentMethodLabel}`,
    `Total Payment: ${totalAmountText}`,
    `Booking Time: ${createdAtText} WIB`,
    `Confirmation Time: ${approvedAtText} WIB`,
    "",
    "Property usage instructions:",
    "1. Present a valid ID and your order number at check-in.",
    "2. Follow the property's check-in/check-out policy.",
    "3. Contact the property team via the app if you need assistance.",
    "",
    "Property rules:",
    "1. No smoking in non-smoking areas.",
    "2. Keep noise levels, cleanliness, and facilities in good condition.",
    "3. Guests are responsible for negligence-related damage.",
    reviewNotesText ? `Tenant Note: ${reviewNotesText}` : "",
    "",
    portalUrl
      ? `View transaction details: ${portalUrl}`
      : "Please check your transaction details in the BookIn app.",
    "",
    "Sincerely,",
    "BookIn Team",
    "",
    `Managed by: ${tenantText}`,
  ]
    .filter(Boolean)
    .join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 680px;">
      <h2 style="margin-bottom: 8px;">[BookIn] Konfirmasi Pembayaran / Payment Confirmation</h2>
      <p style="margin-top: 0;">Yth. ${escapeHtml(payload.userName)},</p>
      <p>Dengan ini kami informasikan bahwa pembayaran Anda telah berhasil dikonfirmasi.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
        <tbody>
          <tr><td style="padding: 6px 0; color:#475569;">No. Order</td><td style="padding: 6px 0;"><strong>${escapeHtml(payload.orderNo)}</strong></td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Properti / Property</td><td style="padding: 6px 0;">${escapeHtml(payload.propertyName)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Tipe Room</td><td style="padding: 6px 0;">${escapeHtml(payload.roomTypeName)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Check-in</td><td style="padding: 6px 0;">${escapeHtml(checkInText)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Check-out</td><td style="padding: 6px 0;">${escapeHtml(checkOutText)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Durasi / Nights</td><td style="padding: 6px 0;">${nights}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Jumlah Tamu/Kamar / Guests/Rooms</td><td style="padding: 6px 0;">${payload.guests} / ${payload.rooms}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Metode Bayar / Payment Method</td><td style="padding: 6px 0;">${escapeHtml(paymentMethodLabel)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Total Pembayaran / Total Payment</td><td style="padding: 6px 0;"><strong>${escapeHtml(totalAmountText)}</strong></td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Waktu Booking / Booking Time</td><td style="padding: 6px 0;">${escapeHtml(createdAtText)} WIB</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Waktu Konfirmasi / Confirmation Time</td><td style="padding: 6px 0;">${escapeHtml(approvedAtText)} WIB</td></tr>
          ${reviewNotesText ? `<tr><td style="padding: 6px 0; color:#475569;">Catatan Tenant / Tenant Note</td><td style="padding: 6px 0;">${escapeHtml(reviewNotesText)}</td></tr>` : ""}
        </tbody>
      </table>
      <p style="margin-top:14px;"><strong>Tata cara penggunaan properti / Property usage instructions</strong></p>
      <ol style="padding-left: 18px; margin-top: 6px;">
        <li>Tunjukkan identitas asli dan nomor pesanan saat check-in.</li>
        <li>Ikuti ketentuan check-in/check-out dari properti.</li>
        <li>Hubungi pihak properti melalui aplikasi jika membutuhkan bantuan.</li>
      </ol>
      <ol style="padding-left: 18px; margin-top: 6px;">
        <li>Present a valid ID and your order number at check-in.</li>
        <li>Follow the property's check-in/check-out policy.</li>
        <li>Contact the property team via the app if you need assistance.</li>
      </ol>
      <p style="margin-top:14px;"><strong>Aturan properti / Property rules</strong></p>
      <ol style="padding-left: 18px; margin-top: 6px;">
        <li>Dilarang merokok di area non-smoking.</li>
        <li>Jaga ketenangan, kebersihan, dan fasilitas properti.</li>
        <li>Kerusakan akibat kelalaian menjadi tanggung jawab tamu.</li>
      </ol>
      <ol style="padding-left: 18px; margin-top: 6px;">
        <li>No smoking in non-smoking areas.</li>
        <li>Keep noise levels, cleanliness, and facilities in good condition.</li>
        <li>Guests are responsible for negligence-related damage.</li>
      </ol>
      ${portalUrl ? `<p style="margin-top: 16px;"><a href="${portalUrl}" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#fff;text-decoration:none;border-radius:999px;">Lihat My Transaction / View My Transaction</a></p>` : ""}
      <p style="margin-top: 18px;">Hormat kami / Sincerely,<br/>Tim BookIn / BookIn Team</p>
      <p style="margin-top: 6px; color:#475569;">Managed by: ${escapeHtml(tenantText)}</p>
    </div>
  `;
  await transporter.sendMail({
    from: fromAddress,
    to: payload.to,
    subject,
    text,
    html,
  });
  logEmailSent("payment-receipt", payload.to, `order=${payload.orderNo}`);
};
const sendPaymentProofRejectedEmail = async (payload) => {
  const checkInText = formatDate(payload.checkIn);
  const checkOutText = formatDate(payload.checkOut);
  const rejectedAtText = formatDateTime(payload.rejectedAt);
  const totalAmountText = formatRupiah(payload.totalAmount);
  const paymentMethodLabel = toPaymentMethodLabel(payload.paymentMethod);
  const tenantText = payload.tenantName?.trim() || "Tim Tenant";
  const rejectionReasonText = payload.rejectionReason?.trim() || "";
  const nights = countNights(payload.checkIn, payload.checkOut);
  const portalUrl = APP_BASE_URL
    ? `${APP_BASE_URL.replace(/\/$/, "")}/my-transaction?orderNo=${encodeURIComponent(payload.orderNo)}`
    : "";
  if (!SMTP_HOST) {
    console.info(
      `[Email] Payment proof rejected | To: ${payload.to} | Order: ${payload.orderNo}`,
    );
    console.warn(
      "[Email] SMTP_HOST belum di-set. Email penolakan bukti pembayaran belum dikirim.",
    );
    return;
  }
  const transporter = createTransporter();
  const fromAddress = resolveFromAddress();
  const subject = `[BookIn] Bukti Pembayaran Ditolak - ${payload.orderNo}`;
  const text = [
    `Yth. ${payload.userName},`,
    "",
    "Bukti pembayaran untuk transaksi Anda ditolak oleh tenant.",
    "",
    "Rincian transaksi:",
    `No. Pesanan: ${payload.orderNo}`,
    `Properti: ${payload.propertyName}`,
    `Tipe Room: ${payload.roomTypeName}`,
    `Check-in: ${checkInText}`,
    `Check-out: ${checkOutText}`,
    `Durasi: ${nights} malam`,
    `Jumlah Tamu/Kamar: ${payload.guests} / ${payload.rooms}`,
    `Metode Pembayaran: ${paymentMethodLabel}`,
    `Total Pembayaran: ${totalAmountText}`,
    `Waktu Penolakan: ${rejectedAtText} WIB`,
    rejectionReasonText ? `Alasan Penolakan: ${rejectionReasonText}` : "",
    "",
    "Silakan unggah ulang bukti pembayaran yang valid melalui halaman My Transaction.",
    portalUrl
      ? `Lanjutkan dari: ${portalUrl}`
      : "Lanjutkan dari aplikasi BookIn.",
    "",
    "Hormat kami,",
    "Tim BookIn",
    "",
    "-----",
    "",
    `Dear ${payload.userName},`,
    "",
    "Your payment proof was rejected by the tenant.",
    "",
    "Transaction details:",
    `Order No: ${payload.orderNo}`,
    `Property: ${payload.propertyName}`,
    `Room Type: ${payload.roomTypeName}`,
    `Check-in: ${checkInText}`,
    `Check-out: ${checkOutText}`,
    `Nights: ${nights}`,
    `Guests/Rooms: ${payload.guests} / ${payload.rooms}`,
    `Payment Method: ${paymentMethodLabel}`,
    `Total Payment: ${totalAmountText}`,
    `Rejection Time: ${rejectedAtText} WIB`,
    rejectionReasonText ? `Rejection Reason: ${rejectionReasonText}` : "",
    "",
    "Please re-upload a valid payment proof from the My Transaction page.",
    portalUrl ? `Continue here: ${portalUrl}` : "Continue from the BookIn app.",
    "",
    "Sincerely,",
    "BookIn Team",
    "",
    `Managed by: ${tenantText}`,
  ]
    .filter(Boolean)
    .join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 680px;">
      <h2 style="margin-bottom: 8px;">[BookIn] Bukti Pembayaran Ditolak / Payment Proof Rejected</h2>
      <p style="margin-top: 0;">Yth. ${escapeHtml(payload.userName)},</p>
      <p>Bukti pembayaran untuk transaksi Anda ditolak oleh tenant.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
        <tbody>
          <tr><td style="padding: 6px 0; color:#475569;">No. Pesanan / Order No</td><td style="padding: 6px 0;"><strong>${escapeHtml(payload.orderNo)}</strong></td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Properti / Property</td><td style="padding: 6px 0;">${escapeHtml(payload.propertyName)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Tipe Room / Room Type</td><td style="padding: 6px 0;">${escapeHtml(payload.roomTypeName)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Check-in</td><td style="padding: 6px 0;">${escapeHtml(checkInText)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Check-out</td><td style="padding: 6px 0;">${escapeHtml(checkOutText)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Durasi / Nights</td><td style="padding: 6px 0;">${nights}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Jumlah Tamu/Kamar / Guests/Rooms</td><td style="padding: 6px 0;">${payload.guests} / ${payload.rooms}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Metode Bayar / Payment Method</td><td style="padding: 6px 0;">${escapeHtml(paymentMethodLabel)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Total Pembayaran / Total Payment</td><td style="padding: 6px 0;"><strong>${escapeHtml(totalAmountText)}</strong></td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Waktu Penolakan / Rejection Time</td><td style="padding: 6px 0;">${escapeHtml(rejectedAtText)} WIB</td></tr>
          ${rejectionReasonText ? `<tr><td style="padding: 6px 0; color:#475569;">Alasan / Reason</td><td style="padding: 6px 0;">${escapeHtml(rejectionReasonText)}</td></tr>` : ""}
        </tbody>
      </table>
      <p style="margin-top: 14px;">Silakan unggah ulang bukti pembayaran yang valid melalui halaman My Transaction.<br/>Please re-upload a valid payment proof from the My Transaction page.</p>
      ${portalUrl ? `<p><a href="${portalUrl}" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#fff;text-decoration:none;border-radius:999px;">Lihat My Transaction / View My Transaction</a></p>` : ""}
      <p style="margin-top: 18px;">Hormat kami / Sincerely,<br/>Tim BookIn / BookIn Team</p>
      <p style="margin-top: 6px; color:#475569;">Managed by: ${escapeHtml(tenantText)}</p>
    </div>
  `;
  await transporter.sendMail({
    from: fromAddress,
    to: payload.to,
    subject,
    text,
    html,
  });
  logEmailSent(
    "payment-proof-rejected",
    payload.to,
    `order=${payload.orderNo}`,
  );
};
const sendCheckInReminderEmail = async (payload) => {
  const checkInText = formatDate(payload.checkIn);
  const checkOutText = formatDate(payload.checkOut);
  const nights = countNights(payload.checkIn, payload.checkOut);
  const tenantText = payload.tenantName?.trim() || "Tim Tenant";
  const portalUrl = payload.portalUrl?.trim() || "";
  if (!SMTP_HOST) {
    console.info(
      `[Email] Check-in reminder | To: ${payload.to} | Order: ${payload.orderNo}`,
    );
    console.warn(
      "[Email] SMTP_HOST belum di-set. Email reminder check-in belum dikirim.",
    );
    return;
  }
  const transporter = createTransporter();
  const fromAddress = resolveFromAddress();
  const subject = `[BookIn] Pengingat Check-in H-1 - ${payload.orderNo}`;
  const text = [
    `Yth. ${payload.userName},`,
    "",
    "Ini adalah pengingat bahwa jadwal check-in Anda adalah besok.",
    "",
    "Rincian transaksi:",
    `No. Pesanan: ${payload.orderNo}`,
    `Properti: ${payload.propertyName}`,
    `Tipe Room: ${payload.roomTypeName}`,
    `Check-in: ${checkInText}`,
    `Check-out: ${checkOutText}`,
    `Durasi: ${nights} malam`,
    `Jumlah Tamu/Kamar: ${payload.guests} / ${payload.rooms}`,
    "",
    "Persiapan check-in:",
    "1. Siapkan identitas asli dan nomor pesanan.",
    "2. Ikuti ketentuan properti saat check-in.",
    "3. Hubungi pihak properti melalui aplikasi jika memerlukan bantuan kedatangan.",
    "",
    portalUrl ? `Detail transaksi: ${portalUrl}` : "",
    "",
    "Hormat kami,",
    "Tim BookIn",
    "",
    "-----",
    "",
    `Dear ${payload.userName},`,
    "",
    "This is a reminder that your check-in is scheduled for tomorrow.",
    "",
    "Transaction details:",
    `Order No: ${payload.orderNo}`,
    `Property: ${payload.propertyName}`,
    `Room Type: ${payload.roomTypeName}`,
    `Check-in: ${checkInText}`,
    `Check-out: ${checkOutText}`,
    `Nights: ${nights}`,
    `Guests/Rooms: ${payload.guests} / ${payload.rooms}`,
    "",
    "Check-in preparation:",
    "1. Prepare a valid ID and your order number.",
    "2. Follow the property's check-in policy.",
    "3. Contact the property team via the app if you need arrival assistance.",
    "",
    portalUrl ? `Transaction details: ${portalUrl}` : "",
    "",
    "Sincerely,",
    "BookIn Team",
    "",
    `Managed by: ${tenantText}`,
  ]
    .filter(Boolean)
    .join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 680px;">
      <h2 style="margin-bottom: 8px;">[BookIn] Pengingat Check-in H-1 / H-1 Check-in Reminder</h2>
      <p style="margin-top: 0;">Yth. ${escapeHtml(payload.userName)},</p>
      <p>Ini adalah pengingat bahwa jadwal check-in Anda adalah besok.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
        <tbody>
          <tr><td style="padding: 6px 0; color:#475569;">No. Pesanan / Order No</td><td style="padding: 6px 0;"><strong>${escapeHtml(payload.orderNo)}</strong></td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Properti / Property</td><td style="padding: 6px 0;">${escapeHtml(payload.propertyName)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Tipe Room / Room Type</td><td style="padding: 6px 0;">${escapeHtml(payload.roomTypeName)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Check-in</td><td style="padding: 6px 0;">${escapeHtml(checkInText)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Check-out</td><td style="padding: 6px 0;">${escapeHtml(checkOutText)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Durasi / Nights</td><td style="padding: 6px 0;">${nights}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Jumlah Tamu/Kamar / Guests/Rooms</td><td style="padding: 6px 0;">${payload.guests} / ${payload.rooms}</td></tr>
        </tbody>
      </table>
      <p style="margin-top: 14px;"><strong>Persiapan check-in / Check-in preparation</strong></p>
      <ol style="padding-left: 18px; margin-top: 6px;">
        <li>Siapkan identitas asli dan nomor pesanan.</li>
        <li>Ikuti ketentuan properti saat check-in.</li>
        <li>Hubungi pihak properti melalui aplikasi jika memerlukan bantuan kedatangan.</li>
      </ol>
      <ol style="padding-left: 18px; margin-top: 6px;">
        <li>Prepare a valid ID and your order number.</li>
        <li>Follow the property's check-in policy.</li>
        <li>Contact the property team via the app if you need arrival assistance.</li>
      </ol>
      ${portalUrl ? `<p><a href="${portalUrl}" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#fff;text-decoration:none;border-radius:999px;">Lihat My Transaction / View My Transaction</a></p>` : ""}
      <p style="margin-top: 18px;">Hormat kami / Sincerely,<br/>Tim BookIn / BookIn Team</p>
      <p style="margin-top: 6px; color:#475569;">Managed by: ${escapeHtml(tenantText)}</p>
    </div>
  `;
  await transporter.sendMail({
    from: fromAddress,
    to: payload.to,
    subject,
    text,
    html,
  });
  logEmailSent("checkin-reminder", payload.to, `order=${payload.orderNo}`);
};
const sendBookingCancelledByTenantEmail = async (payload) => {
  const checkInText = formatDate(payload.checkIn);
  const checkOutText = formatDate(payload.checkOut);
  const cancelledAtText = formatDateTime(payload.cancelledAt);
  const totalAmountText = formatRupiah(payload.totalAmount);
  const nights = countNights(payload.checkIn, payload.checkOut);
  const tenantText = payload.tenantName?.trim() || "Tim Tenant";
  const portalUrl = APP_BASE_URL
    ? `${APP_BASE_URL.replace(/\/$/, "")}/my-transaction`
    : "";
  if (!SMTP_HOST) {
    console.info(
      `[Email] Booking cancelled by tenant | To: ${payload.to} | Order: ${payload.orderNo}`,
    );
    console.warn(
      "[Email] SMTP_HOST belum di-set. Email notifikasi pembatalan booking belum dikirim.",
    );
    return;
  }
  const transporter = createTransporter();
  const fromAddress = resolveFromAddress();
  const subject = `[BookIn] Pembatalan Transaksi oleh Tenant - ${payload.orderNo}`;
  const text = [
    `Yth. ${payload.userName},`,
    "",
    "Dengan ini kami informasikan bahwa transaksi Anda telah dibatalkan oleh tenant.",
    "",
    "Rincian transaksi:",
    `No. Pesanan: ${payload.orderNo}`,
    `Properti: ${payload.propertyName}`,
    `Tipe Room: ${payload.roomTypeName}`,
    `Check-in: ${checkInText}`,
    `Check-out: ${checkOutText}`,
    `Durasi: ${nights} malam`,
    `Jumlah Tamu/Kamar: ${payload.guests} / ${payload.rooms}`,
    `Total Transaksi: ${totalAmountText}`,
    `Waktu Pembatalan: ${cancelledAtText} WIB`,
    "",
    portalUrl
      ? `Lihat detail transaksi di: ${portalUrl}`
      : "Silakan cek detail transaksi di aplikasi BookIn.",
    "",
    "Untuk bantuan lebih lanjut, silakan hubungi tim support BookIn melalui aplikasi.",
    "",
    "Hormat kami,",
    "Tim BookIn",
    "",
    "-----",
    "",
    `Dear ${payload.userName},`,
    "",
    "We would like to inform you that your booking has been cancelled by the tenant.",
    "",
    "Transaction details:",
    `Order No: ${payload.orderNo}`,
    `Property: ${payload.propertyName}`,
    `Room Type: ${payload.roomTypeName}`,
    `Check-in: ${checkInText}`,
    `Check-out: ${checkOutText}`,
    `Nights: ${nights}`,
    `Guests/Rooms: ${payload.guests} / ${payload.rooms}`,
    `Total Amount: ${totalAmountText}`,
    `Cancellation Time: ${cancelledAtText} WIB`,
    "",
    portalUrl
      ? `View transaction details: ${portalUrl}`
      : "Please check your transaction details in the BookIn app.",
    "",
    "For further assistance, please contact BookIn support via the application.",
    "",
    "Sincerely,",
    "BookIn Team",
    "",
    `Managed by: ${tenantText}`,
  ]
    .filter(Boolean)
    .join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 680px;">
      <h2 style="margin-bottom: 8px;">[BookIn] Pembatalan Transaksi oleh Tenant / Booking Cancellation by Tenant</h2>
      <p style="margin-top: 0;">Yth. ${escapeHtml(payload.userName)},</p>
      <p>Dengan ini kami informasikan bahwa transaksi Anda telah dibatalkan oleh tenant.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
        <tbody>
          <tr><td style="padding: 6px 0; color:#475569;">No. Pesanan / Order No</td><td style="padding: 6px 0;"><strong>${escapeHtml(payload.orderNo)}</strong></td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Properti / Property</td><td style="padding: 6px 0;">${escapeHtml(payload.propertyName)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Tipe Room / Room Type</td><td style="padding: 6px 0;">${escapeHtml(payload.roomTypeName)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Check-in</td><td style="padding: 6px 0;">${escapeHtml(checkInText)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Check-out</td><td style="padding: 6px 0;">${escapeHtml(checkOutText)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Durasi / Nights</td><td style="padding: 6px 0;">${nights}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Jumlah Tamu/Kamar / Guests/Rooms</td><td style="padding: 6px 0;">${payload.guests} / ${payload.rooms}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Total Transaksi / Total Amount</td><td style="padding: 6px 0;"><strong>${escapeHtml(totalAmountText)}</strong></td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Waktu Pembatalan / Cancellation Time</td><td style="padding: 6px 0;">${escapeHtml(cancelledAtText)} WIB</td></tr>
        </tbody>
      </table>
      ${portalUrl ? `<p style="margin-top: 16px;"><a href="${portalUrl}" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#fff;text-decoration:none;border-radius:999px;">Lihat My Transaction / View My Transaction</a></p>` : ""}
      <p style="margin-top: 14px;">Untuk bantuan lebih lanjut, silakan hubungi tim support BookIn melalui aplikasi.<br/>For further assistance, please contact BookIn support via the application.</p>
      <p style="margin-top: 18px;">Hormat kami / Sincerely,<br/>Tim BookIn / BookIn Team</p>
      <p style="margin-top: 6px; color:#475569;">Managed by: ${escapeHtml(tenantText)}</p>
    </div>
  `;
  await transporter.sendMail({
    from: fromAddress,
    to: payload.to,
    subject,
    text,
    html,
  });
  logEmailSent(
    "booking-cancelled-by-tenant",
    payload.to,
    `order=${payload.orderNo}`,
  );
};
export {
  sendBookingCancelledByTenantEmail,
  sendBookingReceiptEmail,
  sendCheckInReminderEmail,
  sendPaymentProofRejectedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
};
