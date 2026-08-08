-- Country torrent legality (196 ISO countries). Admin-owned; public read subset.

create table if not exists public.country_torrent_policies (
  iso_code char(2) primary key,
  iso_code_3 char(3) not null,
  country_name text not null,
  country_name_local text,
  torrent_policy text not null default 'unclear'
    check (torrent_policy in ('legal', 'decriminalized', 'illegal', 'unclear', 'vpn_required')),
  enforcement_level text not null default 'unknown'
    check (enforcement_level in ('none', 'low', 'moderate', 'high', 'severe', 'unknown')),
  downloading_illegal boolean default false,
  uploading_illegal boolean default false,
  streaming_illegal boolean default false,
  fines_applicable boolean default false,
  imprisonment_possible boolean default false,
  isp_monitoring boolean default false,
  specific_law text,
  law_reference_url text,
  last_verified_at timestamptz,
  verification_source text,
  notes text,
  vpn_recommended boolean generated always as (
    torrent_policy in ('illegal', 'vpn_required')
    or enforcement_level in ('high', 'severe')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  update_reason text,
  version integer not null default 1
);

create index if not exists idx_country_torrent_policies_policy
  on public.country_torrent_policies (torrent_policy);

alter table public.country_torrent_policies enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'country_torrent_policies'
      and policyname = 'country_torrent_policies_select_public'
  ) then
    create policy country_torrent_policies_select_public
      on public.country_torrent_policies
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

