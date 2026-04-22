# AGENTS.md — @tychilabs/ugf-testnet-js

Machine-readable usage guide for AI coding agents (Claude Code, Codex, Cursor).

## What This Package Does

Gasless EVM transactions on Base Sepolia. User pays gas in `TYI_MOCK_USD` (mock ERC-20). UGF gateway sponsors ETH for the destination tx. User never needs Base Sepolia ETH.

Testnet only. Chain: Base Sepolia (84532). Payment coin: TYI_MOCK_USD.

For mainnet (EVM + Solana + Sui + Tron), use `@tychilabs/ugf-sdk`.

---

## Install

```bash
npm install @tychilabs/ugf-testnet-js ethers
```

---

## Required Env Vars

```env
RPC_BASE_SEPOLIA=<base-sepolia-rpc-url>
USER_PRIVATE_KEY=<hex-private-key>
```

---

## Complete Working Example

```ts
import "dotenv/config";
import { ethers } from "ethers";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_TYPE,
  TYI_USD_PAYMENT_COIN,
  UGFClient,
} from "@tychilabs/ugf-testnet-js";

const provider = new ethers.JsonRpcProvider(process.env.RPC_BASE_SEPOLIA!);

// CRITICAL: wallet must have provider attached
const wallet = new ethers.Wallet(process.env.USER_PRIVATE_KEY!, provider);

const client = new UGFClient({
  baseUrl: "https://gateway.universalgasframework.com",
});

// Step 1 — authenticate
await client.auth.login(wallet);

// Step 2 — quote the destination tx
// tx_object MUST be JSON.stringify'd — do not pass an object
const quote = await client.quote.get({
  payment_coin: TYI_USD_PAYMENT_COIN,
  payer_address: wallet.address,
  payment_chain: BASE_SEPOLIA_CHAIN_ID,
  payment_chain_type: BASE_SEPOLIA_CHAIN_TYPE,
  tx_object: JSON.stringify({
    from: wallet.address,
    to: "0xRecipient",
    data: "0x",
    value: "0",
  }),
  dest_chain_id: BASE_SEPOLIA_CHAIN_ID,
  dest_chain_type: BASE_SEPOLIA_CHAIN_TYPE,
});
// quote.digest ties all steps together — never lose this value

// Step 3 — pay with TYI via x402 (ERC-3009 signature, no on-chain tx from user)
await client.payment.x402.execute({ quote, signer: wallet });

// Step 4 — execute destination tx (SDK manages gas internally)
const { userTxHash } = await client.chains.evm.sponsorAndExecute(
  quote.digest,
  wallet,
  async () => ({
    to: "0xRecipient",
    data: "0x",
    value: 0n,
  }),
);

console.log("Done:", userTxHash);
```

---

## API Reference

### `new UGFClient(config?)`

```ts
const client = new UGFClient();
const client = new UGFClient({ baseUrl: "https://gateway.universalgasframework.com" });
const client = new UGFClient({ token: existingJwt });
```

### `client.auth.login(signer)`

Signs EIP-191 message. Stores JWT in HTTP client. All subsequent requests auto-attach bearer token.

```ts
await client.auth.login(wallet); // wallet must have provider
```

### `client.quote.get(req)`

Returns `QuoteResponse` with `digest`, `payment_amount`, `payment_to`.

```ts
const quote = await client.quote.get({
  payer_address: string,
  tx_object: string,           // JSON.stringify'd tx — NOT an object
  payment_coin?: string,       // defaults to TYI_MOCK_USD
  payment_chain?: string,      // defaults to "84532"
  payment_chain_type?: "evm",  // defaults to "evm"
  dest_chain_id?: string,      // defaults to "84532"
  dest_chain_type?: "evm",     // defaults to "evm"
});
```

### `client.payment.x402.execute({ quote, signer })`

Signs ERC-3009 `TransferWithAuthorization`. No on-chain tx. Gateway pulls TYI from user wallet.

```ts
await client.payment.x402.execute({ quote, signer: wallet });
```

### `client.chains.evm.sponsorAndExecute(digest, signer, buildTx, opts?)`

Polls until sponsorship confirmed, sends tx with gas fitted to sponsored budget, confirms hash to gateway.

```ts
const { userTxHash } = await client.chains.evm.sponsorAndExecute(
  quote.digest,
  wallet,
  async () => ({
    to: "0xAddress",
    data: encodedCalldata,
    value: 0n,
  }),
  {
    maxAttempts: 40,
    intervalMs: 3000,
    onTick: (status, attempt) => console.log(attempt, status.status),
  },
);
```

`buildTx` returns `TransactionRequest`. Do NOT set `gasLimit`, `gasPrice`, or `type` — the SDK computes these from the sponsored ETH budget.

### `client.status.poll(digest, opts?)`

Poll until `completed`. Throws on `failed` or `expired`.

```ts
const status = await client.status.poll(quote.digest, {
  maxAttempts: 35,
  intervalMs: 3000,
});
```

---

## Exported Constants

