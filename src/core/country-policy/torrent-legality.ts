export type TorrentPolicy = 'legal' | 'decriminalized' | 'illegal' | 'unclear' | 'vpn_required';

export interface CountryTorrentPolicy {
  iso2: string;
  name: string;
  policy: TorrentPolicy;
  note?: string;
}

// 196-country baseline table (non-blocking UI metadata).
// Policy values are conservative defaults and can be admin-updated later.
const BASE_ROWS: Array<[string, string]> = [
  ['AF','Afghanistan'],['AL','Albania'],['DZ','Algeria'],['AD','Andorra'],['AO','Angola'],['AG','Antigua and Barbuda'],
  ['AR','Argentina'],['AM','Armenia'],['AU','Australia'],['AT','Austria'],['AZ','Azerbaijan'],['BS','Bahamas'],
  ['BH','Bahrain'],['BD','Bangladesh'],['BB','Barbados'],['BY','Belarus'],['BE','Belgium'],['BZ','Belize'],
  ['BJ','Benin'],['BT','Bhutan'],['BO','Bolivia'],['BA','Bosnia and Herzegovina'],['BW','Botswana'],['BR','Brazil'],
  ['BN','Brunei'],['BG','Bulgaria'],['BF','Burkina Faso'],['BI','Burundi'],['CV','Cabo Verde'],['KH','Cambodia'],
  ['CM','Cameroon'],['CA','Canada'],['CF','Central African Republic'],['TD','Chad'],['CL','Chile'],['CN','China'],
  ['CO','Colombia'],['KM','Comoros'],['CG','Congo'],['CD','Congo (DRC)'],['CR','Costa Rica'],['CI',"Cote d'Ivoire"],
  ['HR','Croatia'],['CU','Cuba'],['CY','Cyprus'],['CZ','Czechia'],['DK','Denmark'],['DJ','Djibouti'],
  ['DM','Dominica'],['DO','Dominican Republic'],['EC','Ecuador'],['EG','Egypt'],['SV','El Salvador'],['GQ','Equatorial Guinea'],
  ['ER','Eritrea'],['EE','Estonia'],['SZ','Eswatini'],['ET','Ethiopia'],['FJ','Fiji'],['FI','Finland'],
  ['FR','France'],['GA','Gabon'],['GM','Gambia'],['GE','Georgia'],['DE','Germany'],['GH','Ghana'],
  ['GR','Greece'],['GD','Grenada'],['GT','Guatemala'],['GN','Guinea'],['GW','Guinea-Bissau'],['GY','Guyana'],
  ['HT','Haiti'],['HN','Honduras'],['HU','Hungary'],['IS','Iceland'],['IN','India'],['ID','Indonesia'],
  ['IR','Iran'],['IQ','Iraq'],['IE','Ireland'],['IL','Israel'],['IT','Italy'],['JM','Jamaica'],
  ['JP','Japan'],['JO','Jordan'],['KZ','Kazakhstan'],['KE','Kenya'],['KI','Kiribati'],['KP','Korea (North)'],
  ['KR','Korea (South)'],['KW','Kuwait'],['KG','Kyrgyzstan'],['LA','Laos'],['LV','Latvia'],['LB','Lebanon'],
  ['LS','Lesotho'],['LR','Liberia'],['LY','Libya'],['LI','Liechtenstein'],['LT','Lithuania'],['LU','Luxembourg'],
  ['MG','Madagascar'],['MW','Malawi'],['MY','Malaysia'],['MV','Maldives'],['ML','Mali'],['MT','Malta'],
  ['MH','Marshall Islands'],['MR','Mauritania'],['MU','Mauritius'],['MX','Mexico'],['FM','Micronesia'],['MD','Moldova'],
  ['MC','Monaco'],['MN','Mongolia'],['ME','Montenegro'],['MA','Morocco'],['MZ','Mozambique'],['MM','Myanmar'],
  ['NA','Namibia'],['NR','Nauru'],['NP','Nepal'],['NL','Netherlands'],['NZ','New Zealand'],['NI','Nicaragua'],
  ['NE','Niger'],['NG','Nigeria'],['MK','North Macedonia'],['NO','Norway'],['OM','Oman'],['PK','Pakistan'],
  ['PW','Palau'],['PA','Panama'],['PG','Papua New Guinea'],['PY','Paraguay'],['PE','Peru'],['PH','Philippines'],
  ['PL','Poland'],['PT','Portugal'],['QA','Qatar'],['RO','Romania'],['RU','Russia'],['RW','Rwanda'],
  ['KN','Saint Kitts and Nevis'],['LC','Saint Lucia'],['VC','Saint Vincent and the Grenadines'],['WS','Samoa'],
  ['SM','San Marino'],['ST','Sao Tome and Principe'],['SA','Saudi Arabia'],['SN','Senegal'],['RS','Serbia'],['SC','Seychelles'],
  ['SL','Sierra Leone'],['SG','Singapore'],['SK','Slovakia'],['SI','Slovenia'],['SB','Solomon Islands'],['SO','Somalia'],
  ['ZA','South Africa'],['SS','South Sudan'],['ES','Spain'],['LK','Sri Lanka'],['SD','Sudan'],['SR','Suriname'],
  ['SE','Sweden'],['CH','Switzerland'],['SY','Syria'],['TW','Taiwan'],['TJ','Tajikistan'],['TZ','Tanzania'],
  ['TH','Thailand'],['TL','Timor-Leste'],['TG','Togo'],['TO','Tonga'],['TT','Trinidad and Tobago'],['TN','Tunisia'],
  ['TR','Turkey'],['TM','Turkmenistan'],['TV','Tuvalu'],['UG','Uganda'],['UA','Ukraine'],['AE','United Arab Emirates'],
  ['GB','United Kingdom'],['US','United States'],['UY','Uruguay'],['UZ','Uzbekistan'],['VU','Vanuatu'],['VA','Vatican City'],
  ['VE','Venezuela'],['VN','Vietnam'],['YE','Yemen'],['ZM','Zambia'],['ZW','Zimbabwe'],['XK','Kosovo'],
];

const POLICY_OVERRIDES: Record<string, TorrentPolicy> = {
  DE: 'illegal', FR: 'illegal', IT: 'illegal', JP: 'illegal', GB: 'illegal', US: 'illegal',
  CH: 'illegal', AU: 'illegal', KR: 'illegal',
  CA: 'decriminalized', NL: 'decriminalized', ES: 'decriminalized', BR: 'decriminalized',
  IN: 'unclear', MX: 'unclear', ZA: 'unclear',
  SG: 'vpn_required', AE: 'vpn_required', SA: 'vpn_required',
};

export const TORRENT_LEGALITY_TABLE: CountryTorrentPolicy[] = BASE_ROWS.map(([iso2, name]) => ({
  iso2,
  name,
  policy: POLICY_OVERRIDES[iso2] || 'unclear',
}));

export function getCountryTorrentPolicy(iso2?: string | null): CountryTorrentPolicy | null {
  const code = String(iso2 || '').trim().toUpperCase();
  if (!code) return null;
  return TORRENT_LEGALITY_TABLE.find((x) => x.iso2 === code) || null;
}

export function isTorrentingPermitted(iso2?: string | null): boolean {
  const row = getCountryTorrentPolicy(iso2);
  if (!row) return true;
  return row.policy === 'legal' || row.policy === 'decriminalized' || row.policy === 'unclear';
}

