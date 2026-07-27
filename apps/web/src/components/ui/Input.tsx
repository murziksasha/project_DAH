import { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, id, className = '', ...rest }: InputProps) {
  const inputId = id ?? rest.name;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId}>{label}</label>}
      <input id={inputId} {...rest} />
      {hint && !error && (
        <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 4 }}>{hint}</p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
