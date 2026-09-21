import { ApiError } from '../lib/errors.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const today = () => new Date().toISOString().slice(0, 10);

/** True only for a date that exists, so 2026-02-30 is rejected. */
function isRealDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function checkString(rule, raw) {
  let value = String(raw);
  if (rule.trim !== false) value = value.trim();
  if (rule.lowercase) value = value.toLowerCase();
  if (rule.min !== undefined && value.length < rule.min) {
    return { error: `Must be at least ${rule.min} characters.` };
  }
  if (rule.max !== undefined && value.length > rule.max) {
    return { error: `Must be at most ${rule.max} characters.` };
  }
  return { value };
}

function checkNumber(rule, raw, { integer = false } = {}) {
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(value)) return { error: 'Must be a number.' };
  if (integer && !Number.isInteger(value)) return { error: 'Must be a whole number.' };
  if (rule.min !== undefined && value < rule.min) {
    return { error: `Must be ${rule.min} or more.` };
  }
  if (rule.max !== undefined && value > rule.max) {
    return { error: `Must be ${rule.max} or less.` };
  }
  return { value };
}

function checkField(rule, raw) {
  switch (rule.type) {
    case 'string':
      return checkString(rule, raw);

    case 'email': {
      const result = checkString({ ...rule, lowercase: true, max: rule.max ?? 254 }, raw);
      if (result.error) return result;
      if (!EMAIL_PATTERN.test(result.value)) return { error: 'Enter a valid email address.' };
      return result;
    }

    case 'username': {
      const result = checkString({ ...rule, lowercase: true }, raw);
      if (result.error) return result;
      if (!USERNAME_PATTERN.test(result.value)) {
        return {
          error: '3 to 20 characters, using lowercase letters, digits, underscore or hyphen.',
        };
      }
      return result;
    }

    case 'password': {
      // Not trimmed: a leading or trailing space is a legitimate character.
      const value = String(raw);
      if (value.length < (rule.min ?? 8)) {
        return { error: `Must be at least ${rule.min ?? 8} characters.` };
      }
      if (value.length > (rule.max ?? 200)) {
        return { error: `Must be at most ${rule.max ?? 200} characters.` };
      }
      return { value };
    }

    case 'date': {
      const value = String(raw).trim().slice(0, 10);
      if (!isRealDate(value)) return { error: 'Enter a real date as YYYY-MM-DD.' };
      if (rule.notFuture && value > today()) return { error: 'This date cannot be in the future.' };
      if (rule.notBefore && value < rule.notBefore) {
        return { error: `Must be on or after ${rule.notBefore}.` };
      }
      return { value };
    }

    case 'number':
      return checkNumber(rule, raw);

    case 'integer':
      return checkNumber(rule, raw, { integer: true });

    case 'enum':
      return rule.values.includes(raw)
        ? { value: raw }
        : { error: `Must be one of: ${rule.values.join(', ')}.` };

    case 'boolean': {
      if (typeof raw === 'boolean') return { value: raw };
      if (raw === 'true' || raw === 1 || raw === '1') return { value: true };
      if (raw === 'false' || raw === 0 || raw === '0') return { value: false };
      return { error: 'Must be true or false.' };
    }

    default:
      throw new Error(`unknown validation type ${JSON.stringify(rule.type)}`);
  }
}

export function applySchema(schema, input) {
  const value = {};
  const errors = {};

  for (const [name, rule] of Object.entries(schema)) {
    const raw = input?.[name];
    const absent = raw === undefined || raw === null || raw === '';

    if (absent) {
      if (rule.required) errors[name] = 'This field is required.';
      else if ('default' in rule) value[name] = rule.default;
      continue;
    }

    const result = checkField(rule, raw);
    if (result.error) errors[name] = result.error;
    else value[name] = result.value;
  }

  return { value, errors };
}

function makeValidator(schema, source, target) {
  return (req, res, next) => {
    const { value, errors } = applySchema(schema, req[source] ?? {});
    if (Object.keys(errors).length > 0) {
      return next(ApiError.unprocessable('Some fields need attention.', errors));
    }
    req[target] = value;
    return next();
  };
}

/**
 * Validation lives on the server. The forms validate too, but only so the user
 * sees a message sooner; nothing here trusts the client.
 */
export const validateBody = (schema) => makeValidator(schema, 'body', 'valid');
export const validateQuery = (schema) => makeValidator(schema, 'query', 'validQuery');
