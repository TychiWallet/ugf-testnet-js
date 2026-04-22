import { ethers } from "ethers";
import {
  BASE_SEPOLIA_CHAIN_ID,
  TYI_USD_PAYMENT_COIN,
} from "../constants.js";
import type { HttpClient } from "../http.js";
import type { Registry } from "../registry.js";
import {
  UGFError,
  UGFSignatureError,
  type PaymentSubmitResponse,
  type QuoteResponse,
  type X402Payload,
  type ChainEntry,
  type PaymentOption,
} from "../types.js";

const ERC3009_ABI = [
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
];

const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

export interface X402Options {
  validForSeconds?: number; // default 3600
}

export class X402Payment {
  constructor(
    private readonly http: HttpClient,
    private readonly registry: Registry,
  ) {}

  async sign(
    quote: QuoteResponse,
    signer: ethers.Signer,
    provider: ethers.Provider,
    opts: X402Options = {},
  ): Promise<X402Payload> {
    const { validForSeconds = 3600 } = opts;

    // quote.payment_to is the receiver, but the x402 signature needs the TYI token contract.
    const network = await provider.getNetwork();
    const chainId = String(network.chainId);
    if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
      throw new UGFError(
        `UGF testnet SDK only supports Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`,
        "UNSUPPORTED_CHAIN",
      );
    }

    const registry = await this.registry.get();
    const option = registry.payment_options.find(
      (o: PaymentOption) =>
        o.type === "x402" &&
        o.token === TYI_USD_PAYMENT_COIN &&
        o.chains.some((c) => c.chain_id === chainId) &&
        o.receiver_address?.toLowerCase() === quote.payment_to.toLowerCase(),
    );

    if (!option) {
      throw new UGFError(
        `No x402 token found for chain ${chainId} with receiver ${quote.payment_to}`,
        "TOKEN_NOT_FOUND",
      );
    }

    const chainEntry = option.chains.find(
      (c: ChainEntry) => c.chain_id === chainId,
    );

    if (!chainEntry) {
      throw new UGFError(
        `Token ${option.token} not supported on chain ${chainId}`,
        "CHAIN_NOT_SUPPORTED",
      );
    }
    const tokenAddress = chainEntry.address;

    const contract = new ethers.Contract(tokenAddress, ERC3009_ABI, provider);

    const [onchainDS, version] = await Promise.all([
      contract.DOMAIN_SEPARATOR() as Promise<string>,
      resolveTokenVersion(contract),
    ]);
    // TYI_MOCK_USD EIP-712 domain was deployed with this exact string — contract.name() returns a different display name
    const name = TYI_USD_PAYMENT_COIN;

    const domain: ethers.TypedDataDomain = {
      name,
      version,
      chainId: Number(chainId),
      verifyingContract: tokenAddress,
    };

    const localDS = ethers.TypedDataEncoder.hashDomain(domain);
    if (localDS.toLowerCase() !== onchainDS.toLowerCase()) {
      throw new UGFSignatureError(
        `DOMAIN_SEPARATOR mismatch for ${tokenAddress}. Local: ${localDS}, Onchain: ${onchainDS}`,
      );
    }

    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const validAfter = 0n;
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + validForSeconds);
    const signerAddress = await signer.getAddress();

    const message = {
      from: signerAddress,
      to: quote.payment_to,
      value: BigInt(quote.payment_amount),
      validAfter,
      validBefore,
      nonce,
    };

    const signature = await signer.signTypedData(
      domain,
      TRANSFER_WITH_AUTH_TYPES,
      message,
    );

    // Verify recovery
    const evmDigest = ethers.TypedDataEncoder.hash(
      domain,
      TRANSFER_WITH_AUTH_TYPES,
      message,
    );
    const recovered = ethers.recoverAddress(evmDigest, signature);
    if (recovered.toLowerCase() !== signerAddress.toLowerCase()) {
      throw new UGFSignatureError("Signature recovery mismatch");
    }

    const sig = ethers.Signature.from(signature);

    return {
      digest: quote.digest,
      payment_mode: "x402",
      v: sig.v,
      r: sig.r,
      s: sig.s,
      nonce,
      valid_after: Number(validAfter),
      valid_before: Number(validBefore),
    };
  }

  async submit(payload: X402Payload): Promise<PaymentSubmitResponse> {
    return this.http.post<PaymentSubmitResponse>("/payment/submit", payload);
  }

  async signAndSubmit(
    quote: QuoteResponse,
    signer: ethers.Signer,
    provider: ethers.Provider,
    opts?: X402Options,
  ): Promise<PaymentSubmitResponse> {
    const payload = await this.sign(quote, signer, provider, opts);
    return this.submit(payload);
  }

  async execute(params: {
    quote: QuoteResponse;
    signer: ethers.Signer;
    token?: string;
    opts?: X402Options;
  }): Promise<PaymentSubmitResponse> {
    const { quote, signer, opts } = params;

    const provider = signer.provider;
    if (!provider) {
      throw new UGFError("Signer must have provider", "NO_PROVIDER");
    }

    return this.signAndSubmit(quote, signer, provider, opts);
  }
}

async function resolveTokenVersion(contract: ethers.Contract): Promise<string> {
  try {
    return (await contract.version()) as string;
  } catch {
    return "1";
  }
}
