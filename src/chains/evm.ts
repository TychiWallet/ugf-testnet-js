import { ethers } from "ethers";
import type { HttpClient } from "../http.js";
import { Status, type PollOptions } from "../status.js";
import { type StatusResponse } from "../types.js";

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

  async sponsorAndExecute(
    digest: string,
    signer: ethers.Signer,
    buildTx: (signer: ethers.Signer) => Promise<ethers.TransactionResponse>,
    opts?: PollOptions,
  ): Promise<{ userTxHash: string }> {
    await this.status.poll(digest, opts);

    const userTx = await buildTx(signer);

    await this.http.post("/evm/confirm", {
      digest,
      tx_hash: userTx.hash,
    });

    return {
      userTxHash: userTx.hash,
    };
  }
}
