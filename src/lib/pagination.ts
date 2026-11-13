export const PAGE_SIZE = 20;

export function pageFrom(searchParams: Record<string, string | string[] | undefined>) {
  const raw = Number(Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page);
  return Number.isInteger(raw) && raw > 0 && raw < 500 ? raw : 1;
}
