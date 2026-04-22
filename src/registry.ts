import type { HttpClient } from "./http.js";
import type { RegistryResponse, PaymentOption, ChainEntry } from "./types.js";

export class Registry {
  private cache: RegistryResponse | null = null;

  constructor(private readonly http: HttpClient) {}

  async get(): Promise<RegistryResponse> {
    if (this.cache) return this.cache;
    this.cache = await this.http.get<RegistryResponse>("/tokens/registry");
    return this.cache;
  }

  invalidate(): void {
    this.cache = null;
  }

  /** Find a payment option by token symbol e.g. "TYI_MOCK_USD" */
  async getOption(token: string): Promise<PaymentOption> {
    const registry = await this.get();
    const option = registry.payment_options.find((o) => o.token === token);
    if (!option) throw new Error(`Token not supported: ${token}`);
    return option;
  }

  /** Get chain entry for a token on a specific chain_id */
  async getChainEntry(token: string, chainId: string): Promise<ChainEntry> {
    const option = await this.getOption(token);
    const entry = option.chains.find((c) => c.chain_id === chainId);
    if (!entry)
      throw new Error(`Token ${token} not supported on chain ${chainId}`);
    return entry;
  }

  /** Get vault ABI parsed */
  async getVaultAbi(): Promise<object[]> {
    const registry = await this.get();
    return JSON.parse(registry.vault_abi);
  }
}
