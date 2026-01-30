import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListSampleQueryDTO {
  @IsOptional()
  @Transform(({ value }) =>
    Number.parseInt(Array.isArray(value) ? value[0] : value, 10),
  )
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) =>
    Number.parseInt(Array.isArray(value) ? value[0] : value, 10),
  )
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value[0] : value))
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value[0] : value))
  @IsIn(["createdAt", "name", "id"])
  sortBy?: "createdAt" | "name" | "id";

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value[0] : value))
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc";
}
