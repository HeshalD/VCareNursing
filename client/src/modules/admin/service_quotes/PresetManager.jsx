import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

const EMPTY_PRESET = {
  name: '',
  item_type: 'CHARGE',
  description: '',
  default_quantity: 1,
  default_unit_price: 0,
  is_active: true,
};

/* ─── Shared style tokens ─────────────────────────────────────────────────── */
const token = {
  radius: { sm: '6px', md: '8px', lg: '12px' },
  color: {
    border: '#e5e7eb',
    borderHover: '#d1d5db',
    text: { primary: '#111827', secondary: '#6b7280', tertiary: '#9ca3af' },
    bg: { page: '#f9fafb', surface: '#fff', hover: '#f3f4f6' },
    blue: { bg: '#E6F1FB', text: '#0C447C', solid: '#185FA5', hover: '#0C447C' },
    teal: { bg: '#E1F5EE', text: '#085041', price: '#0F6E56' },
    red: { icon: '#A32D2D', hover: '#fee2e2' },
  },
};

/* ─── Sub-components ─────────────────────────────────────────────────────── */

const Badge = ({ type }) =>
  type === 'CHARGE' ? (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 500,
        padding: '2px 7px',
        borderRadius: '4px',
        background: token.color.blue.bg,
        color: token.color.blue.text,
        flexShrink: 0,
      }}
    >
      Charge
    </span>
  ) : (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 500,
        padding: '2px 7px',
        borderRadius: '4px',
        background: token.color.teal.bg,
        color: token.color.teal.text,
        flexShrink: 0,
      }}
    >
      Discount
    </span>
  );

const IconBtn = ({ onClick, disabled, title, children, danger }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '5px',
      background: 'transparent',
      border: 'none',
      borderRadius: token.radius.sm,
      cursor: disabled ? 'default' : 'pointer',
      color: danger ? token.color.red.icon : token.color.text.secondary,
      opacity: disabled ? 0.3 : 1,
      transition: 'background 0.12s',
    }}
    onMouseEnter={e => {
      if (!disabled) e.currentTarget.style.background = danger ? token.color.red.hover : token.color.bg.hover;
    }}
    onMouseLeave={e => {
      e.currentTarget.style.background = 'transparent';
    }}
  >
    {children}
  </button>
);

const Label = ({ children, optional }) => (
  <label
    style={{
      display: 'block',
      fontSize: '12px',
      fontWeight: 500,
      color: token.color.text.secondary,
      marginBottom: '5px',
    }}
  >
    {children}
    {optional && (
      <span style={{ fontWeight: 400, color: token.color.text.tertiary, marginLeft: '4px' }}>(optional)</span>
    )}
  </label>
);

const Field = ({ children, style }) => (
  <div style={style}>{children}</div>
);

const inputStyle = {
  width: '100%',
  padding: '7px 10px',
  fontSize: '14px',
  border: `0.5px solid ${token.color.border}`,
  borderRadius: token.radius.md,
  background: token.color.bg.surface,
  outline: 'none',
  boxSizing: 'border-box',
  color: token.color.text.primary,
};

const formatCurrency = (amount) => {
  const n = parseFloat(amount) || 0;
  return `Rs. ${n.toLocaleString()}`;
};

/* ─── PresetManager ─────────────────────────────────────────────────────── */

