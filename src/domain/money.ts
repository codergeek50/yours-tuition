/** Parse whole rupees. Returns null for empty, non-numeric, negative, fractional or zero input. */
export function parseRupees(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 ? n : null;
}

const inr = new Intl.NumberFormat('en-IN');

export function formatRupees(n: number): string {
  return `₹${inr.format(n)}`;
}
