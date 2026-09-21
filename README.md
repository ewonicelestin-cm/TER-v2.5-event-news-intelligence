# Market Intelligence Terminal (TER)

TER est une plateforme de **market intelligence** multi-marchés hautement résiliente et observable.

## Fonctionnalités Clés

- **Scanner Multi-Actifs** : Surveillance en temps réel des actions, indices, forex, crypto et matières premières.
- **Moteur de Scoring IA** : Analyse probabiliste basée sur des indicateurs techniques avancés, la structure du marché et la détection de régime.
- **Intelligence Hub** : Dashboard de sentiment global agrégé et analyse des corrélations inter-actifs.
- **Workflow Builder** : Orchestration configurable de conditions, scénarios et notifications.
- **Arcane Intelligence** : Détection des signaux stratégiques provenant des sources gouvernementales et monétaires mondiales.
- **Risk Engine** : Calcul de VaR, volatilité, stress tests et dimensionnement de position.
- **Backtesting & Simulation** : Moteur de backtest avec frais, slippage, walk-forward et simulation Monte Carlo.
- **Observability & Reliability** : Circuit breakers, retries exponentiels et télémétrie complète des fournisseurs de données.

## Sources de Données

TER intègre des flux de données en direct via des adaptateurs pour :
- **Binance** (Crypto OHLCV)
- **CoinGecko** (Crypto Fallback)
- **Frankfurter / BCE** (Forex)
- **Twelve Data** (Actions, Indices, Matières Premières - Nécessite une clé API)

## Installation

```bash
npm install
npm run dev
```

Puis ouvrir `http://localhost:5173`.

## Architecture

Le système est construit sur une architecture modulaire composée d'un frontend React/TypeScript et d'un backend Node.js/Express, avec une couche de persistance optionnelle sous PostgreSQL.

## Important

Ce terminal est un outil d'aide à la décision et de simulation (Paper Trading). Il ne constitue pas un conseil financier et n'exécute aucun ordre réel sur les marchés.
