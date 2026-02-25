import { v2 as cloudinary } from "cloudinary";
import {
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_FOLDER,
} from "../config/env.js";
import { ApiError } from "../utils/api-error.js";

type UploadBufferOptions = {
  folder?: string;
  publicId?: string;
};

let cloudinaryConfigured = false;

const hasMissingCloudinaryConfig = () =>
  !CLOUDINARY_CLOUD_NAME.trim() ||
  !CLOUDINARY_API_KEY.trim() ||
  !CLOUDINARY_API_SECRET.trim();

const setCloudinaryConfig = () => {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
};

const configureCloudinary = () => {
  if (cloudinaryConfigured) return;
  if (hasMissingCloudinaryConfig()) {
    throw new ApiError("Cloudinary belum dikonfigurasi.", 500);
  }
  setCloudinaryConfig();
  cloudinaryConfigured = true;
};

const resolveFolder = (folder?: string) => {
  const baseFolder = CLOUDINARY_UPLOAD_FOLDER.trim();
  const nestedFolder = (folder ?? "").trim();

  if (baseFolder && nestedFolder) {
    return `${baseFolder}/${nestedFolder}`;
  }

  if (nestedFolder) {
    return nestedFolder;
  }

  return baseFolder || undefined;
};

export const uploadImageBuffer = async (
  file: Express.Multer.File,
  options: UploadBufferOptions = {},
) => {
  configureCloudinary();

  const folder = resolveFolder(options.folder);

  return new Promise<{ secureUrl: string; publicId: string }>(
    (resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "image",
          folder,
          public_id: options.publicId,
          overwrite: false,
        },
        (error, result) => {
          if (error || !result?.secure_url || !result.public_id) {
            reject(new ApiError("Gagal upload gambar ke Cloudinary.", 500));
            return;
          }

          resolve({
            secureUrl: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      stream.end(file.buffer);
    },
  );
};
