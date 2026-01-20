import { Request, Response } from "express";
import { SampleService } from "./sample.service.js";

export class SampleController {
  constructor(private sampleService: SampleService) {}

  getSamples = async (req: Request, res: Response) => {
    const result = await this.sampleService.getSamples();
    res.status(200).send(result);
  };

  createSample = async (req: Request, res: Response) => {
    const result = await this.sampleService.createSample(req.body);
    res.status(200).send(result);
  };
}
