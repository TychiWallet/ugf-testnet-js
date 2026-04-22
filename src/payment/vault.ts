import { ethers } from "ethers";
import { BASE_SEPOLIA_CHAIN_ID } from "../constants.js";
import type { HttpClient } from "../http.js";
import type { Registry } from "../registry.js";
import {
  UGFError,
  type PaymentSubmitResponse,
  type QuoteResponse,
  type VaultPayload,
} from "../types.js";

export class VaultPayment {
  constructor(
    private readonly http: HttpClient,
    private readonly registry: Registry,
  ) {}

  async pay(
    quote: QuoteResponse,
    signer: ethers.Signer,
    chainId: string,
    token: string,
  ): Promise<VaultPayload> {
    if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
      throw new UGFError(
        `UGF testnet SDK only supports Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`,
        "UNSUPPORTED_CHAIN",
      );
    }

    // Resolve vault address + ABI from registry
    const entry = await this.registry.getChainEntry(token, chainId);
    if (!entry.vault_address) {
      throw new UGFError(
        `No vault address for token ${token} on chain ${chainId}`,
        "VAULT_NOT_FOUND",
      );
    }

    const vaultAbi = await this.registry.getVaultAbi();
    const vault = new ethers.Contract(entry.vault_address, vaultAbi, signer);

    const tx = await vault.payForFuel(quote.digest, {
      value: BigInt(quote.payment_amount),
    });

    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      throw new UGFError(`Vault tx failed. Hash: ${tx.hash}`, "VAULT_TX_FAILED");
    }

    return {
      digest: quote.digest,
      payment_mode: "vault",
      tx_hash: receipt.hash,
    };
  }

  async submit(payload: VaultPayload): Promise<PaymentSubmitResponse> {
    return this.http.post<PaymentSubmitResponse>("/payment/submit", payload);
  }

  async payAndSubmit(
    quote: QuoteResponse,
    signer: ethers.Signer,
    chainId: string,
    token: string,
  ): Promise<PaymentSubmitResponse> {
    const payload = await this.pay(quote, signer, chainId, token);
    return this.submit(payload);
  }
}
