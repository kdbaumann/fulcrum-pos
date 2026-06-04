import { useEffect, useRef } from "react";
import QR from "qrcode";

export function QRCode({ value, size = 128 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) {
      QR.toCanvas(ref.current, value, { width: size, margin: 1 }, () => {});
    }
  }, [value, size]);
  return <canvas ref={ref} width={size} height={size} aria-label={`QR code for ${value}`} />;
}
