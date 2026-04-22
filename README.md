# @tychilabs/ugf-testnet-js

[![npm](https://img.shields.io/npm/v/@tychilabs/ugf-testnet-js)](https://www.npmjs.com/package/@tychilabs/ugf-testnet-js)
[![npm downloads](https://img.shields.io/npm/dm/@tychilabs/ugf-testnet-js)](https://www.npmjs.com/package/@tychilabs/ugf-testnet-js)
[![license](https://img.shields.io/npm/l/@tychilabs/ugf-testnet-js)](./LICENSE)
[![types](https://img.shields.io/npm/types/@tychilabs/ugf-testnet-js)](https://www.npmjs.com/package/@tychilabs/ugf-testnet-js)
[![node](https://img.shields.io/node/v/@tychilabs/ugf-testnet-js)](https://www.npmjs.com/package/@tychilabs/ugf-testnet-js)

This is the UGF testnet SDK. It runs the full UGF execution lifecycle against Base Sepolia only, using `TYI_MOCK_USD` as a mock settlement coin. Users send transactions without holding any destination-chain ETH.

No paymasters. No bundlers. No ERC-4337. No Smart Wallets.

---

## What Is a Remote Transaction

A Remote Transaction routes an onchain action to its destination without making the user move liquidity first.

Normally: user lacks destination-chain ETH → action fails.

With UGF: user authorizes settlement from an existing balance → UGF completes the action at destination.

```
Value here.  →  UGF routes.  →  Action there.
```

This testnet environment runs that full lifecycle against Base Sepolia using `TYI_MOCK_USD` as a mock settlement coin. It is the integration surface for wallets, dApps, and agents building completion flows before connecting to production routes.

**Gasless transactions on Base Sepolia — gas paid in TYI mock USD.**

---

## Use Cases

**Wallets** — let users send ERC-20 tokens or interact with contracts on Base Sepolia without holding ETH. User pays in TYI mock USD, wallet handles the rest.

**dApps** — onboard users who have no gas token. Any contract call (swap, mint, vote, transfer) can be submitted gaslessly during testnet integration.

**AI agents** — agents execute onchain actions without managing gas wallets per chain. Pay once in TYI, agent's action lands on-chain.

**Protocol teams** — test full transaction lifecycle (quote → settle → execute → confirm) before connecting to production UGF routes on mainnet.

---

## Network

| Field           | Value          |
| --------------- | -------------- |
| Chain           | Base Sepolia   |
| Chain ID        | `84532`        |
| Chain type      | `evm`          |
| Settlement coin | `TYI_MOCK_USD` |

Exported constants:

```ts
BASE_SEPOLIA_CHAIN_ID; // "84532"
BASE_SEPOLIA_CHAIN_TYPE; // "evm"
TYI_USD_PAYMENT_COIN; // "TYI_MOCK_USD"
```

---

## Install

```bash
npm install @tychilabs/ugf-testnet-js ethers
```

---

## Quick Start

```ts
import { ethers } from "ethers";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_TYPE,
  TYI_USD_PAYMENT_COIN,
  UGFClient,
} from "@tychilabs/ugf-testnet-js";

const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const client = new UGFClient();

// 1. Authenticate — prove wallet ownership to UGF
await client.auth.login(wallet);

// 2. Quote — describe the destination action, receive settlement amount + digest
const quote = await client.quote.get({
  payer_address: wallet.address,
  tx_object: JSON.stringify({
    from: wallet.address,
    to: "0xRecipient",
    data: "0x",
    value: "0",
  }),
});

// 3. Settle — authorize TYI transfer via ERC-3009 signature (no on-chain tx from user)
await client.payment.x402.execute({ quote, signer: wallet });

// 4. Execute — UGF sponsors ETH at destination, SDK confirms completion
const { userTxHash } = await client.chains.evm.sponsorAndExecute(
  quote.digest,
  wallet,
  async () => ({
    to: "0xRecipient",
    data: "0x",
    value: 0n,
  }),
);
```

`quote.get()` defaults to Base Sepolia and `TYI_MOCK_USD` when fields are omitted.
Passing any other chain or coin throws `UGFError` with code `UNSUPPORTED_TESTNET_ROUTE`.

`sponsorAndExecute` receives a `TransactionRequest` builder — do not set `gasLimit`, `gasPrice`, or `type`. The SDK caps gas to the sponsored budget automatically.

---

## Remote Transaction Lifecycle

```
1. Authenticate
   auth.login → EIP-191 wallet signature → JWT

2. Quote
   quote.get → POST /quote → digest + TYI settlement_amount

3. Settle
   payment.x402.execute → ERC-3009 typed-data signature → gateway pulls TYI

4. Execute
   chains.evm.sponsorAndExecute
     ├── poll /status until settlement confirmed
     ├── wait for sponsored ETH to land at destination
     ├── estimate gas, cap to sponsored budget
     ├── send legacy tx (type 0)
     └── POST /evm/confirm → userTxHash

5. Confirm
   userTxHash → action completed on Base Sepolia
```

Each stage maps to a distinct UGF concern:

- **Quote** — price the destination action
- **Settle** — authorize value transfer from source
- **Execute** — complete the action at destination
- **Confirm** — close the route and return proof

---

## Client Surface

```ts
client.auth; // authenticate signer
client.registry; // discover supported routes and settlement tokens
client.quote; // price a destination action
client.payment.x402; // settle via ERC-3009 authorization
client.payment.vault; // settle via on-chain vault payment
client.status; // poll route completion
client.chains.evm; // execute and confirm EVM destination actions
```

---

## Gateway Endpoints

```
GET  /auth/nonce?address=<address>
POST /auth/wallet-login
GET  /tokens/registry
POST /quote
POST /payment/submit
GET  /status?digest=<digest>
POST /evm/confirm
```

---

## Error Reference

| Code                        | Stage   | Meaning                                          |
| --------------------------- | ------- | ------------------------------------------------ |
| `UNSUPPORTED_TESTNET_ROUTE` | Quote   | Chain or coin not available on testnet           |
| `QUOTE_ERROR`               | Quote   | Route cannot be priced or digest missing         |
| `NO_PROVIDER`               | Settle  | Signer must have an attached provider            |
| `SETTLEMENT_ERROR`          | Settle  | Authorization signature failed or rejected       |
| `VAULT_TX_FAILED`           | Settle  | On-chain vault payment receipt missing or failed |
| `EXECUTION_ERROR`           | Execute | Destination action stopped before confirmation   |
| `COMPLETION_TIMEOUT`        | Confirm | Confirmation not received within timeout window  |

Surface errors at the exact lifecycle stage — avoid generic "transaction failed" messages so users know where the route stopped.

---

## Example

```bash
npx tsx examples/evm-tyi-gasless-sdk.ts
```

---

## Compatibility

| Environment             | Status     |
| ----------------------- | ---------- |
| Node.js 18+             | Supported  |
| Browser (ethers signer) | Supported  |
| React Native            | Not tested |

---

## About

This is the **testnet SDK** — Base Sepolia only, `TYI_MOCK_USD` only.

The production SDK [`@tychilabs/ugf-sdk`](https://www.npmjs.com/package/@tychilabs/ugf-sdk) supports mainnet routes across EVM chains, Solana, Sui, and Tron with real settlement coins.

[Tychi Labs](https://tychilabs.com) builds UGF — Remote Transaction infrastructure for wallets, apps, and agents. UGF is a Value-to-Action API: source-chain value authorizes destination-chain action, without destination-chain setup.

- Mainnet SDK: [`@tychilabs/ugf-sdk`](https://www.npmjs.com/package/@tychilabs/ugf-sdk)
- Execution proof: [ugfscan.com](https://ugfscan.com)
- Docs: [universalgasframework.com](https://universalgasframework.com)
- X: [@TychiLabs](https://x.com/TychiLabs)
