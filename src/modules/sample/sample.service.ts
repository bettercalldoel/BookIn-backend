import { PrismaClient } from "../../../generated/prisma/client.js";
import { CreateSampleDTO } from "./dto/create-sample.dto.js";
import { ListSampleQueryDTO } from "./dto/list-sample.dto.js";

export class SampleService {
  constructor(private prisma: PrismaClient) {}

  getSamples = async (query?: ListSampleQueryDTO) => {
    const page = query?.page ?? 1;
    const pageSize = query?.pageSize ?? 10;
    const sortBy = query?.sortBy ?? "createdAt";
    const sortOrder = query?.sortOrder ?? "desc";
    const search = query?.q?.trim();

    const where = search
      ? {
          name: {
            contains: search,
            mode: "insensitive" as const,
          },
        }
      : {};

    const skip = (page - 1) * pageSize;

    const [total, data] = await this.prisma.$transaction([
      this.prisma.sample.count({ where }),
      this.prisma.sample.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
      }),
    ]);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        sortBy,
        sortOrder,
        query: search ?? "",
      },
    };
  };

  createSample = async (body: CreateSampleDTO) => {
    return await this.prisma.sample.create({ data: body });
  };
}
