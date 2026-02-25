export type CityResult = {
  id: string;
  name: string;
  province?: string | null;
};

export type CategoryResult = {
  id: string;
  name: string;
};

export type ListOptions = {
  page: number;
  limit: number;
  sortOrder: "asc" | "desc";
};

export type ListMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};
