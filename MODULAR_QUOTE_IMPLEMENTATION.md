# Modular Quote Building System - Implementation Guide

## Overview
Transform the current fixed-field quotation system into a modular, flexible system where admins can:
- Add any number of charges, fees, or discounts to a quotation
- Save frequently used items as presets for quick access
- Maintain the existing registration fee, transport fee, and daily rate logic

---

## Current State Analysis

### Existing Database Schema (from `migrate.js` lines 265-280)
```sql
CREATE TABLE IF NOT EXISTS quotations (
  quote_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_number VARCHAR(20) UNIQUE,
  request_id UUID NOT NULL REFERENCES service_requests(request_id),
  registration_fee NUMERIC(12,2) DEFAULT 10000.00,
  daily_rate NUMERIC(12,2) NOT NULL,
  qty_days INTEGER DEFAULT 7 NOT NULL,
  transport_fee NUMERIC(12,2) DEFAULT 0.00,
  sub_total NUMERIC(12,2) NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  estimate_date DATE DEFAULT CURRENT_DATE,
  status VARCHAR(20) DEFAULT 'SENT',
  terms_conditions TEXT DEFAULT 'The initial estimated amount is non-refundable.',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Current Calculation Logic (from `quoteController.js` lines 18-26)
```javascript
const regFee = registration_fee || 0;
const days = qty_days || 7;
const transport = transport_fee || 1000.00;
const item2Amount = daily_rate * days;
const subTotal = regFee + item2Amount + transport;
```

---

## Phase 1: Database Migration

### 1.1 New Tables to Add

Add these to `migrate.js` after the existing tables section:

```sql
-- =========================================================
-- QUOTE LINE ITEMS (Stores individual items for each quote)
-- =========================================================
await db.query(`
  CREATE TABLE IF NOT EXISTS quote_line_items (
    line_item_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quote_id UUID NOT NULL REFERENCES quotations(quote_id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL, -- 'CHARGE', 'DISCOUNT', 'TAX'
    description VARCHAR(255) NOT NULL,
    quantity NUMERIC(12,2) DEFAULT 1,
    unit_price NUMERIC(12,2) NOT NULL,
    amount NUMERIC(12,2) NOT NULL, -- quantity * unit_price (negative for discounts)
    sort_order INTEGER DEFAULT 0,
    is_preset_item BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`);

-- =========================================================
-- QUOTE PRESETS (Frequently used items like Registration Fee, Transport Fee)
-- =========================================================
await db.query(`
  CREATE TABLE IF NOT EXISTS quote_preset_items (
    preset_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL, -- e.g., "Registration Fee", "Transport Fee"
    item_type VARCHAR(50) NOT NULL, -- 'CHARGE', 'DISCOUNT'
    description VARCHAR(255),
    default_quantity NUMERIC(12,2) DEFAULT 1,
    default_unit_price NUMERIC(12,2) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`);

-- =========================================================
-- UPDATE EXISTING QUOTATIONS TABLE (Keep backwards compatibility)
-- =========================================================
-- Note: Keep existing columns but they become optional/nullable
-- The new quote_line_items table will be the source of truth
```

### 1.2 Seed Default Preset Items

Add to migration or create a separate seed file:

```javascript
// Seed default preset items (matching current logic)
const seedPresets = async () => {
  const presets = [
    {
      name: 'Registration Fee',
      item_type: 'CHARGE',
      description: 'One-time registration fee for new clients',
      default_quantity: 1,
      default_unit_price: 10000.00,
      sort_order: 1
    },
    {
      name: 'Transport Fee',
      item_type: 'CHARGE',
      description: 'Daily transport allowance for staff',
      default_quantity: 1,
      default_unit_price: 1000.00,
      sort_order: 3
    },
    {
      name: 'Daily Care Rate',
      item_type: 'CHARGE',
      description: 'Daily nursing/caretaker service rate',
      default_quantity: 7, -- Default 7 days
      default_unit_price: 0, -- Admin sets based on service type
      sort_order: 2
    }
  ];

  for (const preset of presets) {
    await db.query(`
      INSERT INTO quote_preset_items (name, item_type, description, default_quantity, default_unit_price, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING;
    `, [preset.name, preset.item_type, preset.description, preset.default_quantity, preset.default_unit_price, preset.sort_order]);
  }
};
```

---

## Phase 2: Backend API Changes

### 2.1 New Controller Methods (Add to `quoteController.js`)

```javascript
// ==================== PRESET ITEMS MANAGEMENT ====================

