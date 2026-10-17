/** Display names and fixed categorical order (colour slot = index) for model series. */
export const WAVE_MODEL_ORDER = ['ecmwf_wam', 'meteofrance_wave', 'gwam', 'ncep_gfswave025', 'ww3', 'copernicus', 'stormglass', 'windy'];
export const WIND_MODEL_ORDER = ['ecmwf_ifs025', 'ncep_gfs_seamless', 'dwd_icon_seamless', 'meteofrance_seamless', 'ukmo_seamless'];

export const MODEL_LABEL: Record<string, string> = {
  ecmwf_wam: 'ECMWF WAM',
  meteofrance_wave: 'Météo-France MFWAM',
  gwam: 'DWD GWAM',
  ncep_gfswave025: 'NOAA GFS-Wave (WW3)',
  ww3: 'NOAA WW3 ERDDAP',
  copernicus: 'Copernicus',
  stormglass: 'Stormglass',
  windy: 'Windy',
  ecmwf_ifs025: 'ECMWF IFS',
  ncep_gfs_seamless: 'NOAA GFS',
  dwd_icon_seamless: 'DWD ICON',
  meteofrance_seamless: 'Météo-France ARPEGE',
  ukmo_seamless: 'UK Met Office',
};
