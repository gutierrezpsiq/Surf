# Swell Sul

Previsão de surf pessoal e **automática** para o litoral do Paraná, Santa Catarina e Rio Grande do Sul.
PWA (React + Vite + TypeScript) que lê resultados pré-calculados por um pipeline agendado: abre rápido, funciona offline com a última previsão, e toda tela termina numa recomendação (**Vai / Talvez / Fica em casa**, qual pico, qual horário).

```
┌───────────── a cada 6 h (GitHub Actions) ─────────────┐
│ Open-Meteo Marine ─┐                                  │
│ Open-Meteo Forecast┤                                  │
│ NOAA WW3 (ERDDAP) ─┤→ calibração por boia → consenso   │→ JSON (Pages e/ou Supabase Storage) → PWA
│ Copernicus/Stormglass/Windy (opcional) ─┤  → nota 0–10 │
│ INMET / Marinha avisos ─┘                              │→ Web Push (nota ≥ 7, de dia, ≤ 72 h)
└────────────────────────────────────────────────────────┘
```

## Premissas e limitações dos dados (leia antes de confiar na nota)

**Resolução dos modelos costeiros.** Os modelos de onda são globais: ECMWF WAM 9 km, Météo‑France MFWAM ~9 km (0,083°), DWD GWAM ~28 km, NOAA GFS‑Wave 0,25° (~28 km), WW3/PacIOOS 0,5°. Eles **não** resolvem bancadas, refração fina, sombras de pontas pequenas nem baías abrigadas. A previsão é para mar aberto perto do pico (o Open‑Meteo escolhe a célula de mar mais próxima, `cell_selection=sea`). O app compensa parte disso com a exposição do pico (ver abaixo), mas enseadas como Garopaba centro, Balneário Camboriú ou Bombinhas continuam com erro maior.

**Variáveis diferem por modelo.** ECMWF WAM só dá mar total (altura, direção, período médio e de pico); partições de swell vêm de MFWAM, GWAM e GFS‑Wave. O “período dominante” usa período de pico quando existe, senão o do swell, senão o médio — não é a mesma grandeza em todos os modelos.

**Maré.** Usa `sea_level_height_msl` do modelo Météo‑France (inclui maré astronômica + efeito barométrico, ~8 km, “precisão limitada na costa” segundo a documentação). **Não** é a tábua oficial da DHN/CHM — a Marinha não publica API de tábuas. O litoral sul é de micromaré (< 1 m), então a maré só mexe ±3–8 % na nota.

**Dados dos picos são inferidos.** Nome e coordenada aproximada vêm de uma lista curada (53 picos) + `sport=surfing` do OSM; o resto é calculado: orientação pela geometria do litoral, janela de swell por *ray casting* contra a costa e ilhas, fundo/perigos por estruturas do OSM (molhes, plataformas, lajes) e pela forma do litoral. Tudo é marcado como **auto‑inferido** no app. Quando o Overpass/OSM não responde, usa‑se o litoral Natural Earth 10 m (resolução ~1 km): orientação marcada como **aproximada**. Pontos virtuais a cada ~8 km cobrem trechos sem nome.

**Calibração precisa de observações.** O ajuste de viés por região (multiplicativo em altura, aditivo em período, com decaimento de 30 dias e encolhimento quando há poucos pares) está implementado e testado, mas o PNBOIA e o SIMCosta não têm API pública documentada estável. Enquanto `OBS_FEEDS` não for configurado, os modelos têm peso igual e nenhuma correção.

**Avisos oficiais.** INMET via feed RSS/CAP (endpoint não documentado formalmente; falhas são registradas e ignoradas). Avisos de mau tempo da Marinha não têm feed legível por máquina — configure `MARINHA_AVISOS_URL` se houver um espelho CAP/RSS.

**Tempo de carro** = distância em linha reta × 1,35 a 75 km/h + 10 min (sem API de rotas). Erro típico ±15 %.

**Fuso.** America/Sao_Paulo é tratado como UTC−3 fixo (sem horário de verão desde 2019).

**Confiança ≠ nota.** A confiança vem da dispersão entre modelos (altura, período, direção, vento) e da antecedência; um modelo só → no máximo “média”. Ela qualifica a nota, nunca a altera.

## Nota 0–10 (`src/core/scoring.ts`)

```
altura na arrebentação = √Σ (Hᵢ · exposição(dirᵢ) · fator_período(Tᵢ))²   (swell 1, swell 2, mar de vento)
nota = 10 · tamanho^0.8 · (0.35 + 0.65·período) · (0.4 + 0.6·exposição) · vento · maré · energia  (+0.3 glassy)
```
- **Período** pesa forte a partir de 9 s (5 s → 0,1 · 9 s → 0,7 · 13 s → 1).
- **Vento** relativo à orientação: terral / terral‑lateral / lateral / maral‑lateral / maral, com velocidade e rajada.
- **Tamanho** relativo ao nível (iniciante 0,4–1,2 m · intermediário 0,8–2,0 m · avançado 1,5–3,5 m).
- **Travas de segurança** (alerta vermelho e teto na nota): raio (CAPE + chuva), rajadas ≥ 50 km/h, onda acima do nível, aviso oficial laranja/vermelho. Água < 14 °C gera aviso informativo.
- Linha de explicação: *“Swell SE 1,4 m @ 11 s, vento NO 10 km/h terral, maré enchendo, confiança alta”*.

