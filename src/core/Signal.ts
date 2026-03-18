export enum SignalType {
  // Handshake
  HELO = 'HELO',   // Downstream: producer → consumer ("I offer this MIME type")
  ACK = 'ACK',     // Upstream: consumer → producer ("I accept and am ready")

  // Flow Control
  PAUSE = 'PAUSE',     // Upstream: consumer → producer ("stop sending")
  RESUME = 'RESUME',   // Upstream: consumer → producer ("ready again")
  STOP = 'STOP',       // Upstream: consumer → producer ("terminate")

  // Metadata
  ERROR = 'ERROR'      // Downstream: producer → consumer ("something broke")
}

/** Signals that flow upstream (consumer → producer) */
export const UPSTREAM_SIGNALS = new Set([
  SignalType.ACK,
  SignalType.PAUSE,
  SignalType.RESUME,
  SignalType.STOP,
]);

/** Signals that flow downstream (producer → consumer) */
export const DOWNSTREAM_SIGNALS = new Set([
  SignalType.HELO,
  SignalType.ERROR,
]);

export interface SignalMessage {
  type: SignalType;
  mimeType?: string;
  payload?: any;
}
