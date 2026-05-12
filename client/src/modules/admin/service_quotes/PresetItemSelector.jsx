import React, { useState } from 'react';
import { Plus, Settings, Search, ChevronDown } from 'lucide-react';

const PresetItemSelector = ({ presets = [], onSelectPreset, onManagePresets, loading = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredPresets = presets.filter(preset =>
    preset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    preset.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedPresets = filteredPresets.reduce((groups, preset) => {
    const type = preset.item_type;
    if (!groups[type]) groups[type] = [];
    groups[type].push(preset);
    return groups;
  }, {});

  const handleSelectPreset = (preset) => {
    onSelectPreset({
      description: preset.name,
      item_type: preset.item_type,
      quantity: preset.default_quantity,
      unit_price: preset.default_unit_price,
      sort_order: 0,
    });
    setShowDropdown(false);
    setSearchTerm('');
  };

  const formatCurrency = (amount) => {
    const n = parseFloat(amount) || 0;
    return `Rs. ${n.toLocaleString()}`;
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            background: '#185FA5',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => !loading && (e.currentTarget.style.background = '#0C447C')}
          onMouseLeave={e => !loading && (e.currentTarget.style.background = '#185FA5')}
        >
          <Plus size={15} />
          Add preset item
          <ChevronDown
            size={14}
            style={{
              marginLeft: '2px',
              transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          />
        </button>

        <button
          type="button"
          onClick={onManagePresets}
          title="Manage presets"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '7px 9px',
            background: 'transparent',
            border: '0.5px solid #d1d5db',
            borderRadius: '8px',
            cursor: 'pointer',
            color: '#6b7280',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#f3f4f6';
            e.currentTarget.style.color = '#374151';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#6b7280';
          }}
        >
          <Settings size={16} />
        </button>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <>
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              width: '380px',
              background: '#fff',
              border: '0.5px solid #e5e7eb',
              borderRadius: '12px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
              zIndex: 50,
              overflow: 'hidden',
            }}
          >
            {/* Search */}
            <div style={{ padding: '12px', borderBottom: '0.5px solid #f3f4f6' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#9ca3af',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search presets…"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '7px 10px 7px 32px',
                    fontSize: '14px',
                    border: '0.5px solid #e5e7eb',
                    borderRadius: '8px',
                    background: '#f9fafb',
                    outline: 'none',
                    boxSizing: 'border-box',
                    color: '#111827',
                  }}
                />
              </div>
            </div>

            {/* Groups */}
            <div style={{ padding: '8px', maxHeight: '320px', overflowY: 'auto' }}>
              {Object.entries(groupedPresets).map(([type, typePresets], groupIdx) => (
                <div key={type} style={{ marginBottom: groupIdx < Object.keys(groupedPresets).length - 1 ? '4px' : 0 }}>
                  {/* Group label */}
                  <div
                    style={{
                      padding: '6px 10px 4px',
                      fontSize: '11px',
                      fontWeight: 500,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      color: '#9ca3af',
                    }}
                  >
                    {type === 'CHARGE' ? 'Charges' : 'Discounts'}
                  </div>

                  {typePresets.map(preset => (
                    <button
                      key={preset.preset_id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        border: 'none',
                        background: 'transparent',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: 500, color: '#111827', marginBottom: '2px' }}>
                          {preset.name}
                        </div>
                        {preset.description && (
                          <div style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {preset.description}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: 500,
                            color: type === 'DISCOUNT' ? '#0F6E56' : '#111827',
                          }}
                        >
                          {type === 'DISCOUNT' ? '− ' : ''}{formatCurrency(preset.default_unit_price)}
                        </div>
                        {preset.default_quantity > 1 && (
                          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                            Qty: {preset.default_quantity}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}

                  {/* Divider between groups */}
                  {groupIdx < Object.keys(groupedPresets).length - 1 && (
                    <div style={{ height: '0.5px', background: '#f3f4f6', margin: '6px 0' }} />
                  )}
                </div>
              ))}

              {filteredPresets.length === 0 && (
                <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: '14px', color: '#9ca3af' }}>
                  {searchTerm ? 'No presets match your search' : 'No presets available'}
                </div>
              )}
            </div>
          </div>

          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setShowDropdown(false)}
          />
        </>
      )}
    </div>
  );
};

export default PresetItemSelector;