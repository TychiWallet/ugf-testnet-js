import { ethers } from "ethers";
import { BASE_SEPOLIA_CHAIN_ID } from "../constants.js";
import type { HttpClient } from "../http.js";
import { Status, type PollOptions } from "../status.js";
import { UGFError, type StatusResponse } from "../types.js";

export class EvmChain {
  private readonly status: Status;
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
    this.status = new Status(http);
  }

  async waitForCompletion(
    digest: string,
    opts?: PollOptions,
  ): Promise<StatusResponse> {
    return this.status.poll(digest, opts);
  }

  /**
   * Poll until UGF sponsorship completes, then send the user tx with gas
   * automatically fitted to the sponsored ETH balance.
   *
   * @param buildTx - Return a TransactionRequest (no gas fields needed).
   *                  SDK estimates gas, caps gasPrice to sponsored budget, sends as legacy tx.
   */
  async sponsorAndExecute(
    digest: string,
    signer: ethers.Signer,
    buildTx: (signer: ethers.Signer) => Promise<ethers.TransactionRequest>,
    opts?: PollOptions,
  ): Promise<{ userTxHash: string }> {
    const provider = await assertBaseSepoliaSigner(signer);

    await this.status.poll(digest, opts);

    const signerAddress = await signer.getAddress();

    // Wait for sponsored ETH to land — gateway sends before marking completed
    let sponsoredBalance = await provider.getBalance(signerAddress);
    for (let i = 0; sponsoredBalance === 0n && i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      sponsoredBalance = await provider.getBalance(signerAddress);
    }

    if (sponsoredBalance === 0n) {
      throw new UGFError("No sponsored ETH received after polling", "NO_SPONSORED_ETH");
    }

    const txRequest = await buildTx(signer);

    const estimatedGas = await provider.estimateGas({
      from: signerAddress,
      ...txRequest,
    });
    const gasLimit = (estimatedGas * 105n) / 100n; // 5% buffer
    const maxAffordableGasPrice = sponsoredBalance / gasLimit;
    const suggestedGasPrice =
      (await provider.getFeeData()).gasPrice ?? maxAffordableGasPrice;
    // Cap to what sponsored ETH can cover; use legacy tx to avoid EIP-1559 base fee variance
    const gasPrice =
      suggestedGasPrice <= maxAffordableGasPrice
        ? suggestedGasPrice
        : maxAffordableGasPrice;

    if (gasPrice === 0n) {
      throw new UGFError(
        "Sponsored ETH too small for estimated gas",
        "INSUFFICIENT_SPONSORED_ETH",
      );
    }

    const userTx = await signer.sendTransaction({
      ...txRequest,
      gasLimit,
      gasPrice,
      type: 0,
    });

    await this.http.post("/evm/confirm", {
      digest,
      tx_hash: userTx.hash,
    });

    return { userTxHash: userTx.hash };
  }
}

async function assertBaseSepoliaSigner(signer: ethers.Signer): Promise<ethers.Provider> {
  const provider = signer.provider;
  if (!provider) {
    throw new UGFError("Signer must have provider", "NO_PROVIDER");
  }

  const network = await provider.getNetwork();
  if (String(network.chainId) !== BASE_SEPOLIA_CHAIN_ID) {
    throw new UGFError(
      `UGF testnet SDK only supports Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`,
      "UNSUPPORTED_CHAIN",
    );
  }

  return provider;
}
