import { Request, Response } from "express";
import { MediaService } from "./media.service.js";

export class MediaController {
  constructor(private mediaService: MediaService) {}

  getSignature = (_req: Request, res: Response) => {
    const result = this.mediaService.getUploadSignature();
    res.json(result);
  };

  getProfileSignature = (_req: Request, res: Response) => {
    const result = this.mediaService.getProfileUploadSignature();
    res.json(result);
  };
}
