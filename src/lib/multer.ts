import multer from "multer";
import path from "path";

const storage = multer.memoryStorage();
const MAX_UPLOAD_BYTES = 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

export const uploadImage = multer({
  storage: storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeType = file.mimetype.toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(mimeType)) {
      return cb(new Error("Format file harus JPG, JPEG, atau PNG."));
    }

    cb(null, true);
  },
});
