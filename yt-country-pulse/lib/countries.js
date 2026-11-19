// Tarile suportate atat de Google Trends (geo) cat si de YouTube Data API (regionCode ISO 3166-1 alpha-2).
// Numele sunt in romana.

export const COUNTRIES = [
  { code: 'RO', name: 'România', flag: '🇷🇴' },
  { code: 'MD', name: 'Republica Moldova', flag: '🇲🇩' },
  { code: 'US', name: 'Statele Unite', flag: '🇺🇸' },
  { code: 'GB', name: 'Marea Britanie', flag: '🇬🇧' },
  { code: 'DE', name: 'Germania', flag: '🇩🇪' },
  { code: 'FR', name: 'Franța', flag: '🇫🇷' },
  { code: 'IT', name: 'Italia', flag: '🇮🇹' },
  { code: 'ES', name: 'Spania', flag: '🇪🇸' },
  { code: 'PT', name: 'Portugalia', flag: '🇵🇹' },
  { code: 'NL', name: 'Olanda', flag: '🇳🇱' },
  { code: 'BE', name: 'Belgia', flag: '🇧🇪' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹' },
  { code: 'CH', name: 'Elveția', flag: '🇨🇭' },
  { code: 'IE', name: 'Irlanda', flag: '🇮🇪' },
  { code: 'PL', name: 'Polonia', flag: '🇵🇱' },
  { code: 'CZ', name: 'Cehia', flag: '🇨🇿' },
  { code: 'SK', name: 'Slovacia', flag: '🇸🇰' },
  { code: 'HU', name: 'Ungaria', flag: '🇭🇺' },
  { code: 'BG', name: 'Bulgaria', flag: '🇧🇬' },
  { code: 'GR', name: 'Grecia', flag: '🇬🇷' },
  { code: 'HR', name: 'Croația', flag: '🇭🇷' },
  { code: 'RS', name: 'Serbia', flag: '🇷🇸' },
  { code: 'SI', name: 'Slovenia', flag: '🇸🇮' },
  { code: 'UA', name: 'Ucraina', flag: '🇺🇦' },
  { code: 'TR', name: 'Turcia', flag: '🇹🇷' },
  { code: 'RU', name: 'Rusia', flag: '🇷🇺' },
  { code: 'SE', name: 'Suedia', flag: '🇸🇪' },
  { code: 'NO', name: 'Norvegia', flag: '🇳🇴' },
  { code: 'DK', name: 'Danemarca', flag: '🇩🇰' },
  { code: 'FI', name: 'Finlanda', flag: '🇫🇮' },
  { code: 'IS', name: 'Islanda', flag: '🇮🇸' },
  { code: 'EE', name: 'Estonia', flag: '🇪🇪' },
  { code: 'LV', name: 'Letonia', flag: '🇱🇻' },
  { code: 'LT', name: 'Lituania', flag: '🇱🇹' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'MX', name: 'Mexic', flag: '🇲🇽' },
  { code: 'BR', name: 'Brazilia', flag: '🇧🇷' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱' },
  { code: 'CO', name: 'Columbia', flag: '🇨🇴' },
  { code: 'PE', name: 'Peru', flag: '🇵🇪' },
  { code: 'JP', name: 'Japonia', flag: '🇯🇵' },
  { code: 'KR', name: 'Coreea de Sud', flag: '🇰🇷' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'ID', name: 'Indonezia', flag: '🇮🇩' },
  { code: 'TH', name: 'Thailanda', flag: '🇹🇭' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'PH', name: 'Filipine', flag: '🇵🇭' },
  { code: 'MY', name: 'Malaezia', flag: '🇲🇾' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'NZ', name: 'Noua Zeelandă', flag: '🇳🇿' },
  { code: 'ZA', name: 'Africa de Sud', flag: '🇿🇦' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪' },
  { code: 'EG', name: 'Egipt', flag: '🇪🇬' },
  { code: 'MA', name: 'Maroc', flag: '🇲🇦' },
  { code: 'SA', name: 'Arabia Saudită', flag: '🇸🇦' },
  { code: 'AE', name: 'Emiratele Arabe Unite', flag: '🇦🇪' },
  { code: 'IL', name: 'Israel', flag: '🇮🇱' },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryOf(code) {
  const key = String(code || '').toUpperCase();
  return BY_CODE.get(key) || { code: key || 'RO', name: key || 'Necunoscută', flag: '🌍' };
}

export function isSupported(code) {
  return BY_CODE.has(String(code || '').toUpperCase());
}
