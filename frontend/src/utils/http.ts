import { AxiosError } from "axios";

type ErrorRecord = Record<string, unknown>;
const GENERIC_ERROR_CODES = new Set(["request_failed"]);
const NON_FIELD_KEYS = new Set(["detail", "non_field_errors", "message", "error"]);

const findFirstString = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstString(item);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value as ErrorRecord)) {
      const found = findFirstString(nested);
      if (found) {
        return found;
      }
    }
  }

  return null;
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const parsed = parseApiErrors(error, fallback);
  return getPrimaryErrorMessage(parsed, fallback);
}

export interface ParsedApiErrors {
  fieldErrors: Record<string, string>;
  nonFieldError: string | null;
}

const isRecord = (value: unknown): value is ErrorRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isGenericErrorCode = (value: string) =>
  GENERIC_ERROR_CODES.has(value.trim().toLowerCase());

const mapErrorPayload = (value: unknown, result: ParsedApiErrors): boolean => {
  if (!isRecord(value)) {
    return false;
  }

  let handled = false;
  const nestedDetails = value.details;

  if (nestedDetails !== undefined) {
    if (isRecord(nestedDetails)) {
      handled = mapErrorPayload(nestedDetails, result) || handled;
    } else {
      const nestedMessage = findFirstString(nestedDetails);
      if (nestedMessage && !result.nonFieldError) {
        result.nonFieldError = nestedMessage;
        handled = true;
      }
    }
  }

  for (const [key, rawValue] of Object.entries(value)) {
    if (key === "details") {
      continue;
    }

    const message = findFirstString(rawValue);
    if (!message) {
      continue;
    }

    if (key === "error" && isGenericErrorCode(message)) {
      continue;
    }

    if (NON_FIELD_KEYS.has(key)) {
      if (!result.nonFieldError) {
        result.nonFieldError = message;
      }
      handled = true;
      continue;
    }

    if (!result.fieldErrors[key]) {
      result.fieldErrors[key] = message;
    }
    handled = true;
  }

  return handled;
};

export function getPrimaryErrorMessage(
  parsed: ParsedApiErrors,
  fallback: string,
): string {
  if (parsed.nonFieldError) {
    return parsed.nonFieldError;
  }

  const firstFieldError = Object.values(parsed.fieldErrors)[0];
  if (firstFieldError) {
    return firstFieldError;
  }

  return fallback;
}

export function parseApiErrors(error: unknown, fallback = "An unexpected error occurred"): ParsedApiErrors {
  const result: ParsedApiErrors = { fieldErrors: {}, nonFieldError: null };

  if (error instanceof AxiosError) {
    const data = error.response?.data;
    
    // Check if the backend responded with a structured error payload
    if (mapErrorPayload(data, result)) {
      return result;
    }

    // Handle network errors gracefully
    if (error.code === "ERR_NETWORK" || !error.response) {
      result.nonFieldError = "The server could not be reached. Please check your internet connection.";
      return result;
    }

    // Handle 500 Server Errors gracefully
    if (error.response.status >= 500) {
      result.nonFieldError = "An unexpected server error occurred. Please try again later.";
      return result;
    }
  }

  // Fallback for native JS errors, but hide Axios generic status code strings
  if (error instanceof Error && error.message.trim() && !error.message.startsWith("Request failed with status code")) {
    result.nonFieldError = error.message;
    return result;
  }

  result.nonFieldError = fallback;
  return result;
}
