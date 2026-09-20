## v2.9 — Advanced Research & Explainability
- Research Terminal multi-section.
- Price-history visualization from available OHLCV.
- Factor attribution and unified timeline.
- IA scenario/probability/uncertainty view.
- Quick comparison of the tracked universe.
- Exportable text research report.
- Explicit data-quality and methodology limitations.

## v2.5 — Event & News Intelligence Engine
- [x] Calendrier d'événements synthétiques avec catégories, zones et niveaux d'importance
- [x] Sentiment news heuristique et score d'impact
- [x] Impact par symbole et classe d'actifs
- [x] Détection des divergences news/régime macro
- [x] Endpoints `/api/events` et `/api/news/intelligence`
- [ ] Connecteur de calendrier/news licencié
- [ ] NLP entraîné sur corpus dédié

# TER Roadmap

## v2.3 — Historical Stress & Scenario Engine
- Scénarios de crise par classe d'actifs
- P&L stressé et pire scénario
- Pire mouvement historique disponible
- Estimation indicative de récupération

# v2.1 — Risk & Portfolio Intelligence
- Exposition brute et nette
- Concentration par position
- Exposition par classe d'actifs
- Corrélations historiques
- Volatilité et VaR 95% journalière indicative
- Stress tests simples
- Alertes de concentration/corrélation
- Endpoint `/api/risk/portfolio`

# TER — feuille de route

## Phase 1 — Data
- [ ] Sélectionner un fournisseur licencié pour chaque classe d'actifs (Twelve Data est maintenant un adaptateur optionnel côté serveur).
- [ ] Normaliser symboles, fuseaux, calendriers et devises.
- [ ] Ajouter WebSocket pour les flux temps réel.
- [x] Stocker OHLCV — modèle `OHLCVBar` + générateur d'historique déterministe en attendant un fournisseur réel (`marketData.ts`), adapteur `MarketProvider` prêt à brancher (`providerAdapters.ts`). Fournisseurs réels branchés et vérifiés gratuits/sans clé/sans souci de licence : Binance (crypto, vraies bougies OHLC) + CoinGecko (repli crypto), Frankfurter/BCE (forex). Actions, indices et matières premières restent synthétiques — aucun fournisseur trouvé qui soit à la fois gratuit, sans clé et conforme à ses propres CGU pour ces classes (détail dans le README). Repli automatique sur les données synthétiques en cas d'échec via `getHistoryPreferLive`.
- [ ] Événements macro.

