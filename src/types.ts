// ─── Registry ────────────────────────────────────────────────────────────────

export interface ChainEntry {
  chain_id: string;
  chain_type: "evm";
  address: string;
  vault_address?: string; // only for native tokens
}

export interface PaymentOption {
  token: string;               // "TYI_MOCK_USD" on Base Sepolia testnet
  type: "x402" | "native";
  chain_type: "evm";
  receiver_address?: string;   // present for x402 tokens
  chains: ChainEntry[];
}

export interface RegistryResponse {
  payment_options: PaymentOption[];
  vault_abi: string;           // JSON string of the vault ABI
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface NonceResponse {
  nonce: string;
}

export interface LoginResponse {
  token: string;
}

// ─── Quote ───────────────────────────────────────────────────────────────────

export interface QuoteRequest {
  payment_coin?: string;       // defaults to TYI_USD_PAYMENT_COIN
  payer_address: string;
  payment_chain?: string;      // defaults to Base Sepolia (84532)
  payment_chain_type?: "evm";
  tx_object: string;           // JSON stringified tx
  dest_chain_id?: string;      // defaults to Base Sepolia (84532)
  dest_chain_type?: "evm";
}

export interface QuoteResponse {
  digest: string;
  payment_amount: string;
  payment_mode: "x402" | "vault";
  payment_to: string;
  gas_amount: string;
  expires_at: number;
}

// ─── Payment ─────────────────────────────────────────────────────────────────

export interface X402Payload {
  digest: string;
  payment_mode: "x402";
  v: number;
  r: string;
  s: string;
  nonce: string;
  valid_after: number;
  valid_before: number;
}

export interface VaultPayload {
  digest: string;
  payment_mode: "vault";
  tx_hash: string;
}

export interface PaymentSubmitResponse {
  status: string;
}

// ─── Status ──────────────────────────────────────────────────────────────────

export type TxStatus =
  | "pending"
  | "completed"
  | "failed"
  | "expired";

export interface StatusResponse {
  status: TxStatus;
  digest: string;
  signature?: string;
  error?: string;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class UGFError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "UGFError";
  }
}

export class UGFAuthError extends UGFError {
  constructor(message: string) {
    super(message, "AUTH_ERROR", 401);
    this.name = "UGFAuthError";
  }
}

export class UGFTimeoutError extends UGFError {
  constructor(message: string) {
    super(message, "TIMEOUT");
    this.name = "UGFTimeoutError";
  }
}

export class UGFSignatureError extends UGFError {
  constructor(message: string) {
    super(message, "SIGNATURE_ERROR");
    this.name = "UGFSignatureError";
  }
}

// ─── SDK Config ──────────────────────────────────────────────────────────────

export interface UGFClientConfig {
  baseUrl?: string;
  token?: string;
}