```ts
BASE_SEPOLIA_CHAIN_ID   = "84532"
BASE_SEPOLIA_CHAIN_TYPE = "evm"
TYI_USD_PAYMENT_COIN    = "TYI_MOCK_USD"
```

---

## Error Codes

| Code | Thrown by | Cause |
|---|---|---|
| `UNSUPPORTED_TESTNET_ROUTE` | `quote.get` | Chain or coin not Base Sepolia / TYI_MOCK_USD |
| `QUOTE_ERROR` | `quote.get` | Gateway returned no digest |
| `NO_PROVIDER` | `payment.x402.execute`, `sponsorAndExecute` | Signer has no provider attached |
| `UNSUPPORTED_CHAIN` | `payment.x402.execute`, `sponsorAndExecute` | Signer provider is not Base Sepolia |
| `TOKEN_NOT_FOUND` | `payment.x402.execute` | Registry has no x402 option matching quote |
| `SIGNATURE_ERROR` | `payment.x402.execute` | EIP-712 domain separator mismatch or recovery fail |
| `NO_SPONSORED_ETH` | `sponsorAndExecute` | Sponsored ETH did not arrive after 10s |
| `INSUFFICIENT_SPONSORED_ETH` | `sponsorAndExecute` | Sponsored amount too small for estimated gas |
| `TX_FAILED` | `status.poll` | Gateway status returned `failed` |
| `TX_EXPIRED` | `status.poll` | Gateway status returned `expired` |
| `TIMEOUT` | `status.poll` | Max attempts reached without completion |
| `AUTH_ERROR` | any request | 401 — token expired, re-login required |
| `HTTP_ERROR` | any request | Non-2xx from gateway |

---

## Critical Gotchas

1. **`tx_object` must be `JSON.stringify`'d** — `quote.get` expects a string, not an object. Passing an object is a silent type error.

2. **Wallet must have provider** — `new ethers.Wallet(key, provider)`, not `new ethers.Wallet(key)`. Both `payment.x402.execute` and `sponsorAndExecute` throw `NO_PROVIDER` without it.

3. **Do not set gas params in `buildTx`** — `sponsorAndExecute` computes `gasLimit`, `gasPrice`, and `type: 0` from the sponsored ETH balance. Setting them manually overrides the budget logic and can cause the tx to fail.

4. **TYI domain name is `"TYI_MOCK_USD"`** — the EIP-712 domain was deployed with this exact string. The contract's `name()` returns a different display value. The SDK uses the constant, not `contract.name()`.

5. **Signer chain must be Base Sepolia** — the provider attached to the signer must point to chain 84532. Wrong RPC throws `UNSUPPORTED_CHAIN`.

6. **`quote.get` defaults all fields** — omitting `payment_coin`, `payment_chain`, `dest_chain_id` etc. is fine; they default to Base Sepolia + TYI. But passing any other value throws `UNSUPPORTED_TESTNET_ROUTE`.

7. **Status polling sleeps before first read** — minimum wait is one `intervalMs` (default 3000ms). Do not assume instant status on first tick.

8. **`digest` is the session key** — every step after `quote.get` requires `quote.digest`. Store it immediately.

---

## Status Values

```ts
type TxStatus = "pending" | "pending_sponsor" | "completed" | "failed" | "expired";
```

`sponsorAndExecute` polls until `completed`. `failed` and `expired` throw immediately.

---

## Gateway Base URL

```
https://gateway.universalgasframework.com
```

---

## What You Can Build

**Gasless ERC-20 transfer** — user sends any ERC-20 on Base Sepolia without ETH. Pay TYI, transfer lands.

**Gasless contract interaction** — call any contract function (mint, vote, stake, swap) without the user holding gas. Encode calldata, pass in `tx_object`.

**Gasless wallet onboarding** — new wallet with zero ETH balance can execute its first tx immediately after receiving TYI.

**Agent-operated wallets** — AI agent controls a wallet, pays TYI for every action, never needs to manage ETH per chain.

**Gasless NFT mint** — encode `mint()` calldata, quote it, pay TYI, execute. User mints without ETH.

**Gasless DAO vote** — encode governance `castVote()`, run through UGF. Voter needs no gas token.

**SDK integration test harness** — validate your app's full tx lifecycle (quote → settle → execute → confirm) against testnet before mainnet launch.

**Multi-step gasless flow** — chain multiple `sponsorAndExecute` calls sequentially. Each step is a separate quote + payment + execution.

---

## What NOT To Do

```ts
// WRONG — tx_object must be a string
tx_object: { from: "0x...", to: "0x...", value: "0" }

// WRONG — wallet without provider
const wallet = new ethers.Wallet(key);
await client.payment.x402.execute({ quote, signer: wallet }); // throws NO_PROVIDER

// WRONG — setting gas in buildTx callback
async (signer) => signer.sendTransaction({ to, data, gasLimit: 100000n }) // breaks budget logic

// WRONG — wrong chain
const wallet = new ethers.Wallet(key, mainnetProvider); // throws UNSUPPORTED_CHAIN

// WRONG — non-TYI payment coin
await client.quote.get({ payment_coin: "USDC", ... }); // throws UNSUPPORTED_TESTNET_ROUTE
```
