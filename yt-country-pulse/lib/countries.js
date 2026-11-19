// Tarile suportate de Google Trends (geo) si YouTube Data API (regionCode).
// Include capitala si aliasuri, ca sa putem filtra subiectele "de tara".

export const COUNTRIES = [
  { code: 'RO', name: 'România', flag: '🇷🇴', capital: 'București', aliases: ['romania', 'romaniei', 'bucuresti', 'cluj', 'timisoara', 'iasi', 'constanta', 'brasov', 'craiova', 'galati', 'ploiesti', 'oradea', 'sibiu', 'arges', 'valcea'] },
  { code: 'MD', name: 'Republica Moldova', flag: '🇲🇩', capital: 'Chișinău', aliases: ['moldova', 'moldovei', 'chisinau'] },
  { code: 'US', name: 'Statele Unite', flag: '🇺🇸', capital: 'Washington', aliases: ['america', 'sua', 'statele unite', 'usa'] },
  { code: 'GB', name: 'Marea Britanie', flag: '🇬🇧', capital: 'Londra', aliases: ['anglia', 'britania', 'uk', 'london'] },
  { code: 'DE', name: 'Germania', flag: '🇩🇪', capital: 'Berlin', aliases: ['germany', 'nemtii'] },
  { code: 'FR', name: 'Franța', flag: '🇫🇷', capital: 'Paris', aliases: ['france', 'paris'] },
  { code: 'IT', name: 'Italia', flag: '🇮🇹', capital: 'Roma', aliases: ['italy', 'rome'] },
  { code: 'ES', name: 'Spania', flag: '🇪🇸', capital: 'Madrid', aliases: ['spain'] },
  { code: 'PT', name: 'Portugalia', flag: '🇵🇹', capital: 'Lisabona' },
  { code: 'NL', name: 'Olanda', flag: '🇳🇱', capital: 'Amsterdam', aliases: ['olandei', 'netherlands', 'holland'] },
  { code: 'BE', name: 'Belgia', flag: '🇧🇪', capital: 'Bruxelles' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹', capital: 'Viena' },
  { code: 'CH', name: 'Elveția', flag: '🇨🇭', capital: 'Berna', aliases: ['switzerland'] },
  { code: 'IE', name: 'Irlanda', flag: '🇮🇪', capital: 'Dublin' },
  { code: 'PL', name: 'Polonia', flag: '🇵🇱', capital: 'Varșovia', aliases: ['poland'] },
  { code: 'CZ', name: 'Cehia', flag: '🇨🇿', capital: 'Praga' },
  { code: 'SK', name: 'Slovacia', flag: '🇸🇰', capital: 'Bratislava' },
  { code: 'HU', name: 'Ungaria', flag: '🇭🇺', capital: 'Budapesta', aliases: ['ungariei', 'hungary'] },
  { code: 'BG', name: 'Bulgaria', flag: '🇧🇬', capital: 'Sofia' },
  { code: 'GR', name: 'Grecia', flag: '🇬🇷', capital: 'Atena', aliases: ['greece'] },
  { code: 'HR', name: 'Croația', flag: '🇭🇷', capital: 'Zagreb' },
  { code: 'RS', name: 'Serbia', flag: '🇷🇸', capital: 'Belgrad' },
  { code: 'SI', name: 'Slovenia', flag: '🇸🇮', capital: 'Ljubljana' },
  { code: 'UA', name: 'Ucraina', flag: '🇺🇦', capital: 'Kiev', aliases: ['ukraine', 'kyiv'] },
  { code: 'TR', name: 'Turcia', flag: '🇹🇷', capital: 'Ankara', aliases: ['turkey', 'istanbul'] },
  { code: 'RU', name: 'Rusia', flag: '🇷🇺', capital: 'Moscova', aliases: ['russia', 'moscow'] },
  { code: 'SE', name: 'Suedia', flag: '🇸🇪', capital: 'Stockholm' },
  { code: 'NO', name: 'Norvegia', flag: '🇳🇴', capital: 'Oslo' },
  { code: 'DK', name: 'Danemarca', flag: '🇩🇰', capital: 'Copenhaga' },
  { code: 'FI', name: 'Finlanda', flag: '🇫🇮', capital: 'Helsinki' },
  { code: 'IS', name: 'Islanda', flag: '🇮🇸', capital: 'Reykjavik' },
  { code: 'EE', name: 'Estonia', flag: '🇪🇪', capital: 'Tallinn' },
  { code: 'LV', name: 'Letonia', flag: '🇱🇻', capital: 'Riga' },
  { code: 'LT', name: 'Lituania', flag: '🇱🇹', capital: 'Vilnius' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', capital: 'Ottawa' },
  { code: 'MX', name: 'Mexic', flag: '🇲🇽', capital: 'Ciudad de México', aliases: ['mexico'] },
  { code: 'BR', name: 'Brazilia', flag: '🇧🇷', capital: 'Brasilia', aliases: ['brazil'] },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', capital: 'Buenos Aires' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱', capital: 'Santiago' },
  { code: 'CO', name: 'Columbia', flag: '🇨🇴', capital: 'Bogota' },
  { code: 'PE', name: 'Peru', flag: '🇵🇪', capital: 'Lima' },
  { code: 'JP', name: 'Japonia', flag: '🇯🇵', capital: 'Tokyo', aliases: ['japan'] },
  { code: 'KR', name: 'Coreea de Sud', flag: '🇰🇷', capital: 'Seul', aliases: ['coreea', 'korea', 'seoul'] },
  { code: 'CN', name: 'China', flag: '🇨🇳', capital: 'Beijing' },
  { code: 'IN', name: 'India', flag: '🇮🇳', capital: 'New Delhi' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰', capital: 'Islamabad' },
  { code: 'ID', name: 'Indonezia', flag: '🇮🇩', capital: 'Jakarta' },
  { code: 'TH', name: 'Thailanda', flag: '🇹🇭', capital: 'Bangkok' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳', capital: 'Hanoi' },
  { code: 'PH', name: 'Filipine', flag: '🇵🇭', capital: 'Manila' },
  { code: 'MY', name: 'Malaezia', flag: '🇲🇾', capital: 'Kuala Lumpur' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', capital: 'Singapore' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', capital: 'Canberra', aliases: ['sydney'] },
  { code: 'NZ', name: 'Noua Zeelandă', flag: '🇳🇿', capital: 'Wellington' },
  { code: 'ZA', name: 'Africa de Sud', flag: '🇿🇦', capital: 'Pretoria' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', capital: 'Abuja' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪', capital: 'Nairobi' },
  { code: 'EG', name: 'Egipt', flag: '🇪🇬', capital: 'Cairo' },
  { code: 'MA', name: 'Maroc', flag: '🇲🇦', capital: 'Rabat' },
  { code: 'SA', name: 'Arabia Saudită', flag: '🇸🇦', capital: 'Riyadh' },
  { code: 'AE', name: 'Emiratele Arabe Unite', flag: '🇦🇪', capital: 'Abu Dhabi', aliases: ['dubai', 'emirate'] },
  { code: 'IL', name: 'Israel', flag: '🇮🇱', capital: 'Ierusalim' },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryOf(code) {
  const key = String(code || '').toUpperCase();
  return BY_CODE.get(key) || { code: key || 'RO', name: key || 'Necunoscută', flag: '🌍', capital: null, aliases: [] };
}

export function isSupported(code) {
  return BY_CODE.has(String(code || '').toUpperCase());
}

/**
 * Termeni care identifica "subiecte de tara": numele tarii, capitala, aliasuri.
 * Se folosesc pentru filtrul "ascunde subiectele despre tara".
 */
export function countryTerms(code) {
  const c = countryOf(code);
  return [c.name, c.capital, ...(c.aliases || [])].filter(Boolean);
}
