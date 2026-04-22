import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_TYPE,
  TYI_USD_PAYMENT_COIN,
} from "./constants.js";
import type { HttpClient } from "./http.js";
import { UGFError, type QuoteRequest, type QuoteResponse } from "./types.js";

type NormalizedQuoteRequest = QuoteRequest & {
  payment_coin: string;
  payment_chain: string;
  payment_chain_type: "evm";
  dest_chain_id: string;
  dest_chain_type: "evm";
};

export class Quote {
  constructor(private readonly http: HttpClient) {}

  async get(req: QuoteRequest): Promise<QuoteResponse> {
    const body = normalizeQuoteRequest(req);
    assertBaseSepoliaOnly(body);

    const res = await this.http.post<QuoteResponse>("/quote", body);
    if (!res.digest) throw new UGFError("Quote response missing digest", "QUOTE_ERROR");
    return res;
  }
}

function normalizeQuoteRequest(req: QuoteRequest): NormalizedQuoteRequest {
  return {
    ...req,
    payment_coin: req.payment_coin ?? TYI_USD_PAYMENT_COIN,
    payment_chain: req.payment_chain ?? BASE_SEPOLIA_CHAIN_ID,
    payment_chain_type: req.payment_chain_type ?? BASE_SEPOLIA_CHAIN_TYPE,
    dest_chain_id: req.dest_chain_id ?? BASE_SEPOLIA_CHAIN_ID,
    dest_chain_type: req.dest_chain_type ?? BASE_SEPOLIA_CHAIN_TYPE,
  };
}

function assertBaseSepoliaOnly(req: NormalizedQuoteRequest): void {
  if (
    req.payment_coin !== TYI_USD_PAYMENT_COIN ||
    req.payment_chain !== BASE_SEPOLIA_CHAIN_ID ||
    req.dest_chain_id !== BASE_SEPOLIA_CHAIN_ID ||
    req.payment_chain_type !== BASE_SEPOLIA_CHAIN_TYPE ||
    req.dest_chain_type !== BASE_SEPOLIA_CHAIN_TYPE
  ) {
    throw new UGFError(
      `UGF testnet SDK only supports ${TYI_USD_PAYMENT_COIN} on Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`,
      "UNSUPPORTED_TESTNET_ROUTE",
    );
  }
}
