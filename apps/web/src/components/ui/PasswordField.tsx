'use client';

import {
  ChangeEvent,
  InputHTMLAttributes,
  useId,
  useState,
} from 'react';
import { useI18n } from '@/components/LocaleProvider';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Controlled value (preferred). */
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Optional label text; when set, renders <label> above the field. */
  label?: string;
};

/**
 * Password input with show/hide toggle (eye).
 * Use for login, register, admin user form, security change-password.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  className,
  style,
  ...rest
}: Props) {
  const { t } = useI18n();
  const autoId = useId();
  const inputId = id ?? autoId;
  const [visible, setVisible] = useState(false);

  return (
    <div className={className} style={style}>
      {label != null && label !== '' && (
        <label htmlFor={inputId}>{label}</label>
      )}
      <div className="password-field">
        <input
          {...rest}
          id={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          className="password-field-input"
        />
        <button
          type="button"
          className="password-field-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t('passwordHide') : t('passwordShow')}
          aria-pressed={visible}
          title={visible ? t('passwordHide') : t('passwordShow')}
          tabIndex={0}
        >
          {visible ? (
            <EyeOffIcon />
          ) : (
            <EyeIcon />
          )}
        </button>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.3 17.3 0 0 1-3.2 4.3M6.1 6.1A17.5 17.5 0 0 0 2 12s3.5 7 10 7c1.5 0 2.9-.3 4.1-.8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
