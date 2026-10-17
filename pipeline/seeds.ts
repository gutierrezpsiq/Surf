/**
 * Seed list of known surf spots in PR / SC / RS.
 * Only name + approximate coordinates (public knowledge); every physical property
 * (orientation, exposure, break type, hazards) is computed automatically in build-spots.ts.
 * Coordinates are approximate (±500 m) and are snapped to the coastline.
 */
import type { StateCode } from '../src/core/types';

export interface Seed { name: string; city: string; state: StateCode; lat: number; lon: number }

export const SEEDS: Seed[] = [
  // Paraná
  { name: 'Ilha do Mel – Praia de Fora', city: 'Paranaguá', state: 'PR', lat: -25.567, lon: -48.300 },
  { name: 'Praia de Leste', city: 'Pontal do Paraná', state: 'PR', lat: -25.700, lon: -48.465 },
  { name: 'Matinhos – Pico de Matinhos', city: 'Matinhos', state: 'PR', lat: -25.817, lon: -48.533 },
  { name: 'Caiobá', city: 'Matinhos', state: 'PR', lat: -25.848, lon: -48.538 },
  { name: 'Guaratuba – Praia Central', city: 'Guaratuba', state: 'PR', lat: -25.880, lon: -48.565 },
  // Santa Catarina – norte
  { name: 'Itapoá', city: 'Itapoá', state: 'SC', lat: -26.080, lon: -48.612 },
  { name: 'São Francisco do Sul – Prainha', city: 'São Francisco do Sul', state: 'SC', lat: -26.225, lon: -48.505 },
  { name: 'São Francisco do Sul – Ubatuba', city: 'São Francisco do Sul', state: 'SC', lat: -26.205, lon: -48.505 },
  { name: 'Barra Velha', city: 'Barra Velha', state: 'SC', lat: -26.630, lon: -48.680 },
  { name: 'Piçarras', city: 'Balneário Piçarras', state: 'SC', lat: -26.765, lon: -48.668 },
  { name: 'Itajaí – Praia Brava', city: 'Itajaí', state: 'SC', lat: -26.945, lon: -48.628 },
  { name: 'Balneário Camboriú – Praia Central', city: 'Balneário Camboriú', state: 'SC', lat: -26.990, lon: -48.630 },
  { name: 'Bombinhas – Quatro Ilhas', city: 'Bombinhas', state: 'SC', lat: -27.137, lon: -48.483 },
  { name: 'Bombinhas – Mariscal', city: 'Bombinhas', state: 'SC', lat: -27.128, lon: -48.520 },
  // Florianópolis
  { name: 'Praia Brava (Floripa)', city: 'Florianópolis', state: 'SC', lat: -27.398, lon: -48.413 },
  { name: 'Ingleses', city: 'Florianópolis', state: 'SC', lat: -27.435, lon: -48.390 },
  { name: 'Santinho', city: 'Florianópolis', state: 'SC', lat: -27.462, lon: -48.378 },
  { name: 'Moçambique', city: 'Florianópolis', state: 'SC', lat: -27.520, lon: -48.405 },
  { name: 'Barra da Lagoa', city: 'Florianópolis', state: 'SC', lat: -27.575, lon: -48.422 },
  { name: 'Praia Mole', city: 'Florianópolis', state: 'SC', lat: -27.603, lon: -48.433 },
  { name: 'Joaquina', city: 'Florianópolis', state: 'SC', lat: -27.630, lon: -48.448 },
  { name: 'Campeche', city: 'Florianópolis', state: 'SC', lat: -27.675, lon: -48.475 },
  { name: 'Morro das Pedras', city: 'Florianópolis', state: 'SC', lat: -27.715, lon: -48.505 },
  { name: 'Armação', city: 'Florianópolis', state: 'SC', lat: -27.745, lon: -48.505 },
  { name: 'Matadeiro', city: 'Florianópolis', state: 'SC', lat: -27.755, lon: -48.497 },
  { name: 'Lagoinha do Leste', city: 'Florianópolis', state: 'SC', lat: -27.775, lon: -48.485 },
  { name: 'Pântano do Sul', city: 'Florianópolis', state: 'SC', lat: -27.785, lon: -48.510 },
  // Santa Catarina – sul
  { name: 'Guarda do Embaú', city: 'Palhoça', state: 'SC', lat: -27.905, lon: -48.588 },
  { name: 'Silveira', city: 'Garopaba', state: 'SC', lat: -28.020, lon: -48.603 },
  { name: 'Garopaba – Praia Central', city: 'Garopaba', state: 'SC', lat: -28.027, lon: -48.618 },
  { name: 'Ferrugem', city: 'Garopaba', state: 'SC', lat: -28.075, lon: -48.625 },
  { name: 'Praia do Rosa', city: 'Imbituba', state: 'SC', lat: -28.128, lon: -48.640 },
  { name: 'Ibiraquera', city: 'Imbituba', state: 'SC', lat: -28.150, lon: -48.648 },
  { name: 'Imbituba – Praia da Vila', city: 'Imbituba', state: 'SC', lat: -28.230, lon: -48.655 },
  { name: 'Itapirubá', city: 'Imbituba', state: 'SC', lat: -28.330, lon: -48.700 },
  { name: 'Laguna – Molhes da Barra', city: 'Laguna', state: 'SC', lat: -28.498, lon: -48.752 },
  { name: 'Laguna – Mar Grosso', city: 'Laguna', state: 'SC', lat: -28.480, lon: -48.765 },
  { name: 'Farol de Santa Marta', city: 'Laguna', state: 'SC', lat: -28.603, lon: -48.812 },
  { name: 'Balneário Rincão', city: 'Içara', state: 'SC', lat: -28.830, lon: -49.225 },
  // Rio Grande do Sul
  { name: 'Torres – Molhes', city: 'Torres', state: 'RS', lat: -29.322, lon: -49.708 },
  { name: 'Torres – Prainha', city: 'Torres', state: 'RS', lat: -29.338, lon: -49.718 },
  { name: 'Torres – Guarita', city: 'Torres', state: 'RS', lat: -29.355, lon: -49.725 },
  { name: 'Capão da Canoa', city: 'Capão da Canoa', state: 'RS', lat: -29.750, lon: -50.000 },
  { name: 'Atlântida', city: 'Xangri-lá', state: 'RS', lat: -29.800, lon: -50.040 },
  { name: 'Imbé', city: 'Imbé', state: 'RS', lat: -29.970, lon: -50.110 },
  { name: 'Tramandaí – Plataforma', city: 'Tramandaí', state: 'RS', lat: -29.990, lon: -50.125 },
  { name: 'Cidreira – Plataforma', city: 'Cidreira', state: 'RS', lat: -30.180, lon: -50.200 },
  { name: 'Pinhal', city: 'Balneário Pinhal', state: 'RS', lat: -30.250, lon: -50.230 },
  { name: 'Mostardas – Praia Nova', city: 'Mostardas', state: 'RS', lat: -31.100, lon: -50.680 },
  { name: 'Cassino – Molhes', city: 'Rio Grande', state: 'RS', lat: -32.165, lon: -52.090 },
  { name: 'Cassino', city: 'Rio Grande', state: 'RS', lat: -32.200, lon: -52.160 },
  { name: 'Hermenegildo', city: 'Santa Vitória do Palmar', state: 'RS', lat: -33.660, lon: -53.260 },
  { name: 'Barra do Chuí', city: 'Chuí', state: 'RS', lat: -33.740, lon: -53.375 },
];
