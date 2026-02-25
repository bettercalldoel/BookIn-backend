import { CategoryResult, CityResult, ListMeta } from "./catalog.types.js";

export const buildListMeta = (
  page: number,
  limit: number,
  total: number,
): ListMeta => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

export const toCityResult = (city: {
  id: bigint;
  name: string;
  provinceName: string | null;
}): CityResult => ({
  id: city.id.toString(),
  name: city.name,
  province: city.provinceName,
});

export const toCategoryResult = (category: {
  id: bigint;
  name: string;
}): CategoryResult => ({
  id: category.id.toString(),
  name: category.name,
});