exports.getPresetItems = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM quote_preset_items 
      WHERE is_active = true 
      ORDER BY sort_order, name
    `);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Get Preset Items Error:', error);
    res.status(500).json({ message: 'Failed to fetch preset items' });
  }
};

exports.createPresetItem = async (req, res) => {
  const { name, item_type, description, default_quantity, default_unit_price, sort_order } = req.body;
  
  try {
    const result = await db.query(`
      INSERT INTO quote_preset_items (name, item_type, description, default_quantity, default_unit_price, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, item_type, description, default_quantity || 1, default_unit_price, sort_order || 0]);
    
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Create Preset Item Error:', error);
    res.status(500).json({ message: 'Failed to create preset item' });
  }
};

exports.updatePresetItem = async (req, res) => {
  const { preset_id } = req.params;
  const { name, item_type, description, default_quantity, default_unit_price, is_active, sort_order } = req.body;
  
  try {
    const result = await db.query(`
      UPDATE quote_preset_items 
      SET name = $1, item_type = $2, description = $3, default_quantity = $4, 
          default_unit_price = $5, is_active = $6, sort_order = $7, updated_at = CURRENT_TIMESTAMP
      WHERE preset_id = $8
      RETURNING *
    `, [name, item_type, description, default_quantity, default_unit_price, is_active, sort_order, preset_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Preset item not found' });
    }
    
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Update Preset Item Error:', error);
    res.status(500).json({ message: 'Failed to update preset item' });
  }
};

exports.deletePresetItem = async (req, res) => {
  const { preset_id } = req.params;
  
  try {
    // Soft delete by setting is_active = false
    const result = await db.query(`
      UPDATE quote_preset_items SET is_active = false WHERE preset_id = $1 RETURNING *
    `, [preset_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Preset item not found' });
    }
    
    res.status(200).json({ status: 'success', message: 'Preset item deactivated' });
  } catch (error) {
    console.error('Delete Preset Item Error:', error);
    res.status(500).json({ message: 'Failed to delete preset item' });
  }
};

// ==================== MODULAR QUOTE CREATION ====================

exports.createModularQuotation = async (req, res) => {
  const { request_id, line_items, terms_conditions } = req.body;
  // line_items: [{ description, item_type, quantity, unit_price, sort_order }]

  try {
    // 1. Validate input
    if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
      return res.status(400).json({ message: 'At least one line item is required' });
    }

    // 2. Calculate totals
    let sub_total = 0;
    const processedItems = line_items.map(item => {
      const quantity = parseFloat(item.quantity) || 1;
      const unit_price = parseFloat(item.unit_price) || 0;
      const amount = item.item_type === 'DISCOUNT' 
        ? -(Math.abs(quantity * unit_price)) // Discounts are negative
        : quantity * unit_price;
      
      sub_total += amount;
      
      return {
        ...item,
        quantity,
        unit_price,
        amount
      };
    });

    // 3. Generate estimate number
    const estimateNumber = `EST-${Math.floor(1000 + Math.random() * 9000)}`;

    // 4. Insert quotation (for backwards compatibility, store key values)
    const registration_fee = processedItems.find(i => 
      i.description.toLowerCase().includes('registration')
    )?.amount || 0;
    
    const dailyRateItem = processedItems.find(i => 
      i.description.toLowerCase().includes('daily') || i.description.toLowerCase().includes('care rate')
    );
    const daily_rate = dailyRateItem?.unit_price || 0;
    const qty_days = dailyRateItem?.quantity || 1;
    
    const transport_fee = processedItems.find(i => 
      i.description.toLowerCase().includes('transport')
    )?.amount || 0;

    const quoteQuery = `
      INSERT INTO quotations (
        estimate_number, request_id, registration_fee, daily_rate, qty_days, transport_fee,
        sub_total, total_amount, terms_conditions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

    const quoteResult = await db.query(quoteQuery, [
      estimateNumber, request_id, registration_fee, daily_rate, qty_days, transport_fee,
      sub_total, sub_total, terms_conditions || 'The initial estimated amount is non-refundable.'
    ]);

    const quote_id = quoteResult.rows[0].quote_id;

    // 5. Insert line items
    for (const item of processedItems) {
      await db.query(`
        INSERT INTO quote_line_items (quote_id, item_type, description, quantity, unit_price, amount, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [quote_id, item.item_type, item.description, item.quantity, item.unit_price, item.amount, item.sort_order || 0]);
    }

    // 6. Return complete quote with line items
    const completeQuote = await db.query(`
      SELECT q.*, 
        json_agg(
          json_build_object(
            'line_item_id', li.line_item_id,
            'item_type', li.item_type,
            'description', li.description,
            'quantity', li.quantity,
            'unit_price', li.unit_price,
            'amount', li.amount,
            'sort_order', li.sort_order
          ) ORDER BY li.sort_order
        ) as line_items
      FROM quotations q
      LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
      WHERE q.quote_id = $1
      GROUP BY q.quote_id
    `, [quote_id]);

    res.status(201).json({
      status: 'success',
      data: completeQuote.rows[0]
    });

  } catch (error) {
    console.error('Modular Quote Error:', error);
    res.status(500).json({ message: 'Failed to generate quotation', error: error.message });
  }
};

