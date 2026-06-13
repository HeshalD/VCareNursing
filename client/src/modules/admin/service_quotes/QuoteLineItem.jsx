import React from 'react';
import { Trash2, ChevronUp, ChevronDown } from 'lucide-react';

const token = {
  radius: { sm: '6px', md: '8px', lg: '12px' },
  color: {
    border: '#e5e7eb',
    text: { secondary: '#6b7280', tertiary: '#9ca3af' },
    blue: { bg: '#E6F1FB', text: '#0C447C', price: '#185FA5' },
    teal: { bg: '#E1F5EE', text: '#085041', price: '#0F6E56' },
    red: { icon: '#A32D2D', hover: '#fee2e2' },
  },
};

const Badge = ({ type }) =>
  type === 'CHARGE' ? (
    <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '4px', background: token.color.blue.bg, color: token.color.blue.text }}>
      Charge
    </span>
  ) : (
    <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '4px', background: token.color.teal.bg, color: token.color.teal.text }}>
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
      color: danger ? token.color.red.icon : token.color.text.tertiary,
      opacity: disabled ? 0.3 : 1,
      transition: 'background 0.12s',
    }}
    onMouseEnter={e => {
      if (!disabled) e.currentTarget.style.background = danger ? token.color.red.hover : '#f3f4f6';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.background = 'transparent';
    }}
  >
    {children}
  </button>
);

const inputStyle = {
  width: '100%',
  padding: '7px 10px',
  fontSize: '14px',
  border: `0.5px solid ${token.color.border}`,
  borderRadius: token.radius.md,
  background: 'var(--color-background-primary)',
  outline: 'none',
  boxSizing: 'border-box',
  color: 'var(--color-text-primary)',
};

const QuoteLineItem = ({ item, index, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) => {
  const handleInputChange = (field, value) => {
    const updated = { ...item, [field]: value };

    if (field === 'quantity' || field === 'unit_price') {
      const qty = field === 'quantity' ? parseFloat(value) || 0 : parseFloat(item.quantity) || 1;
      const price = field === 'unit_price' ? parseFloat(value) || 0 : parseFloat(item.unit_price) || 0;
      const raw = qty * price;
      updated.amount = item.item_type === 'DISCOUNT' ? -Math.abs(raw) : raw;
    }

    onUpdate(updated);
  };

  const formatCurrency = (amount) => {
    const n = parseFloat(amount) || 0;
    return `Rs. ${Math.abs(n).toLocaleString()}`;
  };

  const isDiscount = item.item_type === 'DISCOUNT';
  const priceColor = isDiscount ? token.color.teal.price : token.color.blue.price;

  return (
    <div
      style={{
        background: 'var(--color-background-primary)',
        border: `0.5px solid ${token.color.border}`,
        borderRadius: token.radius.lg,
        overflow: 'hidden',
      }}
    >
      {/* Row header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: `0.5px solid ${token.color.border}`,
          background: 'var(--color-background-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Badge type={item.item_type} />
          <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>Item #{index + 1}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <IconBtn onClick={onMoveUp} disabled={isFirst} title="Move up">
            <ChevronUp size={15} />
          </IconBtn>
          <IconBtn onClick={onMoveDown} disabled={isLast} title="Move down">
            <ChevronDown size={15} />
          </IconBtn>
          <IconBtn onClick={onDelete} title="Remove item" danger>
            <Trash2 size={15} />
          </IconBtn>
        </div>
      </div>

      {/* Fields */}
      <div style={{ padding: '16px', display: 'grid', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '5px' }}>
            Description
          </label>
          <input
            type="text"
            value={item.description}
            onChange={e => handleInputChange('description', e.target.value)}
            placeholder="e.g. Registration fee, daily care rate"
            required
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '5px' }}>
              Quantity
            </label>
            <input
              type="number"
              value={item.quantity}
              onChange={e => handleInputChange('quantity', e.target.value)}
              onWheel={e => e.target.blur()}
              placeholder="1"
              min="0"
              step="0.01"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '5px' }}>
              Unit price (Rs.)
            </label>
            <input
              type="number"
              value={item.unit_price}
              onChange={e => handleInputChange('unit_price', e.target.value)}
              onWheel={e => e.target.blur()}
              placeholder="0"
              min="0"
              step="0.01"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Line total */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 12px',
            background: 'var(--color-background-secondary)',
            borderRadius: token.radius.md,
            border: `0.5px solid ${token.color.border}`,
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Line total</span>
          <span style={{ fontSize: '15px', fontWeight: 500, color: priceColor }}>
            {isDiscount ? '− ' : ''}{formatCurrency(item.amount)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default QuoteLineItem;