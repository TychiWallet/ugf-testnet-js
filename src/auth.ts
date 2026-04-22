import type { ethers } from "ethers";
import type { HttpClient } from "./http.js";
import {
  UGFAuthError,
  type LoginResponse,
  type NonceResponse,
} from "./types.js";

export class Auth {
  constructor(private readonly http: HttpClient) {}

  async getNonce(address: string): Promise<string> {
    const res = await this.http.get<NonceResponse>(
      `/auth/nonce?address=${address}`,
    );
    return res.nonce;
  }

  /** EIP-191 login with ethers signer. Stores JWT automatically. */
  async login(signer: ethers.Signer): Promise<string> {
    const address = await signer.getAddress();
    const nonce = await this.getNonce(address);
    const signature = await signer.signMessage(
      `Sign in to UGF\nNonce: ${nonce}`,
    );

    const res = await this.http.post<LoginResponse>("/auth/wallet-login", {
      address,
      signature,
      nonce,
    });

    if (!res.token) throw new UGFAuthError("Login failed — no token returned");
    this.http.setToken(res.token);
    return res.token;
  }

  /** If you handle signing externally. */
  async loginRaw(
    address: string,
    nonce: string,
    signature: string,
  ): Promise<string> {
    const res = await this.http.post<LoginResponse>("/auth/wallet-login", {
      address,
      signature,
      nonce,
    });

    if (!res.token) throw new UGFAuthError("Login failed — no token returned");
    this.http.setToken(res.token);
    return res.token;
  }

  setToken(token: string): void {
    this.http.setToken(token);
  }

  getToken(): string | null {
    return this.http.getToken();
  }
}
