/**
 * @file evm-tyi-gasless-sdk.ts
 * @description Gasless ERC-20 transfer on Base Sepolia via UGF TESTNET SDK.
 *
 * Flow:
 *   1. Login with EVM wallet (EIP-191 signature)
 *   2. Get quote for destination ERC-20 transfer
 *   3. Pay quote with TYI_MOCK_USD via x402 (ERC-3009 TransferWithAuthorization)
 *   4. Wait for UGF sponsorship
 *   5. Send ERC-20 tx using sponsored ETH, confirm hash to gateway
 *
 * Required env vars:
 *   RPC_BASE_SEPOLIA        — Base Sepolia RPC URL
 *   USER_PRIVATE_KEY        — EVM wallet private key
 *   TEST_ERC20_BASE_SEPOLIA — ERC-20 token contract to transfer
 *
 * Optional env vars:
 *   X402_TYI_MOCK_USD_BASE_SEPOLIA — TYI token address (defaults to known testnet address)
 *   ERC20_RECIPIENT                — recipient address (defaults to sender)
 *   ERC20_AMOUNT                   — amount in token units (default: 0.000001)
 *   SERVICE_URL                    — gateway URL (default: https://gateway.universalgasframework.com)
 *
 */

import "dotenv/config";
import fs from "fs";
import { ethers } from "ethers";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_TYPE,
  TYI_USD_PAYMENT_COIN,
  UGFClient,
} from "@tychilabs/ugf-testnet-js";

const BACKEND_URL = "https://gateway.universalgasframework.com";
const RPC_BASE_SEPOLIA = process.env.RPC_BASE_SEPOLIA!;
const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY!;

/** TYI_MOCK_USD on Base Sepolia — the gas payment currency, not the token being transferred */
const TYI_TOKEN =
  process.env.X402_TYI_MOCK_USD_BASE_SEPOLIA ||
  "0x27DC1C167AeF232bb1e21073304B526726a8727e";

/** ERC-20 token the user wants to transfer (destination action, not gas payment) */
const ERC20_TOKEN = process.env.TEST_ERC20_BASE_SEPOLIA!;
const ERC20_RECIPIENT = process.env.TEST_ERC20_RECIPIENT;
const ERC20_AMOUNT = process.env.TEST_ERC20_AMOUNT || "0.000001";

if (!RPC_BASE_SEPOLIA) throw new Error("Missing RPC_BASE_SEPOLIA");
if (!USER_PRIVATE_KEY) throw new Error("Missing USER_PRIVATE_KEY");
if (!ERC20_TOKEN) throw new Error("Missing TEST_ERC20_BASE_SEPOLIA");

const provider = new ethers.JsonRpcProvider(RPC_BASE_SEPOLIA);

/** Wallet must have provider attached — required for x402 signing and gas estimation */
const wallet = new ethers.Wallet(USER_PRIVATE_KEY, provider);
const userAddress = wallet.address;
const recipient = ERC20_RECIPIENT || userAddress;
const client = new UGFClient({ baseUrl: BACKEND_URL });

