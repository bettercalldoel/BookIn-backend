import multer from "multer";
import path from "path";

const storage = multer.memoryStorage();

export const uploadImage = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".jpg" && ext !== ".jpeg" && ext !== ".png") {
      return cb(new Error("Only JPG and PNG images are allowed"));
    }
    cb(null, true);
  },
});
