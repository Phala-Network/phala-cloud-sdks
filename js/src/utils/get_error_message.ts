import type { ApiError } from "../types";

export function getErrorMessage(error: ApiError): string {
  if (typeof error.detail === "string") {
    return error.detail;
  }

  if (Array.isArray(error.detail)) {
    if (error.detail.length > 0) {
      return error.detail[0]?.msg || "Validation error";
    }
    return "Validation error";
  }

  if (typeof error.detail === "object" && error.detail !== null) {
    return JSON.stringify(error.detail);
  }

  return "Unknown error occurred";
}
