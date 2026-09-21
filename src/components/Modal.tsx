import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  children: ReactNode;
  saveLabel?: string;
}

export function Modal({ open, title, onClose, onSave, children, saveLabel = 'Сохранить' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('modal-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <div className="modal-title" id="modal-title">{title}</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть"><X size={16} strokeWidth={1.75} /></button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Отмена</button>
          <button type="button" className="btn-primary" onClick={onSave}>{saveLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Field({
  label,
  id,
  type = 'text',
  placeholder = '',
  value,
  onChange,
  list,
  listOptions,
}: {
  label: string;
  id: string;
  type?: string;
  placeholder?: string;
  value: string | number;
  onChange: (v: string) => void;
  /** Optional native datalist id + options: gives a click-to-pick dropdown of
   *  suggestions (e.g. common car makes/models) while still allowing free
   *  text entry for anything not in the list. */
  list?: string;
  listOptions?: string[];
}) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}</label>
      <input
        className="field-input"
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={list}
        autoComplete="off"
      />
      {list && listOptions ? (
        <datalist id={list}>
          {listOptions.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  id,
  options,
  value,
  onChange,
}: {
  label: string;
  id: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}</label>
      <select className="field-select" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function useFormState<T extends Record<string, string>>(initial: T) {
  const [state, setState] = useState(initial);
  const set = (key: keyof T, val: string) => setState((s) => ({ ...s, [key]: val }));
  const reset = (vals: T) => setState(vals);
  return { state, set, reset };
}
