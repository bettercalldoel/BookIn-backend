import {
  XENDIT_API_BASE_URL,
  XENDIT_INVOICE_EXPIRY_MINUTES,
  XENDIT_SECRET_KEY,
} from "../config/env.js";
import { ApiError } from "../utils/api-error.js";

type CreateInvoiceInput = {
  externalId: string;
  amount: number;
  payerEmail: string;
  description: string;
  successRedirectUrl?: string;
  failureRedirectUrl?: string;
};

type XenditCreateInvoiceResponse = {
  id: string;
  external_id: string;
  status: string;
  invoice_url: string;
  expiry_date?: string | null;
};

export type XenditInvoiceDetailResponse = {
  id: string;
  external_id: string;
  status: string;
  invoice_url: string;
  paid_at?: string | null;
  expiry_date?: string | null;
};

type XenditApiErrorPayload = {
  message?: string;
  error_code?: string;
  errors?: { message?: string }[];
};

const getBasicAuthHeader = (secretKey: string) =>
  `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;

const parseXenditErrorMessage = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return "Gagal menghubungi Xendit.";
  }

  const typed = payload as XenditApiErrorPayload;
  if (typed.message?.trim()) {
    return typed.message.trim();
  }

  const nestedMessage = typed.errors?.find((item) =>
    item.message?.trim(),
  )?.message;
  if (nestedMessage?.trim()) {
    return nestedMessage.trim();
  }

  if (typed.error_code?.trim()) {
    return typed.error_code.trim();
  }

  return "Gagal menghubungi Xendit.";
};

const requestXendit = async (path: string, options: RequestInit = {}) => {
  if (!XENDIT_SECRET_KEY) {
    throw new ApiError("Xendit belum dikonfigurasi di server.", 500);
  }

  const response = await fetch(`${XENDIT_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: getBasicAuthHeader(XENDIT_SECRET_KEY),
      ...(options.headers ?? {}),
    },
  });

  const json = (await response.json().catch(() => null)) as
    | XenditCreateInvoiceResponse
    | XenditInvoiceDetailResponse
    | XenditApiErrorPayload
    | null;

  if (!response.ok) {
    throw new ApiError(parseXenditErrorMessage(json), 502);
  }

  if (!json || typeof json !== "object") {
    throw new ApiError("Respons Xendit tidak valid.", 502);
  }

  return json;
};

export const createXenditInvoice = async (
  payload: CreateInvoiceInput,
): Promise<XenditCreateInvoiceResponse> => {
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    throw new ApiError("Nominal invoice Xendit tidak valid.", 400);
  }

  const expiryDate = new Date(
    Date.now() + XENDIT_INVOICE_EXPIRY_MINUTES * 60 * 1000,
  );

  const invoice = (await requestXendit("/v2/invoices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_id: payload.externalId,
      amount: payload.amount,
      payer_email: payload.payerEmail,
      description: payload.description,
      currency: "IDR",
      success_redirect_url: payload.successRedirectUrl,
      failure_redirect_url: payload.failureRedirectUrl,
      expiry_date: expiryDate.toISOString(),
    }),
  })) as XenditCreateInvoiceResponse;

  if (!invoice.id || !invoice.invoice_url) {
    throw new ApiError("Respons Xendit tidak lengkap.", 502);
  }

  return invoice;
};

export const getXenditInvoiceById = async (
  invoiceId: string,
): Promise<XenditInvoiceDetailResponse> => {
  if (!invoiceId.trim()) {
    throw new ApiError("Invoice ID Xendit wajib diisi.", 400);
  }

  const invoice = (await requestXendit(
    `/v2/invoices/${encodeURIComponent(invoiceId.trim())}`,
    {
      method: "GET",
    },
  )) as XenditInvoiceDetailResponse;

  if (!invoice.id || !invoice.status) {
    throw new ApiError("Respons invoice Xendit tidak lengkap.", 502);
  }

  return invoice;
};
