"use client";

import { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`
        flex flex-col items-center justify-center gap-4
        p-8 text-center
        ${className}
      `}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-surface-container-high text-on-surface-variant">
        {icon || (
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
      </div>
      <div>
        <h3 className="text-body-md font-semibold text-on-surface">{title}</h3>
        {description && (
          <p className="mt-1 text-body-sm text-on-surface-variant max-w-xs mx-auto">
            {description}
          </p>
        )}
      </div>
      {action && (
        <div className="mt-2">{action}</div>
      )}
    </div>
  );
}

export function EmptyStateInline({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center" role="status">
      <h4 className="text-body-sm font-medium text-on-surface">{title}</h4>
      {description && (
        <p className="text-body-sm text-on-surface-variant max-w-xs">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}