"use client";

import { forwardRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      className = "",
      id,
      ...rest
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-[var(--bm-text3)]"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-3 flex items-center pointer-events-none text-[var(--bm-text3)]">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={[
              "h-10 w-full rounded-md border bg-[var(--bm-bg2)] text-sm text-[var(--bm-text)]",
              "placeholder:text-[var(--bm-text3)] outline-none",
              "transition-colors duration-150",
              "focus:border-[var(--bm-accent)] focus:ring-1 focus:ring-[var(--bm-accent-bd)]",
              error
                ? "border-[var(--bm-red)] focus:border-[var(--bm-red)] focus:ring-[rgba(224,85,85,0.2)]"
                : "border-[var(--bm-border2)]",
              leftIcon ? "pl-9" : "pl-3",
              rightIcon ? "pr-9" : "pr-3",
              className,
            ].join(" ")}
            {...rest}
          />
          {rightIcon && (
            <span className="absolute right-3 flex items-center text-[var(--bm-text3)]">
              {rightIcon}
            </span>
          )}
        </div>
        {error && (
          <p className="text-xs text-[var(--bm-red)]">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-xs text-[var(--bm-text3)]">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

// Textarea variant
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = "", id, ...rest }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-[var(--bm-text3)]"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={[
            "w-full rounded-md border bg-[var(--bm-bg2)] text-sm text-[var(--bm-text)]",
            "placeholder:text-[var(--bm-text3)] outline-none p-3 resize-none",
            "transition-colors duration-150",
            "focus:border-[var(--bm-accent)] focus:ring-1 focus:ring-[var(--bm-accent-bd)]",
            error
              ? "border-[var(--bm-red)]"
              : "border-[var(--bm-border2)]",
            className,
          ].join(" ")}
          {...rest}
        />
        {error && <p className="text-xs text-[var(--bm-red)]">{error}</p>}
        {helperText && !error && (
          <p className="text-xs text-[var(--bm-text3)]">{helperText}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, className = "", id, children, ...rest }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
    return (
      <div className="flex w-full flex-col gap-1.5">
        {label ? <label htmlFor={selectId} className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--bm-text3)]">{label}</label> : null}
        <select ref={ref} id={selectId} className={["h-10 w-full rounded-md border bg-[var(--bm-bg2)] px-3 text-sm text-[var(--bm-text)] outline-none transition-colors focus:border-[var(--bm-accent)] focus:ring-1 focus:ring-[var(--bm-accent-bd)]", error ? "border-[var(--bm-red)]" : "border-[var(--bm-border2)]", className].join(" ")} {...rest}>
          {children}
        </select>
        {error ? <p className="text-xs text-[var(--bm-red)]">{error}</p> : helperText ? <p className="text-xs text-[var(--bm-text3)]">{helperText}</p> : null}
      </div>
    );
  }
);
Select.displayName = "Select";
