import type { AccountType } from "@prisma/client";

export type AuthPayload = {
  sub: string;
  type: AccountType;
};
