import { Brain } from "lucide-react";
import { cn } from "@/lib/cn";

interface BrandLogoProps {
  /**
   * Taille du conteneur en pixels
   * @default 56 (h-14)
   */
  size?: number;
  /**
   * Taille de l'icône Brain en pixels
   * @default 32 (h-8)
   */
  iconSize?: number;
  /**
   * Classes additionnelles pour le conteneur
   */
  className?: string;
}

/**
 * Logo Soma - Icône cerveau dans un conteneur gradient
 * Source de vérité unique pour le logo de l'application
 * Utilisé sur login, landing, navbar, etc.
 */
export function BrandLogo({
  size = 56,
  iconSize = 32,
  className,
}: BrandLogoProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg shrink-0",
        className
      )}
      style={{
        width: size,
        height: size,
      }}
    >
      <Brain
        className="text-white"
        style={{
          width: iconSize,
          height: iconSize,
        }}
      />
    </div>
  );
}
