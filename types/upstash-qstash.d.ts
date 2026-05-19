declare module "@upstash/qstash" {
  export class Receiver {
    constructor(options: { currentSigningKey: string; nextSigningKey: string });
    verify(options: { signature: string; body: string }): Promise<void>;
  }
}
