import { PrismaClient } from "../../../generated/prisma/client.js";
import { CreateSampleDTO } from "./dto/create-sample.dto.js";

export class SampleService {
  constructor(private prisma: PrismaClient) {}

  getSamples = async () => {
    return await this.prisma.sample.findMany();
  };

  createSample = async (body: CreateSampleDTO) => {
    return await this.prisma.sample.create({ data: body });
  };
}
