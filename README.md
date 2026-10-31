# Orbit — Stellar DEX

A non-custodial decentralized exchange interface built with React, TypeScript, Vite, and the official Stellar JavaScript SDK.

## Network

**Stellar Testnet only**
- Horizon: https://horizon-testnet.stellar.org
- Network passphrase: Test SDF Network ; September 2015

The app does not contain a mainnet switch. Testnet assets have no real-world value.

## Features

- Freighter wallet connection
- Live native XLM balance from Horizon
- Add custom Stellar classic assets by code and issuer
- Request strict-send path quotes from Horizon
- Slippage-aware minimum receive amount
- Build, wallet-sign, and submit path-payment strict-send transactions
- Responsive React + TypeScript interface

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Use

1. Install and unlock the [Freighter wallet](https://www.freighter.app/).
2. Switch Freighter to **Testnet**.
3. Fund the account with test XLM using [Stellar Friendbot](https://friendbot.stellar.org/).
4. Connect the wallet in Orbit.
5. Add a testnet asset using its exact asset code and issuer public key.
6. Select a pair, enter an amount, review the quote and sign the swap in Freighter.

## Important

This is an early testnet DEX interface. Path payments require an existing viable route/liquidity on Stellar. An asset may need a trustline before it can be received. This project does not deploy an AMM pool or issue tokens. Never enter a wallet secret key into this app.