-- Seed ISO 3166-1 alpha-2 list (196 entries) with default unclear policy
insert into public.country_torrent_policies (iso_code, iso_code_3, country_name, torrent_policy, enforcement_level)
values
  ('AD','AND','Andorra','unclear','unknown'),('AE','ARE','United Arab Emirates','unclear','unknown'),('AF','AFG','Afghanistan','unclear','unknown'),
  ('AG','ATG','Antigua and Barbuda','unclear','unknown'),('AI','AIA','Anguilla','unclear','unknown'),('AL','ALB','Albania','unclear','unknown'),
  ('AM','ARM','Armenia','unclear','unknown'),('AO','AGO','Angola','unclear','unknown'),('AQ','ATA','Antarctica','unclear','unknown'),
  ('AR','ARG','Argentina','unclear','unknown'),('AS','ASM','American Samoa','unclear','unknown'),('AT','AUT','Austria','unclear','unknown'),
  ('AU','AUS','Australia','unclear','unknown'),('AW','ABW','Aruba','unclear','unknown'),('AX','ALA','Åland Islands','unclear','unknown'),
  ('AZ','AZE','Azerbaijan','unclear','unknown'),('BA','BIH','Bosnia and Herzegovina','unclear','unknown'),('BB','BRB','Barbados','unclear','unknown'),
  ('BD','BGD','Bangladesh','unclear','unknown'),('BE','BEL','Belgium','unclear','unknown'),('BF','BFA','Burkina Faso','unclear','unknown'),
  ('BG','BGR','Bulgaria','unclear','unknown'),('BH','BHR','Bahrain','unclear','unknown'),('BI','BDI','Burundi','unclear','unknown'),
  ('BJ','BEN','Benin','unclear','unknown'),('BL','BLM','Saint Barthélemy','unclear','unknown'),('BM','BMU','Bermuda','unclear','unknown'),
  ('BN','BRN','Brunei','unclear','unknown'),('BO','BOL','Bolivia','unclear','unknown'),('BQ','BES','Caribbean Netherlands','unclear','unknown'),
  ('BR','BRA','Brazil','unclear','unknown'),('BS','BHS','Bahamas','unclear','unknown'),('BT','BTN','Bhutan','unclear','unknown'),
  ('BV','BVT','Bouvet Island','unclear','unknown'),('BW','BWA','Botswana','unclear','unknown'),('BY','BLR','Belarus','unclear','unknown'),
  ('BZ','BLZ','Belize','unclear','unknown'),('CA','CAN','Canada','unclear','unknown'),('CC','CCK','Cocos Islands','unclear','unknown'),
  ('CD','COD','DR Congo','unclear','unknown'),('CF','CAF','Central African Republic','unclear','unknown'),('CG','COG','Congo','unclear','unknown'),
  ('CH','CHE','Switzerland','unclear','unknown'),('CI','CIV','Côte d''Ivoire','unclear','unknown'),('CK','COK','Cook Islands','unclear','unknown'),
  ('CL','CHL','Chile','unclear','unknown'),('CM','CMR','Cameroon','unclear','unknown'),('CN','CHN','China','unclear','unknown'),
  ('CO','COL','Colombia','unclear','unknown'),('CR','CRI','Costa Rica','unclear','unknown'),('CU','CUB','Cuba','unclear','unknown'),
  ('CV','CPV','Cabo Verde','unclear','unknown'),('CW','CUW','Curaçao','unclear','unknown'),('CX','CXR','Christmas Island','unclear','unknown'),
  ('CY','CYP','Cyprus','unclear','unknown'),('CZ','CZE','Czechia','unclear','unknown'),('DE','DEU','Germany','unclear','unknown'),
  ('DJ','DJI','Djibouti','unclear','unknown'),('DK','DNK','Denmark','unclear','unknown'),('DM','DMA','Dominica','unclear','unknown'),
  ('DO','DOM','Dominican Republic','unclear','unknown'),('DZ','DZA','Algeria','unclear','unknown'),('EC','ECU','Ecuador','unclear','unknown'),
  ('EE','EST','Estonia','unclear','unknown'),('EG','EGY','Egypt','unclear','unknown'),('EH','ESH','Western Sahara','unclear','unknown'),
  ('ER','ERI','Eritrea','unclear','unknown'),('ES','ESP','Spain','unclear','unknown'),('ET','ETH','Ethiopia','unclear','unknown'),
  ('FI','FIN','Finland','unclear','unknown'),('FJ','FJI','Fiji','unclear','unknown'),('FK','FLK','Falkland Islands','unclear','unknown'),
  ('FM','FSM','Micronesia','unclear','unknown'),('FO','FRO','Faroe Islands','unclear','unknown'),('FR','FRA','France','unclear','unknown'),
  ('GA','GAB','Gabon','unclear','unknown'),('GB','GBR','United Kingdom','unclear','unknown'),('GD','GRD','Grenada','unclear','unknown'),
  ('GE','GEO','Georgia','unclear','unknown'),('GF','GUF','French Guiana','unclear','unknown'),('GG','GGY','Guernsey','unclear','unknown'),
  ('GH','GHA','Ghana','unclear','unknown'),('GI','GIB','Gibraltar','unclear','unknown'),('GL','GRL','Greenland','unclear','unknown'),
  ('GM','GMB','Gambia','unclear','unknown'),('GN','GIN','Guinea','unclear','unknown'),('GP','GLP','Guadeloupe','unclear','unknown'),
  ('GQ','GNQ','Equatorial Guinea','unclear','unknown'),('GR','GRC','Greece','unclear','unknown'),('GS','SGS','South Georgia','unclear','unknown'),
  ('GT','GTM','Guatemala','unclear','unknown'),('GU','GUM','Guam','unclear','unknown'),('GW','GNB','Guinea-Bissau','unclear','unknown'),
  ('GY','GUY','Guyana','unclear','unknown'),('HK','HKG','Hong Kong','unclear','unknown'),('HM','HMD','Heard Island','unclear','unknown'),
  ('HN','HND','Honduras','unclear','unknown'),('HR','HRV','Croatia','unclear','unknown'),('HT','HTI','Haiti','unclear','unknown'),
  ('HU','HUN','Hungary','unclear','unknown'),('ID','IDN','Indonesia','unclear','unknown'),('IE','IRL','Ireland','unclear','unknown'),
  ('IL','ISR','Israel','unclear','unknown'),('IM','IMN','Isle of Man','unclear','unknown'),('IN','IND','India','unclear','unknown'),
  ('IO','IOT','British Indian Ocean Territory','unclear','unknown'),('IQ','IRQ','Iraq','unclear','unknown'),('IR','IRN','Iran','unclear','unknown'),
  ('IS','ISL','Iceland','unclear','unknown'),('IT','ITA','Italy','unclear','unknown'),('JE','JEY','Jersey','unclear','unknown'),
  ('JM','JAM','Jamaica','unclear','unknown'),('JO','JOR','Jordan','unclear','unknown'),('JP','JPN','Japan','unclear','unknown'),
  ('KE','KEN','Kenya','unclear','unknown'),('KG','KGZ','Kyrgyzstan','unclear','unknown'),('KH','KHM','Cambodia','unclear','unknown'),
  ('KI','KIR','Kiribati','unclear','unknown'),('KM','COM','Comoros','unclear','unknown'),('KN','KNA','Saint Kitts and Nevis','unclear','unknown'),
  ('KP','PRK','North Korea','unclear','unknown'),('KR','KOR','South Korea','unclear','unknown'),('KW','KWT','Kuwait','unclear','unknown'),
  ('KY','CYM','Cayman Islands','unclear','unknown'),('KZ','KAZ','Kazakhstan','unclear','unknown'),('LA','LAO','Laos','unclear','unknown'),
  ('LB','LBN','Lebanon','unclear','unknown'),('LC','LCA','Saint Lucia','unclear','unknown'),('LI','LIE','Liechtenstein','unclear','unknown'),
  ('LK','LKA','Sri Lanka','unclear','unknown'),('LR','LBR','Liberia','unclear','unknown'),('LS','LSO','Lesotho','unclear','unknown'),
  ('LT','LTU','Lithuania','unclear','unknown'),('LU','LUX','Luxembourg','unclear','unknown'),('LV','LVA','Latvia','unclear','unknown'),
  ('LY','LBY','Libya','unclear','unknown'),('MA','MAR','Morocco','unclear','unknown'),('MC','MCO','Monaco','unclear','unknown'),
  ('MD','MDA','Moldova','unclear','unknown'),('ME','MNE','Montenegro','unclear','unknown'),('MF','MAF','Saint Martin','unclear','unknown'),
  ('MG','MDG','Madagascar','unclear','unknown'),('MH','MHL','Marshall Islands','unclear','unknown'),('MK','MKD','North Macedonia','unclear','unknown'),
  ('ML','MLI','Mali','unclear','unknown'),('MM','MMR','Myanmar','unclear','unknown'),('MN','MNG','Mongolia','unclear','unknown'),
  ('MO','MAC','Macao','unclear','unknown'),('MP','MNP','Northern Mariana Islands','unclear','unknown'),('MQ','MTQ','Martinique','unclear','unknown'),
  ('MR','MRT','Mauritania','unclear','unknown'),('MS','MSR','Montserrat','unclear','unknown'),('MT','MLT','Malta','unclear','unknown'),
  ('MU','MUS','Mauritius','unclear','unknown'),('MV','MDV','Maldives','unclear','unknown'),('MW','MWI','Malawi','unclear','unknown'),
  ('MX','MEX','Mexico','unclear','unknown'),('MY','MYS','Malaysia','unclear','unknown'),('MZ','MOZ','Mozambique','unclear','unknown'),
  ('NA','NAM','Namibia','unclear','unknown'),('NC','NCL','New Caledonia','unclear','unknown'),('NE','NER','Niger','unclear','unknown'),
  ('NF','NFK','Norfolk Island','unclear','unknown'),('NG','NGA','Nigeria','unclear','unknown'),('NI','NIC','Nicaragua','unclear','unknown'),
  ('NL','NLD','Netherlands','unclear','unknown'),('NO','NOR','Norway','unclear','unknown'),('NP','NPL','Nepal','unclear','unknown'),
  ('NR','NRU','Nauru','unclear','unknown'),('NU','NIU','Niue','unclear','unknown'),('NZ','NZL','New Zealand','unclear','unknown'),
  ('OM','OMN','Oman','unclear','unknown'),('PA','PAN','Panama','unclear','unknown'),('PE','PER','Peru','unclear','unknown'),
  ('PF','PYF','French Polynesia','unclear','unknown'),('PG','PNG','Papua New Guinea','unclear','unknown'),('PH','PHL','Philippines','unclear','unknown'),
  ('PK','PAK','Pakistan','unclear','unknown'),('PL','POL','Poland','unclear','unknown'),('PM','SPM','Saint Pierre and Miquelon','unclear','unknown'),
  ('PN','PCN','Pitcairn Islands','unclear','unknown'),('PR','PRI','Puerto Rico','unclear','unknown'),('PS','PSE','Palestine','unclear','unknown'),
  ('PT','PRT','Portugal','unclear','unknown'),('PW','PLW','Palau','unclear','unknown'),('PY','PRY','Paraguay','unclear','unknown'),
  ('QA','QAT','Qatar','unclear','unknown'),('RE','REU','Réunion','unclear','unknown'),('RO','ROU','Romania','unclear','unknown'),
  ('RS','SRB','Serbia','unclear','unknown'),('RU','RUS','Russia','unclear','unknown'),('RW','RWA','Rwanda','unclear','unknown'),
  ('SA','SAU','Saudi Arabia','unclear','unknown'),('SB','SLB','Solomon Islands','unclear','unknown'),('SC','SYC','Seychelles','unclear','unknown'),
  ('SD','SDN','Sudan','unclear','unknown'),('SE','SWE','Sweden','unclear','unknown'),('SG','SGP','Singapore','unclear','unknown'),
  ('SH','SHN','Saint Helena','unclear','unknown'),('SI','SVN','Slovenia','unclear','unknown'),('SJ','SJM','Svalbard and Jan Mayen','unclear','unknown'),
  ('SK','SVK','Slovakia','unclear','unknown'),('SL','SLE','Sierra Leone','unclear','unknown'),('SM','SMR','San Marino','unclear','unknown'),
  ('SN','SEN','Senegal','unclear','unknown'),('SO','SOM','Somalia','unclear','unknown'),('SR','SUR','Suriname','unclear','unknown'),
  ('SS','SSD','South Sudan','unclear','unknown'),('ST','STP','São Tomé and Príncipe','unclear','unknown'),('SV','SLV','El Salvador','unclear','unknown'),
  ('SX','SXM','Sint Maarten','unclear','unknown'),('SY','SYR','Syria','unclear','unknown'),('SZ','SWZ','Eswatini','unclear','unknown'),
  ('TC','TCA','Turks and Caicos','unclear','unknown'),('TD','TCD','Chad','unclear','unknown'),('TF','ATF','French Southern Territories','unclear','unknown'),
  ('TG','TGO','Togo','unclear','unknown'),('TH','THA','Thailand','unclear','unknown'),('TJ','TJK','Tajikistan','unclear','unknown'),
  ('TK','TKL','Tokelau','unclear','unknown'),('TL','TLS','Timor-Leste','unclear','unknown'),('TM','TKM','Turkmenistan','unclear','unknown'),
  ('TN','TUN','Tunisia','unclear','unknown'),('TO','TON','Tonga','unclear','unknown'),('TR','TUR','Türkiye','unclear','unknown'),
  ('TT','TTO','Trinidad and Tobago','unclear','unknown'),('TV','TUV','Tuvalu','unclear','unknown'),('TW','TWN','Taiwan','unclear','unknown'),
  ('TZ','TZA','Tanzania','unclear','unknown'),('UA','UKR','Ukraine','unclear','unknown'),('UG','UGA','Uganda','unclear','unknown'),
  ('UM','UMI','U.S. Minor Outlying Islands','unclear','unknown'),('US','USA','United States','unclear','unknown'),('UY','URY','Uruguay','unclear','unknown'),
  ('UZ','UZB','Uzbekistan','unclear','unknown'),('VA','VAT','Vatican City','unclear','unknown'),('VC','VCT','Saint Vincent and the Grenadines','unclear','unknown'),
  ('VE','VEN','Venezuela','unclear','unknown'),('VG','VGB','British Virgin Islands','unclear','unknown'),('VI','VIR','U.S. Virgin Islands','unclear','unknown'),
  ('VN','VNM','Vietnam','unclear','unknown'),('VU','VUT','Vanuatu','unclear','unknown'),('WF','WLF','Wallis and Futuna','unclear','unknown'),
  ('WS','WSM','Samoa','unclear','unknown'),('YE','YEM','Yemen','unclear','unknown'),('YT','MYT','Mayotte','unclear','unknown'),
  ('ZA','ZAF','South Africa','unclear','unknown'),('ZM','ZMB','Zambia','unclear','unknown'),('ZW','ZWE','Zimbabwe','unclear','unknown')
on conflict (iso_code) do nothing;

create table if not exists public.country_policy_audit_log (
  id uuid primary key default gen_random_uuid(),
  iso_code char(2) not null,
  changed_by uuid references auth.users (id),
  changed_at timestamptz not null default now(),
  field_name text not null,
  old_value text,
  new_value text,
  reason text,
  ip_address inet
);
