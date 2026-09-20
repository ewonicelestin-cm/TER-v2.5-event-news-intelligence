
## v2.5 — Event & News Intelligence Engine

- Calendrier d'événements macro et marché avec niveau d'importance.
- Analyse heuristique du sentiment des news et impact par symbole/classe d'actifs.
- Détection des divergences entre news à fort impact et régime macro.
- Endpoints : `/api/events`, `/api/news/intelligence`, `/api/news/intelligence/:symbol`.
- Flux de démonstration explicitement marqué comme synthétique ; un fournisseur de calendrier/news licencié peut remplacer l'ingestion.
- Aperçu visuel du dashboard : `public/ter-dashboard-v25-preview.png`.


## v2.3 — Historical Stress & Scenario Engine
- Scénarios déterministes par classe d'actifs.
- Crash actions/indices, choc de taux, crypto, Forex, matières premières, pic de volatilité et crise combinée.
- Mesure P&L, impact en pourcentage et positions touchées.
- Comparaison avec le pire mouvement quotidien observé dans les historiques disponibles.
- Estimation indicative du temps de récupération sous hypothèses explicites.
- Endpoint `GET /api/risk/stress`.


## TER v2.1 — Risk & Portfolio Intelligence

Le moteur de risque agrège les positions paper avec les prix du moteur temps réel pour calculer exposition brute/nette, concentration, volatilité, VaR journalière indicative, corrélations historiques, exposition par classe d'actifs et stress tests. Les métriques restent analytiques et ne constituent pas une garantie de perte maximale ou un conseil financier.

Endpoint : `GET /api/risk/portfolio`.
# TER — Terminal d'Exploration des Risques

TER est un prototype de plateforme de **market intelligence** multi-marchés.

## Ce que contient le prototype

