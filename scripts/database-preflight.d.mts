import type postgres from "postgres";
export const MIN_POSTGRES_VERSION_NUM: number;
export const POSTGRES_REQUIREMENTS_GUIDE: string;
export function assertSupportedVersion(versionNum: unknown): number;
export function assertSupportedDatabase(sql: postgres.Sql): Promise<number>;
export function checkDatabase(url: string | undefined, options?: postgres.Options<Record<string, postgres.PostgresType>>): Promise<number>;
