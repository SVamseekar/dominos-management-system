import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useValidatePINMutation } from '../../../store/api/userApi';
import { getRtkErrorMessage } from '../../shared/rtkError';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { pos, posTouchBtnPrimary, posTouchBtnGhost } from '../posTokens';

interface PINAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (userData: {
    userId: string;
    name: string;
    type: string;
    role: string;
    storeId: string;
  }) => void;
}

export const PINAuthModal: React.FC<PINAuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
}) => {
  const [pin, setPin] = useState<string[]>(['', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef0 = useRef<HTMLInputElement>(null);
  const inputRef1 = useRef<HTMLInputElement>(null);
  const inputRef2 = useRef<HTMLInputElement>(null);
  const inputRef3 = useRef<HTMLInputElement>(null);
  const inputRef4 = useRef<HTMLInputElement>(null);
  const inputRefs = useMemo(
    () => [inputRef0, inputRef1, inputRef2, inputRef3, inputRef4],
    [inputRef0, inputRef1, inputRef2, inputRef3, inputRef4]
  );

  const [validatePIN] = useValidatePINMutation();

  useEffect(() => {
    if (isOpen && inputRefs[0].current) {
      setTimeout(() => inputRefs[0].current?.focus(), 100);
    }
  }, [isOpen, inputRefs]);

  const handleSubmit = async () => {
    const pinString = pin.join('');

    if (pinString.length !== 5) {
      setError('Please enter complete 5-digit PIN');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await validatePIN({ pin: pinString }).unwrap();

      onAuthenticated({
        userId: result.userId,
        name: result.name,
        type: result.type,
        role: result.role,
        storeId: result.storeId,
      });

      resetPIN();
      onClose();
    } catch (err: unknown) {
      setError(getRtkErrorMessage(err, 'Invalid PIN'));
      setPin(['', '', '', '', '']);
      inputRefs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const resetPIN = () => {
    setPin(['', '', '', '', '']);
    setError('');
  };

  const handlePinChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    if (value && index < 4) {
      inputRefs[index + 1].current?.focus();
    }

    if (index === 4 && value) {
      const fullPin = [...newPin.slice(0, 4), value].join('');
      if (fullPin.length === 5) {
        setTimeout(() => handleSubmit(), 100);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!pin[index] && index > 0) {
        inputRefs[index - 1].current?.focus();
      } else {
        const newPin = [...pin];
        newPin[index] = '';
        setPin(newPin);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs[index - 1].current?.focus();
    } else if (e.key === 'ArrowRight' && index < 4) {
      inputRefs[index + 1].current?.focus();
    } else if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 5);

    if (pastedData.length > 0) {
      const newPin = [...pin];
      for (let i = 0; i < Math.min(pastedData.length, 5); i++) {
        newPin[i] = pastedData[i];
      }
      setPin(newPin);

      const nextIndex = Math.min(pastedData.length, 4);
      inputRefs[nextIndex].current?.focus();
    }
  };

  if (!isOpen) return null;

  const disabled = loading || pin.join('').length !== 5;

  return (
    <div style={styles.overlay} data-testid="pin-auth-modal-overlay">
      <div style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="pos-pin-title">
        <div style={styles.header}>
          <h2 id="pos-pin-title" style={styles.title}>
            Cashier PIN
          </h2>
          <p style={styles.subtitle}>Enter your 5-digit PIN to authorize this charge</p>
        </div>

        <div style={styles.pinInputContainer}>
          {[0, 1, 2, 3, 4].map((index) => (
            <input
              key={index}
              ref={inputRefs[index]}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={pin[index]}
              onChange={(e) => handlePinChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              style={{
                ...styles.pinInput,
                ...(error ? styles.pinInputError : {}),
              }}
              disabled={loading}
              autoComplete="off"
            />
          ))}
        </div>

        {error && (
          <div style={styles.errorContainer}>
            <WarningAmberIcon style={{ fontSize: '18px', color: pos.error }} />
            <span style={styles.errorText}>{error}</span>
          </div>
        )}

        <div style={styles.actions}>
          <button
            type="button"
            onClick={() => {
              resetPIN();
              onClose();
            }}
            disabled={loading}
            style={{ ...posTouchBtnGhost, flex: 1, minHeight: 52 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled}
            style={{
              ...posTouchBtnPrimary,
              flex: 1,
              minHeight: 52,
              ...(disabled
                ? {
                    background: pos.faint,
                    cursor: 'not-allowed',
                    opacity: 0.65,
                    boxShadow: 'none',
                  }
                : {}),
            }}
          >
            {loading ? 'Verifying...' : 'Continue'}
          </button>
        </div>

        <div style={styles.helpText}>
          <p>Don&apos;t have a PIN? Contact your manager.</p>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    backdropFilter: 'blur(8px)',
  },
  modal: {
    backgroundColor: pos.surfaceElevated,
    borderRadius: 20,
    padding: '36px 32px',
    maxWidth: 440,
    width: '92%',
    boxShadow: pos.shadow.raised.lg,
    border: `1px solid ${pos.border}`,
    borderTop: `4px solid ${pos.role}`,
    fontFamily: pos.font,
  },
  header: {
    textAlign: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: 800,
    color: pos.ink,
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: 14,
    color: pos.muted,
    margin: 0,
    lineHeight: 1.4,
  },
  pinInputContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
  },
  pinInput: {
    width: 56,
    height: 64,
    minWidth: 48,
    minHeight: 48,
    fontSize: 28,
    fontWeight: 700,
    textAlign: 'center',
    border: `2px solid ${pos.border}`,
    borderRadius: 12,
    backgroundColor: pos.surfaceAlt,
    color: pos.ink,
    transition: 'all 0.15s ease',
    outline: 'none',
    fontFamily: 'ui-monospace, monospace',
  },
  pinInputError: {
    borderColor: pos.error,
    backgroundColor: pos.errorSoft,
  },
  errorContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: pos.errorSoft,
    padding: '12px 16px',
    borderRadius: 10,
    marginBottom: 20,
    border: `1px solid ${pos.error}`,
  },
  errorText: {
    color: pos.errorDark,
    fontSize: 14,
    fontWeight: 600,
  },
  actions: {
    display: 'flex',
    gap: 12,
    marginBottom: 12,
  },
  helpText: {
    textAlign: 'center',
    fontSize: 12,
    color: pos.faint,
    marginTop: 4,
  },
};
