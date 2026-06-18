const knownAcronyms = new Set(['asr', 'bitlocker', 'dns', 'edr', 'firewall', 'lan', 'lsa', 'mdm', 'pin', 'rdp', 'smb', 'tls', 'uac', 'usb', 'vpn', 'wifi']);

const compoundWords: Record<string, string> = {
  allowlist: 'allow list',
  antivirus: 'anti virus',
  bitlocker: 'BitLocker',
  bluetooth: 'Bluetooth',
  defender: 'Defender',
  firewall: 'Firewall',
  lockscreen: 'lock screen',
  microsoft: 'Microsoft',
  onedrive: 'OneDrive',
  passwordless: 'passwordless',
  powershell: 'PowerShell',
  smartscreen: 'SmartScreen',
  windows: 'Windows',
  windows10: 'Windows 10',
  windows11: 'Windows 11',
};

const intuneTerms = [
  'access',
  'administrative',
  'advanced',
  'allow',
  'allowed',
  'archive',
  'attack',
  'baseline',
  'bluetooth',
  'browser',
  'camera',
  'credential',
  'defender',
  'device',
  'enabling',
  'enabled',
  'exploit',
  'firewall',
  'for',
  'internet',
  'local',
  'lock',
  'logon',
  'macro',
  'network',
  'office',
  'password',
  'prevent',
  'protection',
  'remote',
  'urls',
  'scan',
  'scanning',
  'screen',
  'security',
  'smart',
  'screen',
  'script',
  'settings',
  'user',
  'windows',
].sort((left, right) => right.length - left.length);

function splitConcatenatedIntuneTerms(value: string): string[] {
  const lower = value.toLocaleLowerCase();
  const words: string[] = [];
  let index = 0;

  while (index < lower.length) {
    const match = intuneTerms.find((term) => lower.startsWith(term, index));
    if (!match) {
      return [value];
    }
    words.push(match);
    index += match.length;
  }

  return words;
}

function splitCamelAndCompounds(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\d+/g, ' $& ')
    .split(/\s+/)
    .flatMap((part) => {
      const lower = part.toLocaleLowerCase();
      if (compoundWords[lower]) return compoundWords[lower].split(' ');
      if (/^[a-z]{8,}$/i.test(part)) return splitConcatenatedIntuneTerms(part);
      return [part];
    })
    .join(' ');
}

function titleCaseWord(word: string): string {
  const lower = word.toLocaleLowerCase();
  if (knownAcronyms.has(lower)) return lower.toLocaleUpperCase();
  if (compoundWords[lower]) return compoundWords[lower];
  if (word.length <= 2) return lower;
  return `${lower.charAt(0).toLocaleUpperCase()}${lower.slice(1)}`;
}

function cleanupSettingId(rawName: string): string {
  return rawName
    .replace(/^device_vendor_msft_policy_config_/i, '')
    .replace(/^vendor_msft_policy_config_/i, '')
    .replace(/^policy_config_/i, '')
    .replace(/^windows10_?/i, '')
    .replace(/_\d+$/i, '')
    .replace(/_+/g, ' ')
    .replace(/\.+/g, ' ')
    .trim();
}

export function humanizeSettingName(rawName: string): string {
  const cleaned = cleanupSettingId(rawName);
  if (!cleaned) return rawName;

  const words = splitCamelAndCompounds(cleaned)
    .replace(/[-_|:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (words.length === 0) return rawName;

  return words.map(titleCaseWord).join(' ');
}
