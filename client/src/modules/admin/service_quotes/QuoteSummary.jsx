import React from 'react';
import { Calculator } from 'lucide-react';

const token = {
  radius: { sm: '6px', md: '8px', lg: '12px' },
  color: {
    border: '#e5e7eb',
    blue: { bg: '#E6F1FB', text: '#0C447C', price: '#185FA5' },
    teal: { bg: '#E1F5EE', text: '#085041', price: '#0F6E56' },
    amber: { bg: '#FAEEDA', border: '#EF9F27', text: '#633806' },
    red: { bg: '#FCEBEB', border: '#F09595', text: '#791F1F' },
  },
};

const Badge = ({ type }) =>
  type === 'CHARGE' ? (
    <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 7px', borderRadius: '4px', background: token.color.blue.bg, color: token.color.blue.text, flexShrink: 0 }}>
      Charge
    </span>
  ) : (
    <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 7px', borderRadius: '4px', background: token.color.teal.bg, color: token.color.teal.text, flexShrink: 0 }}>
      Discount
    </span>
  );

const formatCurrency = (amount) => {
  const n = parseFloat(amount) || 0;
  return `Rs. ${Math.abs(n).toLocaleString()}`;
};

const QuoteSummary = ({ lineItems = [], termsConditions, onTermsChange }) => {
  const totals = lineItems.reduce(
    (acc, item) => {
      if (item.item_type === 'CHARGE') acc.charges += parseFloat(item.amount) || 0;
      else acc.discounts += Math.abs(parseFloat(item.amount) || 0);
      return acc;
    },
    { charges: 0, discounts: 0 }
  );

  const total = totals.charges - totals.discounts;
  const hasItems = lineItems.length > 0;
  const totalInvalid = hasItems && total <= 0;

  const charges = lineItems.filter(i => i.item_type === 'CHARGE');
  const discounts = lineItems.filter(i => i.item_type === 'DISCOUNT');

  return (
    <div
      style={{
        background: 'var(--color-background-primary)',
        border: `0.5px solid ${token.color.border}`,
        borderRadius: token.radius.lg,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '14px 18px',
          borderBottom: `0.5px solid ${token.color.border}`,
        }}
      >
        <Calculator size={16} color={token.color.blue.price} aria-hidden="true" />
        <h2 style={{ fontSize: '15px', fontWeight: 500, margin: 0, color: 'var(--color-text-primary)' }}>
          Quote summary
        </h2>
      </div>

      <div style={{ padding: '16px 18px', display: 'grid', gap: '16px' }}>

        {/* Items breakdown */}
        {hasItems && (
          <div>
            <p style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', margin: '0 0 10px' }}>
              Items breakdown
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', border: `0.5px solid ${token.color.border}`, borderRadius: token.radius.md, overflow: 'hidden' }}>
              {charges.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', background: 'var(--color-background-secondary)', gap: '10px' }}>
                  <Badge type="CHARGE" />
                  <span style={{ fontSize: '13px', color: 'var(--color-text-primary)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.description}
                    {item.quantity > 1 && (
                      <span style={{ color: 'var(--color-text-tertiary)', marginLeft: '4px' }}>
                        {item.quantity} × {formatCurrency(item.unit_price)}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: token.color.blue.price, flexShrink: 0 }}>
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}

              {discounts.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', background: 'var(--color-background-secondary)', gap: '10px' }}>
                  <Badge type="DISCOUNT" />
                  <span style={{ fontSize: '13px', color: 'var(--color-text-primary)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.description}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: token.color.teal.price, flexShrink: 0 }}>
                    − {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totals block */}
        <div
          style={{
            display: 'grid',
            gap: '6px',
            padding: '14px',
            background: 'var(--color-background-secondary)',
            borderRadius: token.radius.md,
            border: `0.5px solid ${token.color.border}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Total charges</span>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
              {formatCurrency(totals.charges)}
            </span>
          </div>

          {totals.discounts > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Total discounts</span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: token.color.teal.price }}>
                − {formatCurrency(totals.discounts)}
              </span>
            </div>
          )}

          <div style={{ height: '0.5px', background: token.color.border, margin: '4px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)' }}>Total amount</span>
            <span style={{ fontSize: '17px', fontWeight: 500, color: total >= 0 ? token.color.blue.price : token.color.teal.price }}>
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        {/* Terms & conditions */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
            Terms &amp; conditions
          </label>
          <textarea
            value={termsConditions}
            onChange={e => onTermsChange(e.target.value)}
            rows={3}
            placeholder="Enter terms and conditions…"
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: '13px',
              border: `0.5px solid ${token.color.border}`,
              borderRadius: token.radius.md,
              background: 'var(--color-background-primary)',
              resize: 'none',
              boxSizing: 'border-box',
              color: 'var(--color-text-primary)',
              lineHeight: 1.5,
              outline: 'none',
            }}
          />
        </div>

        {/* Validation banners */}
        {!hasItems && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              background: token.color.amber.bg,
              border: `0.5px solid ${token.color.amber.border}`,
              borderRadius: token.radius.md,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={token.color.amber.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span style={{ fontSize: '13px', color: token.color.amber.text }}>Add at least one item to create a quote.</span>
          </div>
        )}

        {totalInvalid && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              background: token.color.red.bg,
              border: `0.5px solid ${token.color.red.border}`,
              borderRadius: token.radius.md,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={token.color.red.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span style={{ fontSize: '13px', color: token.color.red.text }}>Quote total must be greater than zero.</span>
          </div>
        )}

      </div>
    </div>
  );
};

export default QuoteSummary;