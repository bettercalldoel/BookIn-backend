import crypto from "crypto";
import {
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_FOLDER,
} from "../../config/env.js";
import { ApiError } from "../../utils/api-error.js";

type SignatureResponse = {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder?: string;
};

export class MediaService {
  getUploadSignature = (): SignatureResponse => {
    if (
      !CLOUDINARY_CLOUD_NAME ||
      !CLOUDINARY_API_KEY ||
      !CLOUDINARY_API_SECRET
    ) {
      throw new ApiError("Cloudinary belum dikonfigurasi.", 500);
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = CLOUDINARY_UPLOAD_FOLDER.trim();

    const params: Record<string, string | number> = { timestamp };
    if (folder) params.folder = folder;

    const signature = this.signParams(params);

    return {
      timestamp,
      signature,
      apiKey: CLOUDINARY_API_KEY,
      cloudName: CLOUDINARY_CLOUD_NAME,
      folder: folder || undefined,
    };
  };

  private signParams(params: Record<string, string | number>) {
    const sorted = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");
    return crypto
      .createHash("sha1")
      .update(`${sorted}${CLOUDINARY_API_SECRET}`)
      .digest("hex");
  }
}
