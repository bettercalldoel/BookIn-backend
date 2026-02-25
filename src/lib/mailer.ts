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

type VerificationEmailPayload = {
  to: string;
  name: string;
  token: string;
  expiresAt: Date;
};

type PasswordResetEmailPayload = {
  to: string;
  name: string;
  token: string;
  expiresAt: Date;
};

type BookingReceiptEmailPayload = {
  to: string;
  userName: string;
  orderNo: string;
  propertyName: string;
  roomTypeName: string;
  checkIn: Date;
  checkOut: Date;
  guests: number;
  rooms: number;
  totalAmount: string | number;
  paymentMethod: PaymentMethod;
  approvedAt: Date;
  bookingCreatedAt: Date;
  tenantName?: string;
  reviewNotes?: string | null;
};

type CheckInReminderEmailPayload = {
  to: string;
  userName: string;
  orderNo: string;
  propertyName: string;
  roomTypeName: string;
  checkIn: Date;
  checkOut: Date;
  guests: number;
  rooms: number;
  tenantName?: string;
  portalUrl?: string;
};

const DATE_TIMEZONE = "Asia/Jakarta";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const resolveFromAddress = () =>
  SMTP_FROM || SMTP_USER || "no-reply@bookin.local";

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
        : undefined,
  });

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatRupiah = (value: string | number) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(parsed)) return String(value);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(parsed);
};

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: DATE_TIMEZONE,
  }).format(value);

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DATE_TIMEZONE,
  }).format(value);

const toPaymentMethodLabel = (method: PaymentMethod) => {
  if (method === PaymentMethod.MANUAL_TRANSFER) return "Transfer Manual";
  if (method === PaymentMethod.XENDIT) return "Xendit Payment Gateway";
  return method;
};