## Telas
1. **Agora** — veredito grande, top 5 do dia com janela, confiança, tempo de carro (Porto Alegre ou GPS). Depois do anoitecer, passa para o dia seguinte.
2. **Semana** — mapa de calor picos × dias (melhor nota do dia).
3. **Mapa** — MapLibre com base própria offline (Natural Earth), limites e nomes dos municípios (IBGE), nomes dos picos ao aproximar e, em zoom regional, só o melhor pico de cada trecho; camadas de altura, período, temperatura da água, chuva, direção do swell e vento animado (partículas), com controle de tempo.
4. **Pico** — barra de nota por hora com melhor janela; **“Por que essa nota?”** com resumo do que ajuda/atrapalha e **“Mais detalhes”** explicando cada fator (previsão × ideal para surfar, em linguagem para iniciantes) e um glossário; toque numa hora para ver a explicação dela; ondas (consenso ± dispersão, setas de direção), vento colorido por terral/maral, maré com sombreamento noturno, rosa dos ventos (janela de swell × swell × vento), comparação por modelo, água + roupa, tempo, perigos.
5. **Comparar** — 2 a 4 picos lado a lado.
6. **Ajustes** — opcional: nível, origem, distância máxima, favoritos, notificações.

Cores: nota em rampa sequencial de um só tom (azul) com o número sempre escrito; veredito com cor de status + ícone + texto; modelos com paleta categórica em ordem fixa. Tema escuro segue o sistema.

## Rodando

```bash
npm ci
npm test                 # 36 testes: geometria, exposição, consenso, nota, calibração, parsers, alertas
npm run spots            # (re)gera public/data/spots.json (Overpass → fallback Natural Earth)
npm run pipeline         # busca todas as fontes e grava public/data/*.json
npm run dev              # app em http://localhost:5173
npm run demo-data        # SEM internet: roda o pipeline real contra um mock local (dados sintéticos, marcados como DEMO)
```

### Produção (100 % automático)
1. Ative GitHub Pages (Source: GitHub Actions). O workflow `.github/workflows/pipeline.yml` roda 4×/dia, publica app + dados e reconstrói a base de picos pelo OSM toda segunda.
2. *(Opcional)* Supabase: aplique `supabase/migrations/*.sql`, crie os secrets `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` e a variável `SUPABASE_ANON_KEY` → histórico, calibração, notificações e dados no Storage.
3. *(Opcional)* Notificações: `npx web-push generate-vapid-keys`, guarde `VAPID_PUBLIC_KEY` (variável) e `VAPID_PRIVATE_KEY` (secret).
4. *(Opcional)* Fontes extras: `COPERNICUSMARINE_SERVICE_*`, `STORMGLASS_API_KEY`, `WINDY_API_KEY`, `OBS_FEEDS`. Veja `.env.example`.

Se uma fonte cair, o pipeline segue com as outras e o app mostra quais foram usadas (Ajustes → Fontes). Se as principais (Open‑Meteo) caírem, a última previsão boa é mantida.

## Endpoints verificados
- Open‑Meteo: identificadores de modelos e variáveis conferidos no código‑fonte da documentação oficial (`open-meteo-website`, `docs/marine-weather-api/options.ts` e `docs/options.ts`): `ecmwf_wam`, `meteofrance_wave`, `meteofrance_currents`, `gwam`, `ncep_gfswave025`; `ecmwf_ifs025`, `ncep_gfs_seamless`, `dwd_icon_seamless`, `meteofrance_seamless`, `ukmo_seamless`.
- NOAA WW3: dataset `ww3_global` (PacIOOS ERDDAP), variáveis `Thgt`, `Tper`, `Tdir`.
- Copernicus: `cmems_mod_glo_wav_anfc_0.083deg_PT3H-i` (VHM0, VTPK, VMDR, partições SW1) e `cmems_mod_glo_phy-thetao_anfc_0.083deg_PT6H-i` via toolbox oficial.
- **Não verificados ao vivo** neste ambiente (rede bloqueada): respostas reais de todos os endpoints. Os parsers são testados com fixtures no formato documentado e o pipeline inteiro foi exercitado contra um mock com o mesmo formato.

## Estrutura
```
src/core/      lógica pura compartilhada (geo, litoral/exposição, consenso, nota, calibração, alertas)
src/pages/     telas · src/components/ · src/lib/ (dados, ajustes, push, cores) · src/sw.ts (offline + push)
pipeline/      run.ts (agendado), build-spots.ts, calibrate.ts, notify.ts, sources/*, copernicus.py
supabase/      schema (histórico, calibração, inscrições push) · data/coastline.json (Natural Earth recortado)
tests/         vitest
```
Dados de base: Natural Earth (domínio público), IBGE (malhas municipais), © colaboradores do OpenStreetMap (ODbL), Open‑Meteo (CC BY 4.0).
