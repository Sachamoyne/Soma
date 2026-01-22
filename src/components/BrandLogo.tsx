import Image from "next/image";
import { cn } from "@/lib/cn";

interface BrandLogoProps {
  /**
   * Taille du logo en pixels
   * @default 56 (h-14)
   */
  size?: number;
  /**
   * @deprecated Ignoré - conservé pour compatibilité
   */
  iconSize?: number;
  /**
   * Classes additionnelles pour le conteneur
   */
  className?: string;
}

/**
 * Logo Soma - Source de vérité unique pour le logo de l'application
 * Utilisé sur login, landing, navbar, etc.
 */
export function BrandLogo({
  size = 56,
  iconSize: _iconSize,
  className,
}: BrandLogoProps) {
  return (
    <div
      className={cn("shrink-0", className)}
      style={{
        width: size,
        height: size,
      }}
    >
      <Image
        src="/SOMA BLANC BG removed.svg"
        alt="Soma"
        width={size}
        height={size}
        className="w-full h-full object-contain"
        priority
      />
    </div>
  );
}