## Phase 2 — Intelligence
- [x] Détection adaptative — profils par classe d'actif/timeframe, RSI/Stochastique/CCI/Williams %R, EMA20/50, MACD, Bollinger, ATR, ADX et classification de régime, consommés par `signalEngine.ts`.
- [ ] NLP des news et publications publiques.
- [ ] Attribution des résultats à chaque stratégie observée (le scoring existe dans `socialScoring.ts`, l'ingestion réelle reste à faire).
- [ ] Détection des bots, doublons, suppressions et biais de sélection.

## Phase 3 — Validation
- [x] Walk-forward (fenêtre expansive, `walkForwardFolds` / `runWalkForward` dans `backtest.ts`) — chaque fold s'entraîne uniquement sur des données antérieures à sa fenêtre de test, donc pas de fuite d'information.
- [x] Frais et slippage modélisés par trade (`CostModel`, `netPnl`).
- [x] Monte Carlo par ré-échantillonnage des trades (`monteCarloSimulation`).
- [x] Métriques étendues : Sharpe, Sortino, Calmar, rendement annualisé, turnover, coûts (`BacktestReport`).
- [ ] Rapport de robustesse par régime de marché (le régime est détecté par `detectRegime`, mais pas encore croisé avec les résultats de backtest).

## Phase 4 — IA
- [ ] Modèle sentiment.
- [ ] Modèle quantitatif.
- [ ] Agent de recherche.
- [ ] Agent macro.
- [ ] Agent risk.
- [ ] Voting/ensemble avec calibration de confiance.

## Phase 5 — Produit
- [ ] Comptes utilisateurs.
- [ ] Watchlists.
- [ ] Alertes email/mobile.
- [x] Paper trading — `paperTrading.ts` (ouverture/fermeture de positions à partir des signaux, dimensionnement via le risk engine, kill switch appliqué) + endpoints `/api/paper/*`. Positions ouvertes en mémoire, trades fermés persistés dans `paper_trades`. **UI branchée** (`App.tsx` + `apiClient.ts`) : solde du compte, ouverture/fermeture de position, statut et réarmement du kill switch, avec dégradation propre si l'API n'est pas démarrée.
- [ ] API publique.
- [ ] Abonnements.

## Phase 6 — Conformité
- [ ] Juridiction cible.
- [ ] Analyse du statut de conseil / signal.
- [x] Journal d'audit — table `audit_events` alimentée réellement depuis le serveur (`server/db.ts` + `recordAudit`), avec repli en mémoire si `DATABASE_URL` n'est pas défini ; tables `backtest_results`, `kill_switch_events` et `paper_trades` ajoutées.
- [ ] Transparence des performances (page publique dédiée).
- [ ] Politique conflits d'intérêts.
- [ ] Protection des données.

## Risk engine — ajouté depuis la v1.0
- [x] Kill switch avec état (drawdown depuis le pic + pertes consécutives), à réinitialisation explicite uniquement (`riskEngine.ts`).
- [x] Stop dynamique basé sur l'ATR plutôt qu'un pourcentage de risque fixe (`signalEngine.ts`).

## Règle fondamentale

TER ne doit jamais afficher « rentabilité certaine ». Il doit afficher :
**probabilité + scénario + invalidation + risque + historique de validation**.

## TER v1.3 — Validation par régime
- [x] Stratégie adaptative distincte pour tendance haussière, tendance baissière, range et forte volatilité.
- [x] Rapport de backtest séparé par régime.
- [x] Endpoint API `/api/backtest/:symbol/regimes`.
- [x] Affichage des trades, win rate, expectancy, drawdown et Sharpe par régime.
- [ ] Comparaison walk-forward adaptative vs baseline sur les mêmes fenêtres.
- [ ] Tests de sensibilité des paramètres et analyse de robustesse hors échantillon.


### v1.6
- [x] Cache TTL et statistiques
- [x] Normalisation OHLCV
- [x] Contrôle fraîcheur / stale data
- [x] Détection des gaps et bougies invalides
- [x] Intraday crypto multi-timeframe

## v1.5 — Multi-market data
- [x] Provider status endpoint
- [x] Live/synthetic provenance
- [x] Twelve Data cross-asset history when configured
- [x] Live-aware backtest
- [ ] Persistent raw market-data store
- [ ] Intraday/WebSocket ingestion
- [ ] Provider reconciliation and stale-data detection

## v1.7 — Real-Time Market Engine
- Moteur centralisé de rafraîchissement des cotations.
- Polling serveur 60 s avec cache anti-rate-limit.
- Provenance par snapshot : provider, timestamp fournisseur, timestamp réception, latence.
- États FRESH / STALE / INVALID / SYNTHETIC sur les cotations.
- Endpoint `/api/engine/status`.
- Dashboard avec état de santé du flux et dernière mise à jour.
- Les signaux consomment désormais le même snapshot marché que l'interface.

## v1.8 — Signal Intelligence Engine
- Multi-timeframe confirmation for crypto (1D / 4h / 1h) and daily confirmation for other supported asset classes.
- RSI divergence detection.
- Recent support/resistance and breakout context.
- Confluence score and LOW/MEDIUM/HIGH level.
- Full signal trace: data timeframes + indicator set + generation timestamp.
- `/api/signals/:symbol/intelligence` for detailed signal evidence.
- Existing `/api/signals` now returns the intelligence object alongside the base signal.

## v1.9 — AI Decision & Ensemble Engine
- [x] Ensemble local multi-experts
- [x] Probabilités et incertitude explicites
- [x] Accord/désaccord des experts
- [x] Scénarios conditionnels et invalidation
- [x] Endpoint `/api/ai/ensemble/:symbol`
- [ ] Connecteurs modèles externes optionnels
- [ ] Calibration probabiliste sur historique out-of-sample

## v2.0 — Calibration & décision
- [x] Journal des scénarios probabilistes
- [x] Résolution hors-échantillon
- [x] Brier score / log loss
- [x] Reliability bins
- [ ] Persistance PostgreSQL du journal
- [ ] Calibration isotone / Platt par marché
- [ ] Comparaison calibration par régime et timeframe

## v2.2 — Portfolio Optimizer & Stress Engine
- Allocation multi-méthodes sous contraintes.
- Comparaison exposition actuelle / cible.
- Estimation de volatilité et concentration après allocation.
- Préparation à des stress tests historiques et scénarios factoriels.

## v2.4 — Macro Factor Engine
- Régimes macro descriptifs
- Facteurs communs et heatmap inter-classes
- Rotation relative
- Avertissements sur couverture et incertitude

## v2.6 — NLP & Multi-page Intelligence
- Navigation multi-pages complète.
- Extraction d'entités et de thèmes.
- Déduplication et mesure de nouveauté.
- Score d'urgence et contradiction.
- Attribution événement → actif.
- Préparation d'un futur historique événement → réaction hors-échantillon.

## v2.7 — Fundamental Intelligence
- Nouvelle page Fondamentaux.
- Croissance, marges, rentabilité, bilan et multiples.
- Scores descriptifs par facteur et couverture.
- Endpoints `/api/fundamentals` et `/api/fundamentals/:symbol`.
- Données synthétiques explicitement marquées en démo ; remplacement par fournisseur licencié prévu.

## v2.8 — Unified Asset Intelligence
- Fiche unifiée par actif : marché, qualité, technique, fondamentaux, macro, news/NLP, événements et IA.
- Route UI `#/asset/:symbol` accessible depuis les actifs et le détail des signaux.
- Endpoint `/api/asset-intelligence/:symbol`.
- Journalisation de l'accès à la fiche unifiée.

## v3.1 — Notification & Monitoring Center
- Centre de notifications intégré au terminal.
- Surveillance périodique des signaux, watchlists, anomalies et qualité des données.
- Déduplication temporelle des notifications.
- Marquage individuel ou global comme lu.
- Endpoint de statut du monitoring.
- Cycle serveur de 60 secondes, sans exécution d'ordres réels.

## v3.3
Workflow & Scenario Builder, règles combinées, dry-run, audit et historique des exécutions.

## v3.4 — Security, Identity & Production Core
- RBAC
- sessions
- password hashing
- rate limiting
- HTTP hardening
- request correlation IDs
- PostgreSQL identity/session/preferences/audit schema
- production environment configuration

## v3.5 — Observability & Reliability
- health checks API/DB/providers
- métriques et logs structurés
- retry/backoff et circuit breaker
- migrations SQL versionnées
- smoke tests automatisés
- préparation monitoring production
