export class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
export const invalid = (field, message) =>
  new AppError(400, "VALIDATION_ERROR", message, { [field]: message });
export const notFound = (resource) =>
  new AppError(404, "NOT_FOUND", `${resource} not found.`);
