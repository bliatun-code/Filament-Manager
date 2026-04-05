declare module "qrcode" {
  type QrColorOptions = {
    dark?: string;
    light?: string;
  };

  type ToDataUrlOptions = {
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    margin?: number;
    width?: number;
    color?: QrColorOptions;
  };

  type QrCodeModule = {
    toDataURL(text: string, options?: ToDataUrlOptions): Promise<string>;
  };

  const QRCode: QrCodeModule;
  export default QRCode;
}
