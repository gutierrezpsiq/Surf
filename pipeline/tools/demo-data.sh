#!/bin/sh
# Generate clearly-labelled DEMO data (synthetic) by running the real pipeline against the mock API.
node --import tsx pipeline/tools/mock-open-meteo.ts >/dev/null 2>&1 &
MOCK=$!
trap 'kill $MOCK 2>/dev/null' EXIT INT TERM
sleep 1.5
DEMO=1 OPEN_METEO_MARINE_URL=http://localhost:8787/v1/marine OPEN_METEO_FORECAST_URL=http://localhost:8787/v1/forecast \
  WW3_ERDDAP_URL=http://localhost:8787/none INMET_RSS_URL=http://localhost:8787/none node --import tsx pipeline/run.ts
