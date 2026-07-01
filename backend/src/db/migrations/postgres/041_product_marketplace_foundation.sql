ALTER TABLE barbers ADD COLUMN IF NOT EXISTS marketplace_mode TEXT NOT NULL DEFAULT 'service';
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS cover_image_url TEXT DEFAULT '';
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS business_hours_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS delivery_available INTEGER NOT NULL DEFAULT 0;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS pickup_available INTEGER NOT NULL DEFAULT 1;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS delivery_areas_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS delivery_fee REAL DEFAULT NULL;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS delivery_notes TEXT DEFAULT '';

UPDATE barbers
SET marketplace_mode = CASE
  WHEN LOWER(TRIM(COALESCE(marketplace_mode, ''))) IN ('service', 'product', 'hybrid')
    THEN LOWER(TRIM(marketplace_mode))
  ELSE 'service'
END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'barbers_marketplace_mode_check'
  ) THEN
    ALTER TABLE barbers
      ADD CONSTRAINT barbers_marketplace_mode_check
      CHECK (marketplace_mode IN ('service', 'product', 'hybrid'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  stand_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  subcategory TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
  sale_price REAL DEFAULT NULL CHECK (sale_price IS NULL OR sale_price >= 0),
  currency TEXT NOT NULL DEFAULT 'UGX',
  stock_status TEXT NOT NULL DEFAULT 'in_stock'
    CHECK (stock_status IN ('in_stock', 'out_of_stock', 'limited', 'hidden')),
  quantity_available INTEGER DEFAULT NULL CHECK (quantity_available IS NULL OR quantity_available >= 0),
  options_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  stand_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE RESTRICT,
  seller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'confirmed', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled')),
  fulfilment_method TEXT NOT NULL
    CHECK (fulfilment_method IN ('pickup', 'delivery')),
  customer_name TEXT DEFAULT '',
  customer_phone TEXT NOT NULL,
  delivery_area TEXT DEFAULT '',
  delivery_address TEXT DEFAULT '',
  customer_note TEXT DEFAULT '',
  seller_note TEXT DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  delivery_fee REAL NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
  currency TEXT NOT NULL DEFAULT 'UGX',
  idempotency_key TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES product_orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name_snapshot TEXT NOT NULL,
  product_price_snapshot REAL NOT NULL DEFAULT 0,
  product_image_snapshot TEXT DEFAULT '',
  selected_options_json TEXT NOT NULL DEFAULT '{}',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  line_total REAL NOT NULL DEFAULT 0 CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS product_order_events (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES product_orders(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  old_status TEXT DEFAULT '',
  new_status TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_inquiries (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  stand_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'responded', 'closed')),
  idempotency_key TEXT DEFAULT '',
  conversation_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_stand_active
  ON products(stand_id, is_deleted, is_active, created_at);
CREATE INDEX IF NOT EXISTS idx_products_category_stock
  ON products(category, stock_status, is_deleted, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_products_stand_slug
  ON products(stand_id, slug)
  WHERE slug <> '' AND is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_product_images_product
  ON product_images(product_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_product_orders_seller
  ON product_orders(seller_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_product_orders_customer
  ON product_orders(customer_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_product_orders_customer_idempotency
  ON product_orders(customer_id, idempotency_key)
  WHERE idempotency_key <> '';
CREATE INDEX IF NOT EXISTS idx_product_order_items_order
  ON product_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_product_order_events_order
  ON product_order_events(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_product_inquiries_seller
  ON product_inquiries(seller_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_product_inquiries_customer
  ON product_inquiries(customer_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_product_inquiries_customer_idempotency
  ON product_inquiries(customer_id, idempotency_key)
  WHERE idempotency_key <> '';
