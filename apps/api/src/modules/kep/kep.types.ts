/** Supported QES / Diia.Підпис providers. */
export type KepProvider = 'mock' | 'diia' | 'cloud_kep' | 'cades';

export const KEP_PROVIDERS: KepProvider[] = ['mock', 'diia', 'cloud_kep', 'cades'];

export type SignSessionStatus =
  | 'pending'
  | 'waiting_user'
  | 'signed'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface StartSignInput {
  purpose: string;
  refType: string;
  refId: string;
  userId: string;
  documentTitle: string;
  documentText: string;
  /** Override env default provider */
  provider?: KepProvider;
  /** Prefer return after IdP (browser) */
  returnUrl?: string;
}

export interface StartSignResult {
  sessionId: string;
  provider: KepProvider;
  status: SignSessionStatus;
  digest: string;
  authorizeUrl?: string | null;
  deeplink?: string | null;
  /** true if already signed (mock instant) */
  signed: boolean;
  message: string;
  expiresAt: string;
}

export interface CompleteSignInput {
  sessionId: string;
  /** Authorization code from IdP redirect */
  code?: string;
  state?: string;
  /** Detached CAdES/CMS base64 (token / desktop EUSign) */
  signatureCms?: string;
  certificateSubject?: string;
  certificateSerial?: string;
  /** Provider raw payload */
  providerPayload?: Record<string, unknown>;
}

export interface DiiaOfferResponse {
  requestId?: string;
  deeplink?: string;
  deepLink?: string;
  url?: string;
  qr?: string;
}
