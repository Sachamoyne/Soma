"use client";

import Image from "next/image";

interface BrandNameProps {
  className?: string;
  logoSize?: number;
}

/**
 * Affiche le logo OMA complet
 */
export function BrandName({ className = "", logoSize = 150 }: BrandNameProps) {
  return (
    <div className={`flex items-center ${className}`}>
      <Image
        src="/logo/OMA-removebg-preview.svg"
        alt="OMA Logo"
        width={logoSize}
        height={logoSize}
        className="object-contain flex-shrink-0"
        priority
      />
    </div>
  );
}
