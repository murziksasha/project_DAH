'use client';

import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Extra form fields under the message (e.g. void reason). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  /** Disable confirm (e.g. empty required reason). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmLabel = 'Підтвердити',
  cancelLabel = 'Скасувати',
  danger,
  busy,
  confirmDisabled,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? '…' : confirmLabel}
          </Button>
        </div>
      }
    >
      <p style={{ margin: 0, color: 'var(--text)' }}>{message}</p>
      {children}
    </Modal>
  );
}
