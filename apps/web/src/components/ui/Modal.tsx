'use client';

import { ReactNode, useEffect } from 'react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}

export function Modal({ open, title, children, onClose, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 50,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 'min(480px, 100%)', maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Закрити">
            ✕
          </Button>
        </div>
        {children}
        {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
      </div>
    </div>
  );
}
