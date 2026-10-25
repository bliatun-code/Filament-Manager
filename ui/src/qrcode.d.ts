declare module "qrcode" {
  type QrColorOptions = {
    dark?: string;
    light?: string;
  };

  type ToDataUrlOptions = {
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    version?: number;
    margin?: number;
    scale?: number;
    width?: number;
    color?: QrColorOptions;
  };

  type QrCodeModule = {
    create(text: string, options?: ToDataUrlOptions): {
      modules: { size: number; isReserved(row: number, column: number): number };
    };
    toDataURL(text: string, options?: ToDataUrlOptions): Promise<string>;
  };

  const QRCode: QrCodeModule;
  export default QRCode;
}