const countNights = (checkIn: Date, checkOut: Date) => {
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

export const sendVerificationEmail = async (
  payload: VerificationEmailPayload,
) => {
  const verifyUrl = `${APP_BASE_URL}/verify-email?token=${payload.token}`;
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
  const subject = "Verifikasi Email BookIn";
  const expiresText = payload.expiresAt.toISOString();

  await transporter.sendMail({
    from: fromAddress,
    to: payload.to,
    subject,
    text: `Hi ${payload.name},\n\nSilakan verifikasi email Anda dengan membuka tautan berikut:\n${verifyUrl}\n\nLink berlaku hingga: ${expiresText}\n\nJika Anda tidak mendaftar, abaikan email ini.\n`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Verifikasi Email BookIn</h2>
        <p>Hi ${payload.name},</p>
        <p>Silakan verifikasi email Anda dengan klik tombol di bawah ini:</p>
        <p>
          <a href="${verifyUrl}" style="display: inline-block; padding: 10px 18px; background: #0f172a; color: #ffffff; text-decoration: none; border-radius: 20px;">
            Verifikasi Email
          </a>
        </p>
        <p>Atau copy link berikut:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p><strong>Link berlaku hingga:</strong> ${expiresText}</p>
        <p>Jika Anda tidak mendaftar, abaikan email ini.</p>
      </div>
    `,
  });
};

export const sendPasswordResetEmail = async (
  payload: PasswordResetEmailPayload,
) => {
  const resetUrl = `${APP_BASE_URL}/reset-password/confirm?token=${payload.token}`;
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
  const subject = "Reset Password BookIn";
  const expiresText = payload.expiresAt.toISOString();

  await transporter.sendMail({
    from: fromAddress,
    to: payload.to,
    subject,
    text: `Hi ${payload.name},\n\nSilakan reset password Anda dengan membuka tautan berikut:\n${resetUrl}\n\nLink berlaku hingga: ${expiresText}\n\nJika Anda tidak meminta reset password, abaikan email ini.\n`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Reset Password BookIn</h2>
        <p>Hi ${payload.name},</p>
        <p>Silakan reset password Anda dengan klik tombol di bawah ini:</p>
        <p>
          <a href="${resetUrl}" style="display: inline-block; padding: 10px 18px; background: #0f172a; color: #ffffff; text-decoration: none; border-radius: 20px;">
            Reset Password
          </a>
        </p>
        <p>Atau copy link berikut:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p><strong>Link berlaku hingga:</strong> ${expiresText}</p>
        <p>Jika Anda tidak meminta reset password, abaikan email ini.</p>
      </div>
    `,
  });
};

export const sendBookingReceiptEmail = async (
  payload: BookingReceiptEmailPayload,
) => {
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
  const subject = `Kwitansi Pembayaran BookIn - ${payload.orderNo}`;
  const tenantText = payload.tenantName?.trim()
    ? payload.tenantName.trim()
    : "Tim Tenant";
  const reviewNotesText = payload.reviewNotes?.trim() ?? "";

  const text = [
    `Hi ${payload.userName},`,
    "",
    "Pembayaran booking kamu sudah dikonfirmasi tenant.",
    "",
    `No. Order: ${payload.orderNo}`,
    `Property: ${payload.propertyName}`,
    `Tipe Room: ${payload.roomTypeName}`,
    `Check-in: ${checkInText}`,
    `Check-out: ${checkOutText}`,
    `Durasi: ${nights} malam`,
    `Jumlah tamu/kamar: ${payload.guests} / ${payload.rooms}`,
    `Metode bayar: ${paymentMethodLabel}`,
    `Total pembayaran: ${totalAmountText}`,
    `Waktu booking: ${createdAtText} WIB`,
    `Waktu konfirmasi: ${approvedAtText} WIB`,
    reviewNotesText ? `Catatan tenant: ${reviewNotesText}` : "",
    "",
    portalUrl
      ? `Lihat detail transaksi di: ${portalUrl}`
      : "Silakan cek detail transaksi di aplikasi BookIn.",
    "",
    `Terima kasih,\n${tenantText}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">Kwitansi Pembayaran BookIn</h2>
      <p style="margin-top: 0;">Hi ${escapeHtml(payload.userName)}, pembayaran booking kamu sudah dikonfirmasi tenant.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
        <tbody>
          <tr><td style="padding: 6px 0; color:#475569;">No. Order</td><td style="padding: 6px 0;"><strong>${escapeHtml(payload.orderNo)}</strong></td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Property</td><td style="padding: 6px 0;">${escapeHtml(payload.propertyName)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Tipe Room</td><td style="padding: 6px 0;">${escapeHtml(payload.roomTypeName)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Check-in</td><td style="padding: 6px 0;">${escapeHtml(checkInText)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Check-out</td><td style="padding: 6px 0;">${escapeHtml(checkOutText)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Durasi</td><td style="padding: 6px 0;">${nights} malam</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Jumlah Tamu / Kamar</td><td style="padding: 6px 0;">${payload.guests} / ${payload.rooms}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Metode Bayar</td><td style="padding: 6px 0;">${escapeHtml(paymentMethodLabel)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Total Pembayaran</td><td style="padding: 6px 0;"><strong>${escapeHtml(totalAmountText)}</strong></td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Waktu Booking</td><td style="padding: 6px 0;">${escapeHtml(createdAtText)} WIB</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Waktu Konfirmasi</td><td style="padding: 6px 0;">${escapeHtml(approvedAtText)} WIB</td></tr>
          ${
            reviewNotesText
              ? `<tr><td style="padding: 6px 0; color:#475569;">Catatan Tenant</td><td style="padding: 6px 0;">${escapeHtml(reviewNotesText)}</td></tr>`
              : ""
          }
        </tbody>
      </table>
      ${
        portalUrl
          ? `<p style="margin-top: 16px;"><a href="${portalUrl}" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#fff;text-decoration:none;border-radius:999px;">Lihat My Transaction</a></p>`
          : ""
      }
      <p style="margin-top: 18px;">Terima kasih,<br/>${escapeHtml(tenantText)}</p>
    </div>
  `;

  await transporter.sendMail({
    from: fromAddress,
    to: payload.to,
    subject,
    text,
    html,
  });
};

export const sendCheckInReminderEmail = async (
  payload: CheckInReminderEmailPayload,
) => {
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
  const subject = `Pengingat Check-in H-1 - ${payload.orderNo}`;

  const text = [
    `Hi ${payload.userName},`,
    "",
    "Ini pengingat bahwa jadwal check-in kamu tinggal H-1.",
    "",
    `No. Order: ${payload.orderNo}`,
    `Property: ${payload.propertyName}`,
    `Tipe Room: ${payload.roomTypeName}`,
    `Check-in: ${checkInText}`,
    `Check-out: ${checkOutText}`,
    `Durasi: ${nights} malam`,
    `Jumlah tamu/kamar: ${payload.guests} / ${payload.rooms}`,
    "",
    "Pastikan membawa identitas diri saat check-in dan mengikuti aturan properti.",
    portalUrl ? `Detail transaksi: ${portalUrl}` : "",
    "",
    `Terima kasih,\n${tenantText}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">Pengingat Check-in H-1</h2>
      <p style="margin-top: 0;">Hi ${escapeHtml(payload.userName)}, jadwal check-in kamu tinggal H-1.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
        <tbody>
          <tr><td style="padding: 6px 0; color:#475569;">No. Order</td><td style="padding: 6px 0;"><strong>${escapeHtml(payload.orderNo)}</strong></td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Property</td><td style="padding: 6px 0;">${escapeHtml(payload.propertyName)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Tipe Room</td><td style="padding: 6px 0;">${escapeHtml(payload.roomTypeName)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Check-in</td><td style="padding: 6px 0;">${escapeHtml(checkInText)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Check-out</td><td style="padding: 6px 0;">${escapeHtml(checkOutText)}</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Durasi</td><td style="padding: 6px 0;">${nights} malam</td></tr>
          <tr><td style="padding: 6px 0; color:#475569;">Jumlah Tamu / Kamar</td><td style="padding: 6px 0;">${payload.guests} / ${payload.rooms}</td></tr>
        </tbody>
      </table>
      <p style="margin-top: 14px;">Pastikan membawa identitas diri saat check-in dan mengikuti aturan properti.</p>
      ${
        portalUrl
          ? `<p><a href="${portalUrl}" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#fff;text-decoration:none;border-radius:999px;">Lihat My Transaction</a></p>`
          : ""
      }
      <p style="margin-top: 18px;">Terima kasih,<br/>${escapeHtml(tenantText)}</p>
    </div>
  `;

  await transporter.sendMail({
    from: fromAddress,
    to: payload.to,
    subject,
    text,
    html,
  });
};
