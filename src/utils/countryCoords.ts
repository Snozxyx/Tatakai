/**
 * countryCoords — approximate centroid lat/lon per country for the admin world map.
 *
 * Keys are normalised (lower-cased, trimmed) `page_visits.country` values as
 * written by `trackPageVisit` via ipapi.co `country_name`, plus common aliases
 * (ISO names, short names). Unmapped names fall back to list-only rendering.
 */

export interface CountryCoord {
  lat: number;
  lon: number;
  /** ISO-3166 alpha-2, used for the flag emoji. */
  iso2: string;
  /** Canonical display name. */
  label: string;
}

function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

export { flagEmoji };

const RAW: Array<[names: string[], lat: number, lon: number, iso2: string, label: string]> = [
  [['united states', 'united states of america', 'usa', 'us'], 39.8, -98.6, 'US', 'United States'],
  [['canada'], 56.1, -106.3, 'CA', 'Canada'],
  [['mexico'], 23.6, -102.5, 'MX', 'Mexico'],
  [['guatemala'], 15.8, -90.2, 'GT', 'Guatemala'],
  [['belize'], 17.2, -88.7, 'BZ', 'Belize'],
  [['honduras'], 15.2, -86.2, 'HN', 'Honduras'],
  [['el salvador', 'salvador'], 13.8, -88.9, 'SV', 'El Salvador'],
  [['nicaragua'], 13.0, -85.0, 'NI', 'Nicaragua'],
  [['costa rica'], 9.7, -84.0, 'CR', 'Costa Rica'],
  [['panama'], 8.5, -80.8, 'PA', 'Panama'],
  [['cuba'], 21.5, -79.5, 'CU', 'Cuba'],
  [['jamaica'], 18.1, -77.3, 'JM', 'Jamaica'],
  [['haiti'], 19.0, -72.4, 'HT', 'Haiti'],
  [['dominican republic'], 18.7, -70.2, 'DO', 'Dominican Republic'],
  [['puerto rico'], 18.2, -66.5, 'PR', 'Puerto Rico'],
  [['trinidad and tobago'], 10.7, -61.2, 'TT', 'Trinidad and Tobago'],
  [['brazil', 'brasil'], -14.2, -51.9, 'BR', 'Brazil'],
  [['argentina'], -38.4, -63.6, 'AR', 'Argentina'],
  [['chile'], -35.7, -71.5, 'CL', 'Chile'],
  [['peru', 'perú'], -9.2, -75.0, 'PE', 'Peru'],
  [['colombia'], 4.6, -74.1, 'CO', 'Colombia'],
  [['venezuela'], 6.4, -66.6, 'VE', 'Venezuela'],
  [['ecuador'], -1.8, -78.2, 'EC', 'Ecuador'],
  [['bolivia'], -16.3, -68.1, 'BO', 'Bolivia'],
  [['paraguay'], -23.4, -58.4, 'PY', 'Paraguay'],
  [['uruguay'], -32.5, -55.8, 'UY', 'Uruguay'],
  [['united kingdom', 'uk', 'great britain', 'britain', 'england'], 55.4, -3.4, 'GB', 'United Kingdom'],
  [['ireland'], 53.4, -8.2, 'IE', 'Ireland'],
  [['france'], 46.6, 2.4, 'FR', 'France'],
  [['germany', 'deutschland'], 51.2, 10.4, 'DE', 'Germany'],
  [['netherlands', 'holland'], 52.1, 5.3, 'NL', 'Netherlands'],
  [['belgium'], 50.5, 4.5, 'BE', 'Belgium'],
  [['spain', 'españa'], 40.5, -3.7, 'ES', 'Spain'],
  [['portugal'], 39.6, -8.0, 'PT', 'Portugal'],
  [['italy', 'italia'], 41.9, 12.6, 'IT', 'Italy'],
  [['switzerland'], 46.8, 8.2, 'CH', 'Switzerland'],
  [['austria', 'österreich'], 47.5, 14.6, 'AT', 'Austria'],
  [['poland', 'polska'], 51.9, 19.1, 'PL', 'Poland'],
  [['czech republic', 'czechia', 'czech czech republic', 'czech'], 49.8, 15.5, 'CZ', 'Czechia'],
  [['slovakia'], 48.7, 19.7, 'SK', 'Slovakia'],
  [['hungary', 'magyarország'], 47.2, 19.5, 'HU', 'Hungary'],
  [['romania'], 45.9, 25.0, 'RO', 'Romania'],
  [['bulgaria'], 42.7, 25.5, 'BG', 'Bulgaria'],
  [['greece'], 39.1, 21.8, 'GR', 'Greece'],
  [['croatia', 'hrvatska'], 45.1, 15.2, 'HR', 'Croatia'],
  [['serbia'], 44.0, 20.8, 'RS', 'Serbia'],
  [['bosnia and herzegovina', 'bosnia'], 43.9, 17.7, 'BA', 'Bosnia and Herzegovina'],
  [['albania'], 41.2, 20.2, 'AL', 'Albania'],
  [['north macedonia', 'macedonia'], 41.6, 21.7, 'MK', 'North Macedonia'],
  [['slovenia'], 46.1, 14.8, 'SI', 'Slovenia'],
  [['ukraine'], 48.4, 31.2, 'UA', 'Ukraine'],
  [['belarus'], 53.7, 27.9, 'BY', 'Belarus'],
  [['moldova'], 47.4, 28.5, 'MD', 'Moldova'],
  [['lithuania'], 55.2, 23.9, 'LT', 'Lithuania'],
  [['latvia'], 57.0, 25.0, 'LV', 'Latvia'],
  [['estonia'], 58.6, 25.0, 'EE', 'Estonia'],
  [['finland', 'suomi'], 61.9, 25.7, 'FI', 'Finland'],
  [['sweden', 'sverige'], 60.1, 18.6, 'SE', 'Sweden'],
  [['norway', 'norge'], 64.5, 11.5, 'NO', 'Norway'],
  [['denmark', 'danmark'], 56.3, 10.0, 'DK', 'Denmark'],
  [['iceland', 'ísland'], 65.0, -18.1, 'IS', 'Iceland'],
  [['russia', 'russian federation'], 61.5, 90.0, 'RU', 'Russia'],
  [['turkey', 'turkiye', 'türkiye'], 39.0, 35.2, 'TR', 'Turkey'],
  [['cyprus'], 35.1, 33.4, 'CY', 'Cyprus'],
  [['georgia'], 42.3, 43.7, 'GE', 'Georgia'],
  [['armenia'], 40.1, 45.0, 'AM', 'Armenia'],
  [['azerbaijan'], 40.1, 47.6, 'AZ', 'Azerbaijan'],
  [['kazakhstan'], 48.0, 66.9, 'KZ', 'Kazakhstan'],
  [['uzbekistan'], 41.4, 64.6, 'UZ', 'Uzbekistan'],
  [['turkmenistan'], 39.0, 59.4, 'TM', 'Turkmenistan'],
  [['kyrgyzstan'], 41.2, 74.8, 'KG', 'Kyrgyzstan'],
  [['tajikistan'], 38.9, 71.0, 'TJ', 'Tajikistan'],
  [['israel'], 31.0, 34.8, 'IL', 'Israel'],
  [['palestine', 'palestinian territory', 'west bank'], 31.9, 35.2, 'PS', 'Palestine'],
  [['jordan'], 31.2, 36.4, 'JO', 'Jordan'],
  [['lebanon', 'liban'], 33.9, 35.9, 'LB', 'Lebanon'],
  [['syria', 'syrian arab republic'], 35.0, 38.0, 'SY', 'Syria'],
  [['iraq'], 33.2, 43.7, 'IQ', 'Iraq'],
  [['iran', 'islamic republic of iran'], 32.4, 53.7, 'IR', 'Iran'],
  [['saudi arabia'], 23.9, 45.1, 'SA', 'Saudi Arabia'],
  [['yemen'], 15.6, 48.5, 'YE', 'Yemen'],
  [['oman'], 21.5, 55.9, 'OM', 'Oman'],
  [['united arab emirates', 'uae'], 24.0, 54.0, 'AE', 'UAE'],
  [['qatar'], 25.3, 51.2, 'QA', 'Qatar'],
  [['bahrain'], 26.0, 50.6, 'BH', 'Bahrain'],
  [['kuwait'], 29.3, 47.5, 'KW', 'Kuwait'],
  [['egypt'], 26.8, 30.8, 'EG', 'Egypt'],
  [['libya'], 27.0, 17.5, 'LY', 'Libya'],
  [['tunisia'], 33.9, 9.5, 'TN', 'Tunisia'],
  [['algeria'], 28.0, 1.7, 'DZ', 'Algeria'],
  [['morocco', 'maroc'], 31.8, -6.1, 'MA', 'Morocco'],
  [['sudan'], 12.9, 30.2, 'SD', 'Sudan'],
  [['ethiopia'], 9.1, 40.5, 'ET', 'Ethiopia'],
  [['somalia'], 5.2, 46.2, 'SO', 'Somalia'],
  [['kenya'], -0.0, 37.9, 'KE', 'Kenya'],
  [['uganda'], 1.4, 32.4, 'UG', 'Uganda'],
  [['tanzania', 'united republic of tanzania'], -6.4, 34.9, 'TZ', 'Tanzania'],
  [['rwanda'], -1.9, 30.1, 'RW', 'Rwanda'],
  [['nigeria'], 9.1, 8.7, 'NG', 'Nigeria'],
  [['ghana'], 7.9, -1.0, 'GH', 'Ghana'],
  [['senegal'], 14.5, -14.5, 'SN', 'Senegal'],
  [['mali'], 17.6, -3.9, 'ML', 'Mali'],
  [['ivory coast', "côte d'ivoire", 'cote divoire'], 7.5, -5.5, 'CI', 'Ivory Coast'],
  [['cameroon'], 7.4, 12.4, 'CM', 'Cameroon'],
  [['congo', 'republic of the congo'], -0.2, 15.8, 'CG', 'Congo'],
  [['democratic republic of the congo', 'dr congo', 'congo (democratic republic)'], -4.0, 21.8, 'CD', 'DR Congo'],
  [['angola'], -11.2, 17.9, 'AO', 'Angola'],
  [['south africa'], -30.6, 22.9, 'ZA', 'South Africa'],
  [['namibia'], -22.9, 18.5, 'NA', 'Namibia'],
  [['botswana'], -22.3, 23.7, 'BW', 'Botswana'],
  [['zimbabwe'], -19.0, 29.9, 'ZW', 'Zimbabwe'],
  [['mozambique'], -18.7, 35.5, 'MZ', 'Mozambique'],
  [['madagascar'], -18.8, 46.9, 'MG', 'Madagascar'],
  [['mauritius'], -20.3, 57.5, 'MU', 'Mauritius'],
  [['india', 'bharat'], 20.6, 79.0, 'IN', 'India'],
  [['pakistan'], 30.4, 69.3, 'PK', 'Pakistan'],
  [['bangladesh'], 23.7, 90.4, 'BD', 'Bangladesh'],
  [['sri lanka'], 7.9, 80.8, 'LK', 'Sri Lanka'],
  [['nepal'], 28.4, 84.1, 'NP', 'Nepal'],
  [['bhutan'], 27.5, 90.4, 'BT', 'Bhutan'],
  [['maldives'], 3.2, 73.2, 'MV', 'Maldives'],
  [['afghanistan'], 33.9, 67.7, 'AF', 'Afghanistan'],
  [['myanmar', 'burma'], 21.9, 96.0, 'MM', 'Myanmar'],
  [['thailand'], 15.9, 101.0, 'TH', 'Thailand'],
  [['laos'], 19.9, 102.5, 'LA', 'Laos'],
  [['vietnam', 'viet nam'], 14.1, 108.3, 'VN', 'Vietnam'],
  [['cambodia'], 12.6, 105.0, 'KH', 'Cambodia'],
  [['malaysia'], 4.2, 102.2, 'MY', 'Malaysia'],
  [['singapore'], 1.35, 103.8, 'SG', 'Singapore'],
  [['indonesia'], -2.5, 118.0, 'ID', 'Indonesia'],
  [['philippines', 'pilipinas'], 12.9, 121.8, 'PH', 'Philippines'],
  [['china'], 35.9, 104.2, 'CN', 'China'],
  [['hong kong'], 22.3, 114.2, 'HK', 'Hong Kong'],
  [['taiwan'], 23.7, 121.0, 'TW', 'Taiwan'],
  [['south korea', 'korea, republic of', 'korea republic', 'korea (south)', 'republic of korea'], 36.4, 127.9, 'KR', 'South Korea'],
  [['north korea', "korea, democratic people's republic of", 'dprk'], 40.3, 127.0, 'KP', 'North Korea'],
  [['japan', 'nippon'], 36.2, 138.3, 'JP', 'Japan'],
  [['mongolia'], 46.9, 105.0, 'MN', 'Mongolia'],
  [['australia'], -25.3, 133.8, 'AU', 'Australia'],
  [['new zealand', 'aotearoa'], -40.9, 174.9, 'NZ', 'New Zealand'],
  [['fiji'], -17.7, 178.0, 'FJ', 'Fiji'],
  [['papua new guinea'], -6.3, 147.0, 'PG', 'Papua New Guinea'],
  [['swaziland', 'eswatini'], -26.5, 31.5, 'SZ', 'Eswatini'],
];

export const COUNTRY_COORDS: Record<string, CountryCoord> = {};
for (const [names, lat, lon, iso2, label] of RAW) {
  for (const n of names) COUNTRY_COORDS[n] = { lat, lon, iso2, label };
}

/** Normalise a raw country string for lookup. */
export function normaliseCountry(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function coordForCountry(name: string): CountryCoord | undefined {
  return COUNTRY_COORDS[normaliseCountry(name)];
}

/** Equirectangular projection into a 1000×500 viewBox. */
export function projectCountry(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * 1000;
  const y = ((90 - lat) / 180) * 500;
  return { x, y };
}
