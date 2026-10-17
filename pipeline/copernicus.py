"""
Copernicus Marine Service extraction (optional source).
Uses the official `copernicusmarine` toolbox (pip install copernicusmarine xarray) with
COPERNICUSMARINE_SERVICE_USERNAME / COPERNICUSMARINE_SERVICE_PASSWORD in env.

Datasets (Global Ocean Waves / Physics Analysis and Forecast, 1/12°):
  cmems_mod_glo_wav_anfc_0.083deg_PT3H-i : VHM0 (Hs), VTPK (peak period), VMDR (mean direction),
                                           VHM0_SW1, VTM01_SW1, VMDR_SW1 (primary swell)
  cmems_mod_glo_phy-thetao_anfc_0.083deg_PT6H-i : thetao (temperature; surface level = SST)

Writes out/copernicus.json in the shape pipeline/sources/optional.ts:loadCopernicus expects.
"""
import json, os, sys
from datetime import datetime, timedelta, timezone

try:
    import copernicusmarine as cm
    import numpy as np
except ImportError:
    print("[copernicus] toolbox not installed; skipping"); sys.exit(0)

if not os.environ.get("COPERNICUSMARINE_SERVICE_USERNAME"):
    print("[copernicus] credentials not set; skipping"); sys.exit(0)

spots = json.load(open(os.environ.get("SPOTS_FILE", "public/data/spots.json")))["spots"]
now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
end = now + timedelta(days=7)
box = dict(minimum_longitude=-54.5, maximum_longitude=-46.5, minimum_latitude=-34.5, maximum_latitude=-25.0)

wav = cm.open_dataset(dataset_id="cmems_mod_glo_wav_anfc_0.083deg_PT3H-i",
                      variables=["VHM0", "VTPK", "VMDR", "VHM0_SW1", "VTM01_SW1", "VMDR_SW1"],
                      start_datetime=now.isoformat(), end_datetime=end.isoformat(), **box)
try:
    phy = cm.open_dataset(dataset_id="cmems_mod_glo_phy-thetao_anfc_0.083deg_PT6H-i", variables=["thetao"],
                          minimum_depth=0, maximum_depth=1,
                          start_datetime=now.isoformat(), end_datetime=end.isoformat(), **box)
except Exception as e:  # SST is a bonus
    print("[copernicus] SST unavailable:", e); phy = None

def nearest_sea(ds, var, lat, lon):
    """Nearest grid cell with data (spots sit ~400 m offshore; coastal cells can be masked)."""
    for r in (0.0, 0.09, 0.18, 0.27):
        sub = ds[var].sel(latitude=slice(lat - r, lat + r), longitude=slice(lon - r, lon + r))
        if r == 0:
            sub = ds[var].sel(latitude=lat, longitude=lon, method="nearest")
            if not np.all(np.isnan(sub.values)):
                return sub
            continue
        m = sub.isel(time=0)
        if np.all(np.isnan(m.values)):
            continue
        idx = np.unravel_index(np.nanargmin(np.where(np.isnan(m.values), np.inf,
              (m.latitude.values[:, None] - lat) ** 2 + (m.longitude.values[None, :] - lon) ** 2)), m.shape)
        return sub.isel(latitude=idx[0], longitude=idx[1])
    return None

def local_times(da):
    return [(datetime.utcfromtimestamp(t.astype("datetime64[s]").astype(int)) - timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M") for t in da.time.values]

def clean(vals):
    return [None if (v is None or np.isnan(v)) else round(float(v), 2) for v in vals]

out = {}
for s in spots:
    hs = nearest_sea(wav, "VHM0", s["lat"], s["lon"])
    if hs is None:
        continue
    lat, lon = float(hs.latitude), float(hs.longitude)
    sel = lambda v: wav[v].sel(latitude=lat, longitude=lon).values
    rec = {"time": local_times(hs), "wave_height": clean(hs.values), "wave_peak_period": clean(sel("VTPK")),
           "wave_direction": clean(sel("VMDR")), "swell_wave_height": clean(sel("VHM0_SW1")),
           "swell_wave_period": clean(sel("VTM01_SW1")), "swell_wave_direction": clean(sel("VMDR_SW1"))}
    if phy is not None:
        t = nearest_sea(phy, "thetao", s["lat"], s["lon"])
        if t is not None:
            t = t.isel(depth=0) if "depth" in t.dims else t
            sst = dict(zip(local_times(t), clean(t.values)))
            rec["sea_surface_temperature"] = [sst.get(x) for x in rec["time"]]
    out[s["id"]] = rec

os.makedirs("out", exist_ok=True)
json.dump({"generatedAt": now.isoformat(), "spots": out}, open("out/copernicus.json", "w"))
print(f"[copernicus] {len(out)} spots")
