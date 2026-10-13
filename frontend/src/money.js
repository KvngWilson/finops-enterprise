export function toMinor(value) {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
    throw new Error(
      "Enter a non-negative amount with at most two decimal places.",
    );
  const [whole, fraction = ""] = value.trim().split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Amount exceeds the safe-integer limit.");
  return Number(minor);
}
export function money(minor, currency) {
  if (!Number.isSafeInteger(minor)) return "Invalid amount";
  // Format the integer and fractional portions separately to preserve the last cent near MAX_SAFE_INTEGER.
  const amount = BigInt(minor);
  const integer = amount / 100n;
  const cents = (amount % 100n).toString().padStart(2, "0");
  return `${currency} ${integer.toLocaleString("en-CA")}.${cents}`;
}
