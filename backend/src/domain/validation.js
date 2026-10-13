import { invalid } from "./errors.js";
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid("body", "A JSON object is required.");
}
export function allowedFields(body, allowed) {
  object(body);
  for (const key of Object.keys(body))
    if (!allowed.includes(key))
      throw invalid(key, `${key} is not editable or is unsupported.`);
}
export function string(value, field, min, max) {
  if (typeof value !== "string")
    throw invalid(field, `${field} must be a string.`);
  const result = value.trim();
  if (result.length < min || result.length > max)
    throw invalid(field, `${field} must contain ${min}–${max} characters.`);
  return result;
}
export function choice(value, field, options) {
  if (!options.includes(value))
    throw invalid(field, `${field} must be one of: ${options.join(", ")}.`);
  return value;
}
export function email(value) {
  const result = string(value, "contactEmail", 3, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    throw invalid("contactEmail", "Enter a valid email address.");
  return result;
}
export function id(value, field = "id") {
  if (typeof value !== "string" || !UUID.test(value))
    throw invalid(field, `${field} must be a UUID.`);
  return value;
}
export function minor(value, field = "balanceMinor", positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0))
    throw invalid(
      field,
      `${field} must be a ${positive ? "positive" : "non-negative"} safe integer in minor units.`,
    );
  return value;
}
export function scalar(value, field) {
  if (value !== undefined && typeof value !== "string")
    throw invalid(field, `${field} must be a single query value.`);
  return value;
}
export function pagination(query) {
  const number = (value, fallback, field, max) => {
    if (value === undefined) return fallback;
    scalar(value, field);
    if (!/^[1-9]\d*$/.test(value))
      throw invalid(field, `${field} must be a positive integer.`);
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n > max)
      throw invalid(field, `${field} must not exceed ${max}.`);
    return n;
  };
  return {
    page: number(query.page, 1, "page", 1000000000),
    pageSize: number(query.pageSize, 10, "pageSize", 100),
  };
}
export function dateBound(value, field, end = false) {
  if (value === undefined || value === "") return undefined;
  scalar(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw invalid(field, `${field} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw invalid(field, `${field} must be a valid calendar date.`);
  return date.getTime() + (end ? 86399999 : 0);
}
export function pageOf(items, paging) {
  const { page, pageSize } = paging;
  return {
    data: items.slice((page - 1) * pageSize, page * pageSize),
    pagination: {
      page,
      pageSize,
      total: items.length,
      totalPages: Math.ceil(items.length / pageSize),
    },
  };
}
