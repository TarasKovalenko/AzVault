import type { CreateSecretRequest } from '../../types';

const SECRET_NAME_PATTERN = /^[a-zA-Z0-9-]+$/;

interface RawImportItem {
  name?: unknown;
  value?: unknown;
  contentType?: unknown;
  enabled?: unknown;
  expires?: unknown;
  notBefore?: unknown;
  tags?: unknown;
}

interface ImportEnvelope {
  secrets?: unknown;
}

export interface ParsedSecretImport {
  requests: CreateSecretRequest[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDateField(value: unknown, field: string, index: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error(`Item ${index + 1}: '${field}' must be an ISO date string.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Item ${index + 1}: '${field}' is not a valid date.`);
  }
  return date.toISOString();
}

function parseTags(value: unknown, index: number): Record<string, string> | null {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) {
    throw new Error(`Item ${index + 1}: 'tags' must be an object of string values.`);
  }
  const tags: Record<string, string> = {};
  for (const [key, tagValue] of Object.entries(value)) {
    if (typeof tagValue !== 'string') {
      throw new Error(`Item ${index + 1}: tag '${key}' must be a string.`);
    }
    tags[key] = tagValue;
  }
  return Object.keys(tags).length > 0 ? tags : null;
}

function normalizeItems(parsed: unknown): RawImportItem[] {
  if (Array.isArray(parsed)) return parsed as RawImportItem[];
  if (isObject(parsed)) {
    const envelope = parsed as ImportEnvelope;
    if (Array.isArray(envelope.secrets)) return envelope.secrets as RawImportItem[];
  }
  throw new Error("JSON must be an array or an object with a 'secrets' array.");
}

function parseItem(item: RawImportItem, index: number): CreateSecretRequest {
  if (!isObject(item)) {
    throw new Error(`Item ${index + 1}: each entry must be an object.`);
  }

  const name = typeof item.name === 'string' ? item.name.trim() : '';
  if (!name) {
    throw new Error(`Item ${index + 1}: 'name' is required.`);
  }
  if (!SECRET_NAME_PATTERN.test(name)) {
    throw new Error(`Item ${index + 1}: 'name' may only contain letters, numbers, and dashes.`);
  }

  if (typeof item.value !== 'string' || !item.value.trim()) {
    throw new Error(`Item ${index + 1}: 'value' is required and must be a non-empty string.`);
  }

  if (
    item.contentType !== undefined &&
    item.contentType !== null &&
    typeof item.contentType !== 'string'
  ) {
    throw new Error(`Item ${index + 1}: 'contentType' must be a string when provided.`);
  }

  if (item.enabled !== undefined && item.enabled !== null && typeof item.enabled !== 'boolean') {
    throw new Error(`Item ${index + 1}: 'enabled' must be a boolean when provided.`);
  }

  return {
    name,
    value: item.value,
    contentType:
      typeof item.contentType === 'string' && item.contentType.trim()
        ? item.contentType.trim()
        : null,
    enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
    expires: parseDateField(item.expires, 'expires', index),
    notBefore: parseDateField(item.notBefore, 'notBefore', index),
    tags: parseTags(item.tags, index),
  };
}

export function parseSecretsImportJson(input: string): ParsedSecretImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error('Invalid JSON file.');
  }

  const items = normalizeItems(parsed);
  if (items.length === 0) {
    throw new Error('Import file is empty.');
  }

  const requests = items.map((item, index) => parseItem(item, index));
  return { requests };
}
