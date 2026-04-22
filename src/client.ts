import { Auth } from "./auth.js";
import { EvmChain } from "./chains/evm.js";
import { HttpClient } from "./http.js";
import { X402Payment } from "./payment/x402.js";
import { VaultPayment } from "./payment/vault.js";
import { Quote } from "./quote.js";
import { Registry } from "./registry.js";
import { Status } from "./status.js";
import type { UGFClientConfig } from "./types.js";

export const DEFAULT_BASE_URL = "https://gateway.universalgasframework.com";

export class UGFClient {
  private readonly http: HttpClient;

  readonly auth: Auth;
  readonly quote: Quote;
  readonly status: Status;
  readonly registry: Registry;

  readonly payment: {
    x402: X402Payment;
    vault: VaultPayment;
  };

  readonly chains: {
    evm: EvmChain;
  };

  constructor(config: UGFClientConfig = {}) {
    const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.http = new HttpClient(baseUrl);

    if (config.token) this.http.setToken(config.token);

    this.auth = new Auth(this.http);
    this.quote = new Quote(this.http);
    this.status = new Status(this.http);
    this.registry = new Registry(this.http);

    this.payment = {
      x402: new X402Payment(this.http, this.registry),
      vault: new VaultPayment(this.http, this.registry),
    };

    this.chains = {
      evm: new EvmChain(this.http),
    };
  }
}