const erc20ABI = [
  "function transfer(address to,uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const OUTPUT_DIR = "evm_tyi_gasless_sdk";
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

function save(name: string, data: unknown) {
  fs.writeFileSync(`${OUTPUT_DIR}/${name}`, JSON.stringify(data, null, 2));
}

async function main() {
  console.log("User:", userAddress);
  console.log("Backend:", BACKEND_URL);
  console.log("Chain: Base Sepolia", BASE_SEPOLIA_CHAIN_ID);

  // Guard: ensure RPC matches expected chain to avoid sending txs on wrong network
  const network = await provider.getNetwork();
  if (String(network.chainId) !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error(
      `Wrong RPC chain ${network.chainId}; expected ${BASE_SEPOLIA_CHAIN_ID}`,
    );
  }

  // Step 1 — authenticate.
  // Signs EIP-191 message with EVM wallet. JWT stored in SDK HTTP client
  // and attached to all subsequent gateway requests.
  await client.auth.login(wallet);
  console.log("Logged in through SDK");

  const erc20 = new ethers.Contract(ERC20_TOKEN, erc20ABI, wallet);
  const tyi = new ethers.Contract(TYI_TOKEN, erc20ABI, provider);

  const [symbol, decimals, erc20Balance, tyiBalance] = await Promise.all([
    erc20.symbol(),
    erc20.decimals(),
    erc20.balanceOf(userAddress),
    tyi.balanceOf(userAddress),
  ]);

  const amount = ethers.parseUnits(ERC20_AMOUNT, decimals);
  console.log(`${symbol} balance:`, ethers.formatUnits(erc20Balance, decimals));
  console.log("TYI balance:", ethers.formatUnits(tyiBalance, 6));
  console.log(`Will send ${ERC20_AMOUNT} ${symbol} to ${recipient}`);

  if (erc20Balance < amount) {
    throw new Error(`Not enough ${symbol} balance`);
  }

  // Encode destination tx calldata — this is what UGF will sponsor gas for.
  // tx_object must be JSON.stringify'd before passing to quote.get().
  const data = erc20.interface.encodeFunctionData("transfer", [
    recipient,
    amount,
  ]);

  // Step 2 — get quote.
  // Gateway returns payment_amount (TYI needed) and digest.
  // digest is the key that ties payment, status polling, and execution together.
  const quote = await client.quote.get({
    payment_coin: TYI_USD_PAYMENT_COIN,
    payer_address: userAddress,
    payment_chain: BASE_SEPOLIA_CHAIN_ID,
    payment_chain_type: BASE_SEPOLIA_CHAIN_TYPE,
    tx_object: JSON.stringify({
      from: userAddress,
      to: ERC20_TOKEN,
      data,
      value: "0",
    }),
    dest_chain_id: BASE_SEPOLIA_CHAIN_ID,
    dest_chain_type: BASE_SEPOLIA_CHAIN_TYPE,
  });

  console.log("Quote digest:", quote.digest);
  console.log(
    "TYI needed:",
    ethers.formatUnits(BigInt(quote.payment_amount), 6),
  );
  save("1_quote.json", quote);

  if (tyiBalance < BigInt(quote.payment_amount)) {
    throw new Error(`Not enough ${TYI_USD_PAYMENT_COIN} for x402 payment`);
  }

  // Step 3 — pay with x402 (ERC-3009 TransferWithAuthorization typed-data signature).
  // No on-chain tx from user here — signature only.
  // Gateway pulls TYI from user wallet using the signed authorization.
  const submit = await client.payment.x402.execute({
    quote,
    signer: wallet,
  });
  save("2_submit.json", submit);
  console.log("Payment submit:", submit.status);

  // Step 4+5 — sponsorAndExecute:
  //   - polls gateway until status === "completed"
  //   - waits for sponsored ETH, estimates gas, caps price to budget
  //   - sends tx and confirms hash to gateway
  const { userTxHash } = await client.chains.evm.sponsorAndExecute(
    quote.digest,
    wallet,
    async () => ({
      to: ERC20_TOKEN,
      data,
      value: 0n,
    }),
    {
      maxAttempts: 40,
      intervalMs: 3000,
      onTick: (status, attempt) => {
        console.log(
          `Status ${attempt}/40:`,
          status.status,
          status.signature || "",
        );
        save("3_status.json", status);
      },
    },
  );

  save("4_final_tx.json", {
    tx_hash: userTxHash,
    token: ERC20_TOKEN,
    amount: amount.toString(),
    recipient,
  });

  console.log("Final ERC20 tx:", userTxHash);
  console.log("DONE");
}

main().catch((err) => {
  console.error("FAILED");
  console.error(err);
  process.exit(1);
});