exports.getQuoteWithLineItems = async (req, res) => {
  const { quote_id } = req.params;

  try {
    const result = await db.query(`
      SELECT q.*, s.payer_name, s.payer_mobile, s.patient_name, s.service_type,
        json_agg(
          json_build_object(
            'line_item_id', li.line_item_id,
            'item_type', li.item_type,
            'description', li.description,
            'quantity', li.quantity,
            'unit_price', li.unit_price,
            'amount', li.amount,
            'sort_order', li.sort_order
          ) ORDER BY li.sort_order
        ) as line_items
      FROM quotations q
      JOIN service_requests s ON q.request_id = s.request_id
      LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
      WHERE q.quote_id = $1
      GROUP BY q.quote_id, s.payer_name, s.payer_mobile, s.patient_name, s.service_type
    `, [quote_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    res.status(200).json({
      status: 'success',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Get Quote with Line Items Error:', error);
    res.status(500).json({ message: 'Failed to fetch quote' });
  }
};

exports.updateQuoteLineItems = async (req, res) => {
  const { quote_id } = req.params;
  const { line_items, terms_conditions } = req.body;

  try {
    // Start transaction
    await db.query('BEGIN');

    // 1. Delete existing line items
    await db.query('DELETE FROM quote_line_items WHERE quote_id = $1', [quote_id]);

    // 2. Recalculate and insert new line items
    let sub_total = 0;
    for (const item of line_items) {
      const quantity = parseFloat(item.quantity) || 1;
      const unit_price = parseFloat(item.unit_price) || 0;
      const amount = item.item_type === 'DISCOUNT' 
        ? -(Math.abs(quantity * unit_price))
        : quantity * unit_price;
      
      sub_total += amount;

      await db.query(`
        INSERT INTO quote_line_items (quote_id, item_type, description, quantity, unit_price, amount, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [quote_id, item.item_type, item.description, quantity, unit_price, amount, item.sort_order || 0]);
    }

    // 3. Update quotation totals
    await db.query(`
      UPDATE quotations 
      SET sub_total = $1, total_amount = $1, terms_conditions = $2, updated_at = CURRENT_TIMESTAMP
      WHERE quote_id = $3
    `, [sub_total, terms_conditions, quote_id]);

    await db.query('COMMIT');

    // 4. Return updated quote
    const result = await db.query(`
      SELECT q.*, 
        json_agg(
          json_build_object(
            'line_item_id', li.line_item_id,
            'item_type', li.item_type,
            'description', li.description,
            'quantity', li.quantity,
            'unit_price', li.unit_price,
            'amount', li.amount,
            'sort_order', li.sort_order
          ) ORDER BY li.sort_order
        ) as line_items
      FROM quotations q
      LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
      WHERE q.quote_id = $1
      GROUP BY q.quote_id
    `, [quote_id]);

    res.status(200).json({
      status: 'success',
      data: result.rows[0]
    });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Update Quote Error:', error);
    res.status(500).json({ message: 'Failed to update quote', error: error.message });
  }
};
```

### 2.2 Updated Routes (Add to `quoteRoutes.js`)

```javascript
const express = require('express');
const router = express.Router();
const quoteController = require('../controllers/quoteController');
const { authenticate } = require('../middleware/auth');

// Existing routes
router.post('/create', authenticate, quoteController.createQuotation);
router.get('/request/:requestId', authenticate, quoteController.getQuoteByRequest);
router.get('/client/:client_id', authenticate, quoteController.getClientQuotes);
router.post('/:quote_id/send-pdf', authenticate, quoteController.generateAndSendPDF);

// NEW: Preset item management (Admin only)
router.get('/presets', authenticate, quoteController.getPresetItems);
router.post('/presets', authenticate, quoteController.createPresetItem); // Admin only
router.put('/presets/:preset_id', authenticate, quoteController.updatePresetItem); // Admin only
router.delete('/presets/:preset_id', authenticate, quoteController.deletePresetItem); // Admin only

// NEW: Modular quote operations
router.post('/create-modular', authenticate, quoteController.createModularQuotation);
router.get('/:quote_id/details', authenticate, quoteController.getQuoteWithLineItems);
router.put('/:quote_id/line-items', authenticate, quoteController.updateQuoteLineItems);

module.exports = router;
```

---

## Phase 3: Frontend Components

### 3.1 Quote Builder Component Structure

```
frontend/src/components/quotes/
├── QuoteBuilder.jsx          # Main quote builder interface
├── QuoteLineItem.jsx         # Individual line item row
├── PresetItemSelector.jsx    # Dropdown to select preset items
├── QuoteSummary.jsx          # Total calculations display
└── PresetManager.jsx         # Admin interface for managing presets
```

### 3.2 QuoteBuilder Component Logic

```javascript
// QuoteBuilder.jsx - Key Concepts

const QuoteBuilder = ({ requestId, onQuoteCreated }) => {
  const [lineItems, setLineItems] = useState([]);
  const [presetItems, setPresetItems] = useState([]);
  const [termsConditions, setTermsConditions] = useState('');

  // Load preset items on mount
  useEffect(() => {
    fetchPresetItems();
  }, []);

  // Add preset item to quote
  const addPresetItem = (presetId) => {
    const preset = presetItems.find(p => p.preset_id === presetId);
    if (preset) {
      const newItem = {
        description: preset.name,
        item_type: preset.item_type,
        quantity: preset.default_quantity,
        unit_price: preset.default_unit_price,
        sort_order: lineItems.length
      };
      setLineItems([...lineItems, newItem]);
    }
  };

  // Add custom charge/discount
  const addCustomItem = (type) => {
    const newItem = {
      description: '',
      item_type: type, // 'CHARGE' or 'DISCOUNT'
      quantity: 1,
      unit_price: 0,
      sort_order: lineItems.length
    };
    setLineItems([...lineItems, newItem]);
  };

  // Calculate totals
  const calculateTotals = () => {
    let subtotal = 0;
    lineItems.forEach(item => {
      const amount = item.item_type === 'DISCOUNT'
        ? -(Math.abs(item.quantity * item.unit_price))
        : item.quantity * item.unit_price;
      subtotal += amount;
    });
    return { subtotal, total: subtotal };
  };

  // Submit quote
  const handleSubmit = async () => {
    const totals = calculateTotals();
    const quoteData = {
      request_id: requestId,
      line_items: lineItems,
      terms_conditions: termsConditions
    };
    
    const response = await fetch('/api/quotes/create-modular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quoteData)
    });
    
    const result = await response.json();
    onQuoteCreated(result.data);
  };

  return (
    <div className="quote-builder">
      {/* Preset Items Quick Add */}
      <PresetItemSelector 
        presets={presetItems} 
        onSelect={addPresetItem}
      />
      
      {/* Custom Item Buttons */}
      <button onClick={() => addCustomItem('CHARGE')}>Add Charge</button>
      <button onClick={() => addCustomItem('DISCOUNT')}>Add Discount</button>
      
      {/* Line Items Table */}
      {lineItems.map((item, index) => (
        <QuoteLineItem 
          key={index}
          item={item}
          index={index}
          onUpdate={(updated) => updateLineItem(index, updated)}
          onDelete={() => deleteLineItem(index)}
        />
      ))}
      
      {/* Summary */}
      <QuoteSummary totals={calculateTotals()} />
      
      {/* Submit */}
      <button onClick={handleSubmit}>Create Quotation</button>
    </div>
  );
};
```

---

## Phase 4: Migration Strategy

### 4.1 Backwards Compatibility

Keep existing `createQuotation` endpoint working while adding new modular endpoint:

```javascript
// Legacy endpoint - keep for backwards compatibility
exports.createQuotation = async (req, res) => {
  // Existing implementation unchanged
};

// New modular endpoint
exports.createModularQuotation = async (req, res) => {
  // New implementation
};
```

### 4.2 Data Migration Script

Create a one-time migration script to convert existing quotes:

```javascript
// migrate-existing-quotes.js
const migrateExistingQuotes = async () => {
  // Get all existing quotes
  const quotes = await db.query('SELECT * FROM quotations');
  
  for (const quote of quotes.rows) {
    // Create line items from existing quote data
    const lineItems = [];
    
    if (quote.registration_fee > 0) {
      lineItems.push({
        quote_id: quote.quote_id,
        item_type: 'CHARGE',
        description: 'Registration Fee',
        quantity: 1,
        unit_price: quote.registration_fee,
        amount: quote.registration_fee,
        sort_order: 1
      });
    }
    
    if (quote.daily_rate > 0 && quote.qty_days > 0) {
      lineItems.push({
        quote_id: quote.quote_id,
        item_type: 'CHARGE',
        description: 'Daily Care Rate',
        quantity: quote.qty_days,
        unit_price: quote.daily_rate,
        amount: quote.daily_rate * quote.qty_days,
        sort_order: 2
      });
    }
    
    if (quote.transport_fee > 0) {
      lineItems.push({
        quote_id: quote.quote_id,
        item_type: 'CHARGE',
        description: 'Transport Fee',
        quantity: 1,
        unit_price: quote.transport_fee,
        amount: quote.transport_fee,
        sort_order: 3
      });
    }
    
    // Insert line items
    for (const item of lineItems) {
      await db.query(`
        INSERT INTO quote_line_items 
        (quote_id, item_type, description, quantity, unit_price, amount, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [item.quote_id, item.item_type, item.description, item.quantity, item.unit_price, item.amount, item.sort_order]);
    }
  }
  
  console.log(`Migrated ${quotes.rows.length} quotes to new format`);
};
```

---

## Phase 5: Implementation Checklist

### Database Changes
- [ ] Add `quote_line_items` table to `migrate.js`
- [ ] Add `quote_preset_items` table to `migrate.js`
- [ ] Run migration on development database
- [ ] Seed default preset items (Registration Fee, Transport Fee, Daily Rate)

### Backend Changes
- [ ] Add new controller methods to `quoteController.js`
- [ ] Update `quoteRoutes.js` with new endpoints
- [ ] Add admin authorization middleware for preset management
- [ ] Test backwards compatibility with old endpoint

### Frontend Changes
- [ ] Create `QuoteBuilder` component
- [ ] Create `QuoteLineItem` component for editable rows
- [ ] Create `PresetItemSelector` component
- [ ] Update existing quote creation UI to use new builder
- [ ] Add Preset Manager page for admin users

### Testing
- [ ] Test creating quote with presets
- [ ] Test adding custom charges and discounts
- [ ] Test total calculations (especially negative amounts for discounts)
- [ ] Test updating existing quotes
- [ ] Test PDF generation with new line items format
- [ ] Test backwards compatibility

### Deployment
- [ ] Run database migration on production
- [ ] Run data migration script for existing quotes
- [ ] Deploy backend changes
- [ ] Deploy frontend changes

---

## API Endpoints Summary

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/quotes/presets` | Get all active preset items | Any |
| POST | `/api/quotes/presets` | Create new preset item | Admin |
| PUT | `/api/quotes/presets/:id` | Update preset item | Admin |
| DELETE | `/api/quotes/presets/:id` | Deactivate preset item | Admin |
| POST | `/api/quotes/create-modular` | Create new modular quote | Any |
| GET | `/api/quotes/:id/details` | Get quote with line items | Any |
| PUT | `/api/quotes/:id/line-items` | Update quote line items | Any |
| POST | `/api/quotes/create` | Legacy: Create simple quote | Any |

---

## Example Usage Flow

### 1. Admin Sets Up Preset Items (One-time setup)
```javascript
// Admin creates frequently used items
POST /api/quotes/presets
{
  "name": "Registration Fee",
  "item_type": "CHARGE",
  "description": "One-time registration fee",
  "default_quantity": 1,
  "default_unit_price": 10000,
  "sort_order": 1
}

POST /api/quotes/presets
{
  "name": "Transport Fee",
  "item_type": "CHARGE",
  "description": "Daily transport allowance",
  "default_quantity": 1,
  "default_unit_price": 1000,
  "sort_order": 3
}
```

### 2. Staff Creates Modular Quote
```javascript
// Fetch preset items
GET /api/quotes/presets
// Returns: [Registration Fee, Transport Fee, Daily Care Rate]

// Create quote with mix of presets and custom items
POST /api/quotes/create-modular
{
  "request_id": "uuid-here",
  "line_items": [
    { "description": "Registration Fee", "item_type": "CHARGE", "quantity": 1, "unit_price": 10000, "sort_order": 1 },
    { "description": "Nursing Daily Rate", "item_type": "CHARGE", "quantity": 14, "unit_price": 3500, "sort_order": 2 },
    { "description": "Transport Fee", "item_type": "CHARGE", "quantity": 14, "unit_price": 1000, "sort_order": 3 },
    { "description": "Corporate Discount", "item_type": "DISCOUNT", "quantity": 1, "unit_price": 5000, "sort_order": 4 }
  ],
  "terms_conditions": "Custom terms here"
}
// Total calculation: (10000 + 49000 + 14000) - 5000 = 68000
```

---

## Notes

1. **Discount Handling**: Discounts are stored with negative amounts. The frontend should display them as positive values with a "-" indicator.

2. **Backwards Compatibility**: The old `registration_fee`, `daily_rate`, `qty_days`, and `transport_fee` columns in the `quotations` table should remain for legacy support but will be derived from line items going forward.

3. **PDF Template Update**: The `estimateTemplate.js` needs to be updated to render line items dynamically instead of the fixed 3-row structure.

4. **Validation**: Add server-side validation to ensure at least one charge item exists (can't have only discounts).

5. **Sorting**: The `sort_order` field allows admins to reorder items before creating the quote.
