export function splitPrefixes(input: string): string[] {
  return input
    .split(/[\n,;]/)
    .map((prefix) => prefix.trim())
    .filter(Boolean);
}

export function normalizePolicyNameV2(name: string, prefixes: string[] = []): string {
  let normalized = name.trim().toLocaleLowerCase();

  const orderedPrefixes = prefixes
    .map((prefix) => prefix.trim().toLocaleLowerCase())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  for (const prefix of orderedPrefixes) {
    const compactPrefix = prefix.replace(/[-_|:\s]+$/g, '');
    const patterns = [prefix, compactPrefix].filter(Boolean);
    const matched = patterns.find((candidate) => normalized.startsWith(candidate));
    if (matched) {
      normalized = normalized.slice(matched.length);
      break;
    }
  }

  return normalized
    .replace(/[-_|:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function similarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : intersection / union;
}