- Scanner multi-actifs : actions, indices, forex, crypto, matières premières.
- Moteur de scoring basé sur de vrais indicateurs techniques (RSI, EMA20/50, MACD, Bollinger, ATR, détection de régime de marché) plutôt que sur des formules arbitraires.
- Historique OHLCV synthétique mais déterministe (`generateHistory`) pour exercer les indicateurs et le backtest en attendant un fournisseur licencié — remplaçable en un point unique via `MarketProvider` (`providerAdapters.ts`).
- Moteur de backtest avec frais, slippage, walk-forward (fenêtre expansive, sans fuite d'information) et simulation Monte Carlo par ré-échantillonnage des trades.
- Moteur de risque avec dimensionnement de position et kill switch à état (drawdown + pertes consécutives), à réarmement explicite uniquement.
- Mode paper trading (ouverture/fermeture de positions à partir des signaux, avec dimensionnement et kill switch réels) pour valider le moteur sans exécution réelle.
- Fournisseurs de données réels branchés, gratuits et sans clé : Binance (crypto, vraies bougies OHLC), CoinGecko (crypto, repli), Frankfurter/BCE (forex, taux de référence) — avec repli automatique sur les données synthétiques en cas d'échec. Voir « Fournisseurs de données » ci-dessous pour le détail par classe d'actifs, y compris ceux volontairement exclus.
- Journal d'audit persisté en base (Postgres, optionnel — repli en mémoire si non configuré).
- Profils de stratégies publiques avec statistiques historiques.
- Couche d'orchestration destinée à connecter plusieurs modèles IA.
- Dashboard React + TypeScript + Vite.
- Architecture prête à remplacer les données de démonstration par des fournisseurs licenciés.
- Aucun ordre réel n'est envoyé.

## Fournisseurs de données réels — gratuits, sans clé, sans souci de licence

Recherche effectuée en septembre 2026. Tous les fournisseurs listés dans « Branchés » sont vérifiés gratuits, sans clé API et sans restriction de conditions d'utilisation pour cet usage. Repli automatique sur les données synthétiques en cas d'échec réseau, de limite de débit ou de symbole non supporté — voir `getHistoryPreferLive` dans `marketData.ts`.

### Branchés

| Fournisseur | Classe d'actifs | Ce qu'il fournit | Limite |
|---|---|---|---|
| [Binance](https://developers.binance.com/docs/binance-spot-api-docs/faqs/market_data_only) (`data-api.binance.vision`) | Crypto | Vraies bougies OHLCV, aucune authentification requise (endpoints publics documentés comme tels par Binance) | Paires cotées en USDT (BTCUSDT, ETHUSDT...), pas toutes les cryptos |
| [CoinGecko](https://www.coingecko.com/en/api/documentation) | Crypto (repli) | Prix de clôture + volume, pas de vraies bougies OHLC sur le plan gratuit | ~10-30 requêtes/min |
| [Frankfurter](https://frankfurter.dev/) | Forex | Taux de référence quotidiens de la BCE (84 banques centrales), open-source, aucune limite de requêtes documentée | Un seul taux par jour ouvré (pas d'intra-journalier), pas de weekend/jours fériés BCE |

### Volontairement exclus

| Fournisseur | Pourquoi il n'a pas été intégré |
|---|---|
| Yahoo Finance (endpoints non officiels, utilisés par `yfinance`) | Gratuit et sans clé, mais les conditions d'utilisation de Yahoo interdisent explicitement l'accès automatisé sans autorisation écrite. Contourner un CGU explicite n'est pas quelque chose que ce projet automatise, même si le risque d'exécution reste faible en usage personnel. |
| Stooq | Documenté comme « sans clé » par de nombreuses sources plus anciennes, mais l'accès CSV nécessite désormais une clé API gratuite obtenue par captcha (changement constaté en 2026) — ne correspond plus au critère « sans clé ». |

### Non couvert (actions, indices, matières premières, taux)

Aucun fournisseur simultanément gratuit, sans clé et sans problème de conditions d'utilisation n'a été trouvé pour ces classes d'actifs au moment de la rédaction. Ces symboles continuent d'utiliser l'historique synthétique déterministe (`generateHistory`). Si le budget le permet, Alpha Vantage ou Twelve Data (gratuits avec clé) sont les candidats naturels — l'interface `MarketProvider` dans `providerAdapters.ts` est déjà prête à les recevoir.

## Ce qui reste simulé (à ne pas confondre avec des résultats réels)

- Sans `TWELVEDATA_API_KEY`, les actions, indices et matières premières conservent le repli OHLCV synthétique ; avec cette clé côté serveur, TER peut utiliser l'adaptateur Twelve Data pour les cotations disponibles.
- La stratégie utilisée pour peupler le backtest de démonstration (croisement EMA20/EMA50) est un exemple pédagogique, pas la logique d'exécution finale.
- Les profils de traders sociaux (`socialIntelligence.ts`) sont des exemples statiques, pas des données extraites de plateformes réelles.

## Moteur adaptatif TER v1.2

Le moteur technique ne traite plus RSI, Stochastique, CCI et Bollinger avec une règle universelle. `getMarketProfile()` sélectionne des paramètres selon la classe d'actif et le timeframe, puis `detectRegime()` combine ATR normalisé, ADX et structure EMA pour classer le marché en `TREND_UP`, `TREND_DOWN`, `RANGE` ou `HIGH_VOL`.

La pondération du signal change selon le régime : oscillateurs de retournement en range, tendance et momentum en tendance, et poids réduit des retournements en forte volatilité. Le dashboard expose RSI, Stochastique, CCI, ADX, ATR%, seuils RSI et mode d'analyse pour chaque actif.

Ces règles sont déterministes et doivent être validées par backtests hors-échantillon avant toute utilisation avec de l'argent réel.

## Données traditionnelles optionnelles

Pour activer un fournisseur externe côté serveur sans exposer sa clé au navigateur, définir `TWELVEDATA_API_KEY` dans `server/.env`. Sans cette variable, TER conserve son repli synthétique pour les classes non couvertes par les fournisseurs publics déjà branchés.

## Installation

```bash
npm install
npm run dev
```

Puis ouvrir `http://localhost:5173`.

Pour un accès depuis un autre appareil du réseau :

```bash
npm run dev -- --host 0.0.0.0
```

### API + persistance (optionnel)

```bash
cd server && npm install && npm run dev
```

Sans configuration, l'API tourne avec un journal d'audit en mémoire (perdu au redémarrage). Pour activer la persistance réelle (audit, résultats de backtest, trades paper trading) :

```bash
docker compose up -d postgres
# puis dans server/.env :
DATABASE_URL=postgres://ter:ter_dev_password@localhost:5432/ter
```

Les tables sont définies dans `database/schema.sql` (à appliquer avec `psql` ou une migration au premier démarrage).

## Architecture cible production

```text
TER
├── Frontend React
├── API Gateway
├── Market Data Adapters
│   ├── equities
│   ├── forex
│   ├── crypto
│   ├── indices
│   └── commodities
├── Signal Engine
│   ├── trend
│   ├── momentum
│   ├── volatility
│   ├── volume
│   ├── market structure
│   └── regime detection
├── Social Intelligence
│   ├── source verification
│   ├── strategy extraction
│   ├── performance attribution
│   └── manipulation / bot filters
├── AI Orchestrator
│   ├── financial NLP
│   ├── quantitative models
│   ├── research agents
│   └── ensemble voting
├── Backtesting
│   ├── walk-forward
│   ├── transaction costs
│   ├── slippage
│   └── Monte Carlo
├── Risk Engine
│   ├── position sizing
│   ├── max drawdown
│   ├── exposure
│   └── kill switch
└── Audit / Compliance
```

## Métriques à utiliser

Ne pas optimiser uniquement le taux de réussite. TER doit publier au minimum :

- rendement annualisé
- Sharpe
- Sortino
- maximum drawdown
- Calmar
- profit factor
- expectancy par trade
- hit rate
- turnover
- slippage
- frais
- stabilité par régime de marché
- performance hors-échantillon

## Important

Aucune IA ne peut garantir une rentabilité certaine. Le produit doit parler en **probabilités, scénarios et niveaux de risque**, et non promettre des gains.

Pour les données de marché et les réseaux sociaux, utiliser uniquement des sources autorisées et respecter leurs licences, conditions d'utilisation et règles de confidentialité.

## Check-up — problèmes trouvés et corrigés (septembre 2026)

Passage en revue complet du code après les évolutions successives. Corrigés :

1. **`profitFactor`/`calmar` à `Infinity` cassaient l'API** — `JSON.stringify` transforme silencieusement `Infinity` en `null`, ce qui aurait fait planter tout code côté client testant ces valeurs. `BacktestReport` renvoie maintenant `null` explicitement (typé `number | null`) au lieu de `Infinity`.
2. **Score social incohérent avec sa propre documentation** — `signalEngine.ts` prétendait pondérer par des « stratégies vérifiées » mais incluait aussi les traders non vérifiés dans le calcul. Filtré sur `verified: true` désormais, `sourceCount` aussi.
3. **`pg.Pool` sans gestionnaire d'erreur** — une coupure réseau sur un client Postgres inactif aurait fait planter tout le process Node (événement `'error'` non géré). Listener ajouté.
4. **`pg` absent du `package.json` racine** — le script racine `npm run api`/`npm run dev:full` exécute `server/index.ts` avec les dépendances de la racine, pas celles de `server/`. Sans ce correctif, ce script échouait avec « Cannot find module 'pg' ».
5. **`.env.example` incomplet** — ne mentionnait pas `DATABASE_URL`/`REDIS_URL`/`CORS_ORIGIN`, contrairement à `.env.production.example`. Aligné.
6. **Aucun timeout réseau** — les appels à Binance/CoinGecko/Frankfurter pouvaient bloquer une réponse indéfiniment en cas d'upstream lent. Timeout de 8s ajouté sur tous les appels (`fetchWithTimeout`).
7. **Redis provisionné mais jamais utilisé** — `docker-compose.yml` déclare un service Redis inexploité, alors que les appels aux fournisseurs live n'étaient pas mis en cache (risque réel de dépasser la limite CoinGecko en quelques requêtes). Cache TTL ajouté (`server/cache.ts`, en mémoire par défaut, remplaçable par Redis en un point unique) sur `/api/history/:symbol`.
8. **`socialScoring.ts` totalement orphelin** — la fonction `scorePublicStrategy` n'était appelée nulle part, alors qu'elle correspond exactement à l'« attribution des résultats » citée dans la roadmap. Branchée pour un trader de démonstration (`@quant_edge`) à partir d'un journal d'observations brutes, pour prouver le chemin d'intégration réel.
9. **CORS grand ouvert** — `cors()` sans configuration acceptait n'importe quelle origine. Configurable via `CORS_ORIGIN`, toujours ouvert par défaut en dev.
10. **`crypto.randomUUID()` sans import explicite** — reposait sur une variable globale Node 19+ non garantie. Import explicite `node:crypto` ajouté, avec `@types/node` désormais déclaré dans les deux `package.json` (absent auparavant malgré l'usage de `process.env`).
11. **Dépendance morte** — `recharts` restait dans `package.json` alors qu'aucun graphique ne l'utilise plus depuis le remplacement du panneau « Performance engine ». Retirée.

### Limites connues, non corrigées (choix délibéré)

- Les positions paper trading ouvertes vivent en mémoire uniquement (perdues au redémarrage du serveur) — seuls les trades fermés sont persistés dans `paper_trades`. Corriger nécessite une vraie table `paper_positions` et une décision produit sur le comportement au redémarrage (fermer au marché ? restaurer tel quel ?).
- Le compte paper trading est unique et partagé (pas de multi-compte) — dépend de la couche d'authentification de la Phase 5, pas encore construite.
- Aucun test automatisé (unitaire ou d'intégration) n'existe dans le projet. Le check-up ci-dessus s'appuie sur du type-checking TypeScript isolé, pas sur une suite de tests exécutable.

## Paper trading — UI branchée

Le panneau **Paper Trading** du dashboard (`App.tsx`) parle directement à l'API (`src/services/apiClient.ts` → `/api/paper/*`) :

- Solde du compte (capital initial, liquidités, positions ouvertes, trades clôturés).
- Bouton « Ouvrir en paper trading » dans le détail de chaque signal LONG/SHORT.
- Bouton « Fermer » sur chaque position ouverte.
- Statut du kill switch en temps réel, avec bouton de réarmement explicite quand il est déclenché.

Si l'API n'est pas démarrée, le panneau l'indique clairement (« API injoignable ») au lieu d'échouer silencieusement — `npm run dev` seul (sans l'API) reste utilisable, le reste du dashboard fonctionne toujours en local. Pour l'activer :

```bash
cd server && npm install && npm run dev
```

L'URL de l'API est configurable côté client via `VITE_API_BASE_URL` (défaut : `http://localhost:8787`).

## v1.3 — Validation par régime

TER inclut maintenant une couche de validation historique qui sépare les résultats selon quatre régimes détectés à l'entrée : `TREND_UP`, `TREND_DOWN`, `RANGE` et `HIGH_VOL`.

La stratégie adaptative applique des règles différentes selon le régime : suivi de tendance quand la tendance et le MACD sont alignés, retour à la moyenne dans les ranges avec RSI/Bollinger, et taille réduite en forte volatilité. Le rapport expose séparément le nombre de barres, le nombre de trades, le win rate, l'expectancy, le drawdown et le Sharpe pour chaque régime.

Endpoint serveur : `GET /api/backtest/:symbol/regimes`.

> Les données synthétiques restent explicitement marquées comme telles. Les résultats historiques et les signaux de TER ne constituent pas une garantie de performance future.


## TER v1.5
Le moteur distingue explicitement les données `live` des données `synthetic`. Twelve Data peut fournir les classes traditionnelles lorsque `TWELVEDATA_API_KEY` est configurée côté serveur. Diagnostic : `GET /api/providers`.


## v1.6 — Data Quality & Freshness
- Cache TTL par endpoint.
- Normalisation OHLCV (tri, timestamps ISO, doublons et valeurs invalides).
- Détection des trous de données et de la fraîcheur.
- Timeframes crypto intraday via Binance (`1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`).
- Endpoint `/api/data-quality/:symbol` et `/api/cache`.
- Provenance LIVE/SYNTHETIC conservée dans les réponses.

### v1.7 — Real-Time Market Engine
TER centralise maintenant les cotations dans un moteur de données partagé. Le moteur rafraîchit les quotes toutes les 60 secondes côté serveur, applique un cache, conserve la provenance de chaque snapshot et expose `/api/engine/status`. Les snapshots distinguent données live et synthétiques et fournissent un contrôle FRESH/STALE/INVALID ainsi que la latence fournisseur → réception. Le frontend rafraîchit également son univers toutes les 60 secondes. Pour éviter les limites des fournisseurs gratuits, le moteur reste en polling et prépare une future couche SSE/WebSocket sans imposer de connexion temps réel permanente.

### v1.8 — Signal Intelligence
The signal layer now adds multi-timeframe confirmation, RSI divergence detection, support/resistance and breakout context, plus a confluence score and traceability metadata. `/api/signals` includes `intelligence`; `/api/signals/:symbol/intelligence` exposes the detailed evidence for one symbol. These outputs are analytical scenarios, not guaranteed outcomes.

## v1.9 — AI Decision & Ensemble Engine
- Fusion de plusieurs analystes spécialisés locaux : technique, régime, structure, divergence et qualité des données.
- Probabilités séparées haussier / neutre / baissier et incertitude explicite.
- Mesure d'accord entre experts et scénarios primaire/alternatif/invalidation.
- Traçabilité vers la confluence v1.8 et la qualité des données v1.7.
- Endpoint `GET /api/ai/ensemble/:symbol`.
- Aucun appel à un modèle externe n'est requis : les connecteurs IA externes peuvent être ajoutés ultérieurement avec leurs propres clés et conditions d'utilisation.

## v2.0 — Calibration probabiliste & journal
- Journal en mémoire des scénarios IA.
- Résolution des observations après horizon hors-échantillon.
- Classification réalisée : haussier / neutre / baissier avec bande neutre configurable dans le moteur.
- Brier score, log loss, exactitude et calibration par bins.
- Endpoints `/api/ai/calibration/:symbol` et `/api/ai/journal`.
- Les statistiques sont explicitement signalées comme insuffisantes tant que l'échantillon résolu est court.

## v2.0 — Calibration probabiliste
TER ne présente plus seulement des probabilités heuristiques : il journalise les scénarios, attend leur horizon hors-échantillon, puis calcule Brier score, log loss, exactitude et fiabilité par classes de confiance. Tant que le volume résolu est faible, l'interface l'indique explicitement.

## v2.2 — Portfolio Optimizer & Stress Engine
- Allocation théorique: égalitaire, inverse-volatilité et risk-parity approximatif.
- Plafond indicatif de 25% par position et 40% par classe d'actifs.
- Comparaison poids actuel / cible et estimation de volatilité cible.
- Endpoint `GET /api/risk/optimize?method=RISK_PARITY_APPROX`.
- Aucune exécution automatique: résultats destinés à l'analyse et au paper trading.

## v2.4 — Market Regime & Macro Factor Engine
- Détection descriptive de régimes : RISK_ON, RISK_OFF, INFLATION_PRESSURE, DEFLATION_PRESSURE, MIXED.
- Facteurs : momentum actions/indices/crypto, force USD, pression matières premières, pression taux et volatilité.
- Heatmap par classe d'actifs et rotation relative.
- Endpoint : `/api/macro/regime`.
- Les résultats sont analytiques et ne constituent pas des prévisions.

## v2.6 — NLP & Multi-page Intelligence
- Navigation complète par rubriques via routes hash.
- Pages Marchés, Signaux IA, Analyse, Portefeuille, Risk, Optimiseur, Stress, Macro, Événements, News & NLP, Journal, AI Lab, Backtesting, Social Intelligence, Données et Paramètres.
- NLP hybride : normalisation, déduplication, entités, thèmes, nouveauté, urgence et attribution d'impact.
- Endpoints `/api/news/nlp` et `/api/news/nlp/:symbol`.
- Les scores NLP restent heuristiques et les données news/événements de démo sont explicitement synthétiques.

## v2.7 — Fundamental Intelligence
TER ajoute une page dédiée aux fondamentaux et une API descriptive. Les données de démonstration sont explicitement synthétiques et ne doivent pas être utilisées comme données financières actuelles.

### TER v2.9 — Unified Asset Intelligence
La plateforme dispose désormais d'une fiche d'intelligence transversale par actif. Elle agrège les données de marché, la qualité/fraîcheur, les indicateurs techniques, les fondamentaux de démonstration, le régime macro, les événements, le NLP news et l'ensemble IA. Les données synthétiques restent explicitement signalées.

## v3.3 — Workflow & Scenario Builder
- Orchestration configurable et dry-run
- API CRUD workflows + historique
- Audit des exécutions
- Aucun ordre réel

## v3.5 — Observability & Reliability
Le noyau expose `/api/system/health`, `/api/system/metrics` et `/api/system/logs`. Des migrations SQL versionnées et des smoke tests (`npm test`) accompagnent désormais le cœur de production. `src/services/resilience.ts` fournit retry/backoff et circuit breaker pour les fournisseurs.
