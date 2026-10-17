import type { CalibRegion, StateCode } from './types';

/** Coarse calibration regions (latitude bands), each tied to its nearest observation platforms. */
export function regionFor(lat: number): { state: StateCode; region: CalibRegion } {
  if (lat > -25.98) return { state: 'PR', region: 'PR' };
  if (lat > -27.3) return { state: 'SC', region: 'SC-N' };
  if (lat > -27.85) return { state: 'SC', region: 'SC-ILHA' };
  if (lat > -29.32) return { state: 'SC', region: 'SC-S' };
  if (lat > -31.0) return { state: 'RS', region: 'RS-N' };
  return { state: 'RS', region: 'RS-S' };
}

export const REGION_LABEL: Record<CalibRegion, string> = {
  PR: 'Paraná',
  'SC-N': 'SC Norte',
  'SC-ILHA': 'Florianópolis',
  'SC-S': 'SC Sul',
  'RS-N': 'RS Litoral Norte',
  'RS-S': 'RS Litoral Sul',
};
