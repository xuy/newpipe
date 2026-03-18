export enum SignalType {
  // Handshake
  HELO = 'HELO',   // Upstream: "I offer this MIME type"
  ACK = 'ACK',     // Downstream: "I accept and am ready"
  
  // Flow Control
  PAUSE = 'PAUSE',
  RESUME = 'RESUME',
  STOP = 'STOP',
  
  // Metadata
  ERROR = 'ERROR'
}

export interface SignalMessage {
  type: SignalType;
  mimeType?: string;
  payload?: any;
}
