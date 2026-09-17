"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "success";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-primary-container text-on-primary-container hover:opacity-90 active:opacity-70",
  secondary: "bg-surface-container-high text-on-surface hover:bg-surface-container-highest active:bg-surface-container",
  outline: "border border-panel-border text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface active:bg-surface-container",
  ghost: "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface active:bg-surface-container",
  danger: "bg-error-container text-on-error-container hover:opacity-90 active:opacity-70",
  success: "bg-success-container text-on-success-container hover:opacity-90 active:opacity-70",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-body-sm",
  md: "px-4 py-2 text-body-md",
  lg: "px-5 py-2.5 text-body-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      iconPosition = "left",
      disabled,
      className = "",
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center gap-1.5
          font-semibold rounded-lg
          transition-all duration-150 ease-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!loading && icon && iconPosition === "left" && (
          <span className="flex-shrink-0" aria-hidden="true">{icon}</span>
        )}
        <span className={loading ? "opacity-75" : ""}>{children}</span>
        {!loading && icon && iconPosition === "right" && (
          <span className="flex-shrink-0" aria-hidden="true">{icon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";