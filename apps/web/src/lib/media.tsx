import { useEffect, useState, type ReactNode } from 'react';

export function resolveMediaUrl(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (normalized === 'null' || normalized === 'undefined') return null;
  if (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:')
  ) {
    return normalized;
  }
  if (normalized.startsWith('/')) {
    return normalized;
  }
  return `/${normalized.replace(/^\/+/, '')}`;
}

export function SafeImage({
  src,
  alt,
  className,
  fallback = null,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallback?: ReactNode;
}) {
  const resolvedSrc = resolveMediaUrl(src);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [resolvedSrc]);

  if (!resolvedSrc || hasError) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}