const PresetManager = ({ isOpen, onClose, onSave }) => {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingPreset, setEditingPreset] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (isOpen) fetchPresets();
  }, [isOpen]);

  const fetchPresets = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/quotes/presets', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await response.json();
      setPresets(data.data || []);
    } catch {
      setError('Failed to load presets.');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreset = async () => {
    try {
      setLoading(true);
      setError('');

      const url = editingPreset.preset_id
        ? `/api/quotes/presets/${editingPreset.preset_id}`
        : '/api/quotes/presets';

      const response = await fetch(url, {
        method: editingPreset.preset_id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(editingPreset),
      });

      if (!response.ok) throw new Error();

      setSuccess('Preset saved.');
      setEditingPreset(null);
      fetchPresets();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to save preset.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePreset = async (presetId) => {
    if (!confirm('Delete this preset?')) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/quotes/presets/${presetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!response.ok) throw new Error();
      setSuccess('Preset deleted.');
      fetchPresets();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to delete preset.');
    } finally {
      setLoading(false);
    }
  };

  const handleMovePreset = (index, direction) => {
    const next = [...presets];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    next.forEach((p, i) => (p.sort_order = i + 1));
    setPresets(next);
  };

  if (!isOpen) return null;

  const isValid = editingPreset?.name?.trim() && editingPreset?.default_unit_price >= 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 50,
        padding: '40px 16px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '660px',
          background: token.color.bg.surface,
          borderRadius: token.radius.lg,
          border: `0.5px solid ${token.color.border}`,
          overflow: 'hidden',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px',
            borderBottom: `0.5px solid ${token.color.border}`,
          }}
        >
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 500, margin: 0, color: token.color.text.primary }}>
              Quote presets
            </h2>
            <p style={{ fontSize: '13px', color: token.color.text.secondary, margin: '2px 0 0' }}>
              Manage reusable line items for quotes
            </p>
          </div>
          <IconBtn onClick={onClose} title="Close">
            <X size={18} />
          </IconBtn>
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div style={{ padding: '20px', overflowY: 'auto', maxHeight: 'calc(90vh - 100px)' }}>

          {/* Alerts */}
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                background: '#fef2f2',
                border: `0.5px solid #fecaca`,
                borderRadius: token.radius.md,
                marginBottom: '16px',
                fontSize: '13px',
                color: '#991b1b',
              }}
            >
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          {success && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                background: '#f0fdf4',
                border: `0.5px solid #bbf7d0`,
                borderRadius: token.radius.md,
                marginBottom: '16px',
                fontSize: '13px',
                color: '#166534',
              }}
            >
              <CheckCircle size={15} />
              {success}
            </div>
          )}

          {/* ── Edit / Create form ────────────────────────────────────── */}
          {editingPreset && (
            <div
              style={{
                background: token.color.bg.page,
                border: `0.5px solid ${token.color.border}`,
                borderRadius: token.radius.lg,
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <p
                style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: token.color.text.tertiary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  margin: '0 0 14px',
                }}
              >
                {editingPreset.preset_id ? 'Edit preset' : 'New preset'}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <Field>
                  <Label>Name</Label>
                  <input
                    type="text"
                    value={editingPreset.name}
                    onChange={e => setEditingPreset({ ...editingPreset, name: e.target.value })}
                    placeholder="e.g. Registration fee"
                    style={inputStyle}
                  />
                </Field>

                <Field>
                  <Label>Type</Label>
                  <select
                    value={editingPreset.item_type}
                    onChange={e => setEditingPreset({ ...editingPreset, item_type: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="CHARGE">Charge</option>
                    <option value="DISCOUNT">Discount</option>
                  </select>
                </Field>

                <Field>
                  <Label>Default quantity</Label>
                  <input
                    type="number"
                    value={editingPreset.default_quantity}
                    onChange={e =>
                      setEditingPreset({ ...editingPreset, default_quantity: parseFloat(e.target.value) || 1 })
                    }
                    onWheel={e => e.target.blur()}
                    min="0"
                    step="0.01"
                    style={inputStyle}
                  />
                </Field>

                <Field>
                  <Label>Unit price (Rs.)</Label>
                  <input
                    type="number"
                    value={editingPreset.default_unit_price}
                    onChange={e =>
                      setEditingPreset({ ...editingPreset, default_unit_price: parseFloat(e.target.value) || 0 })
                    }
                    onWheel={e => e.target.blur()}
                    min="0"
                    step="0.01"
                    style={inputStyle}
                  />
                </Field>
              </div>

              <Field style={{ marginBottom: '14px' }}>
                <Label optional>Description</Label>
                <input
                  type="text"
                  value={editingPreset.description}
                  onChange={e => setEditingPreset({ ...editingPreset, description: e.target.value })}
                  placeholder="Short description"
                  style={inputStyle}
                />
              </Field>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleSavePreset}
                  disabled={loading || !isValid}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    background: isValid && !loading ? token.color.blue.solid : '#9ca3af',
                    color: '#fff',
                    border: 'none',
                    borderRadius: token.radius.md,
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: isValid && !loading ? 'pointer' : 'not-allowed',
                    transition: 'background 0.15s',
                  }}
                >
                  <Save size={14} />
                  {loading ? 'Saving…' : 'Save preset'}
                </button>

                <button
                  type="button"
                  onClick={() => setEditingPreset(null)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '7px 14px',
                    background: 'transparent',
                    border: `0.5px solid ${token.color.border}`,
                    borderRadius: token.radius.md,
                    fontSize: '13px',
                    color: token.color.text.secondary,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── List header ───────────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <p style={{ fontSize: '13px', fontWeight: 500, color: token.color.text.secondary, margin: 0 }}>
              {presets.length} preset{presets.length !== 1 ? 's' : ''}
            </p>
            {!editingPreset && (
              <button
                type="button"
                onClick={() => setEditingPreset({ ...EMPTY_PRESET, sort_order: presets.length + 1 })}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'transparent',
                  border: `0.5px solid ${token.color.border}`,
                  borderRadius: token.radius.md,
                  fontSize: '13px',
                  color: token.color.text.primary,
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = token.color.bg.hover)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Plus size={14} />
                Add new
              </button>
            )}
          </div>

          {/* ── Preset rows ───────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {presets.map((preset, index) => (
              <div
                key={preset.preset_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  border: `0.5px solid ${token.color.border}`,
                  borderRadius: token.radius.md,
                  background: token.color.bg.surface,
                  gap: '12px',
                }}
              >
                {/* Reorder arrows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
                  <IconBtn
                    onClick={() => handleMovePreset(index, 'up')}
                    disabled={index === 0}
                    title="Move up"
                  >
                    <ChevronUp size={13} />
                  </IconBtn>
                  <IconBtn
                    onClick={() => handleMovePreset(index, 'down')}
                    disabled={index === presets.length - 1}
                    title="Move down"
                  >
                    <ChevronDown size={13} />
                  </IconBtn>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px' }}>
                    <Badge type={preset.item_type} />
                    <span
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: token.color.text.primary,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {preset.name}
                    </span>
                    {!preset.is_active && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#f3f4f6',
                          color: token.color.text.tertiary,
                        }}
                      >
                        Inactive
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: token.color.text.tertiary }}>
                    {[preset.description, preset.default_quantity > 1 && `Qty ${preset.default_quantity}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>

                {/* Price */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: preset.item_type === 'DISCOUNT' ? token.color.teal.price : token.color.text.primary,
                    }}
                  >
                    {preset.item_type === 'DISCOUNT' ? '− ' : ''}
                    {formatCurrency(preset.default_unit_price)}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                  <IconBtn onClick={() => setEditingPreset({ ...preset })} title="Edit">
                    <Edit2 size={15} />
                  </IconBtn>
                  <IconBtn onClick={() => handleDeletePreset(preset.preset_id)} title="Delete" danger>
                    <Trash2 size={15} />
                  </IconBtn>
                </div>
              </div>
            ))}

            {presets.length === 0 && !loading && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  fontSize: '14px',
                  color: token.color.text.tertiary,
                }}
              >
                No presets yet. Add your first one above.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresetManager;