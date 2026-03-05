-- ============================================================
--  Retail Order & Inventory Management System
--  Database Schema  |  MySQL 8.0+
--  Created: 2026
-- ============================================================

CREATE DATABASE IF NOT EXISTS retail_ims CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE retail_ims;

-- ─── USERS & ROLES ───────────────────────────────────────────
CREATE TABLE roles (
    id          TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(30) NOT NULL UNIQUE,         -- admin | manager | staff | viewer
    permissions JSON         NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id            CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
    role_id       TINYINT UNSIGNED NOT NULL,
    first_name    VARCHAR(60)  NOT NULL,
    last_name     VARCHAR(60)  NOT NULL,
    email         VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login    TIMESTAMP    NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- ─── CATEGORIES & SUPPLIERS ──────────────────────────────────
CREATE TABLE categories (
    id          SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(80)  NOT NULL UNIQUE,
    slug        VARCHAR(80)  NOT NULL UNIQUE,
    description TEXT,
    parent_id   SMALLINT UNSIGNED NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_category_parent FOREIGN KEY (parent_id) REFERENCES categories(id)
);

CREATE TABLE suppliers (
    id            CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
    name          VARCHAR(120) NOT NULL,
    contact_name  VARCHAR(100),
    email         VARCHAR(120) UNIQUE,
    phone         VARCHAR(20),
    address       TEXT,
    city          VARCHAR(80),
    country       VARCHAR(60) DEFAULT 'India',
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── PRODUCTS & INVENTORY ────────────────────────────────────
CREATE TABLE products (
    id              CHAR(36)         NOT NULL PRIMARY KEY DEFAULT (UUID()),
    category_id     SMALLINT UNSIGNED NOT NULL,
    supplier_id     CHAR(36)         NULL,
    sku             VARCHAR(50)      NOT NULL UNIQUE,
    name            VARCHAR(200)     NOT NULL,
    description     TEXT,
    unit_price      DECIMAL(12,2)    NOT NULL,
    cost_price      DECIMAL(12,2)    NOT NULL,
    tax_rate        DECIMAL(5,2)     NOT NULL DEFAULT 18.00,  -- GST %
    unit            VARCHAR(20)      NOT NULL DEFAULT 'pcs',
    image_url       VARCHAR(500),
    is_active       BOOLEAN          NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_category FOREIGN KEY (category_id) REFERENCES categories(id),
    CONSTRAINT fk_product_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    INDEX idx_sku (sku),
    INDEX idx_product_category (category_id),
    FULLTEXT INDEX ft_product_search (name, description)
);

CREATE TABLE inventory (
    id                  CHAR(36)      NOT NULL PRIMARY KEY DEFAULT (UUID()),
    product_id          CHAR(36)      NOT NULL UNIQUE,
    quantity_on_hand    INT           NOT NULL DEFAULT 0,
    quantity_reserved   INT           NOT NULL DEFAULT 0,
    quantity_available  INT GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
    reorder_point       INT           NOT NULL DEFAULT 10,
    reorder_quantity    INT           NOT NULL DEFAULT 50,
    warehouse_location  VARCHAR(50),
    last_restock_at     TIMESTAMP     NULL,
    updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_low_stock (quantity_available, reorder_point)
);

CREATE TABLE inventory_transactions (
    id              CHAR(36)    NOT NULL PRIMARY KEY DEFAULT (UUID()),
    product_id      CHAR(36)    NOT NULL,
    user_id         CHAR(36)    NOT NULL,
    type            ENUM('PURCHASE','SALE','ADJUSTMENT','RETURN','TRANSFER') NOT NULL,
    quantity        INT         NOT NULL,    -- positive = IN, negative = OUT
    reference_id    CHAR(36),               -- order_id or purchase_order_id
    notes           TEXT,
    created_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invtx_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_invtx_user   FOREIGN KEY (user_id)    REFERENCES users(id),
    INDEX idx_invtx_product (product_id),
    INDEX idx_invtx_created (created_at)
);

-- ─── CUSTOMERS ───────────────────────────────────────────────
CREATE TABLE customers (
    id           CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
    first_name   VARCHAR(60)  NOT NULL,
    last_name    VARCHAR(60)  NOT NULL,
    email        VARCHAR(120) UNIQUE,
    phone        VARCHAR(20),
    address      TEXT,
    city         VARCHAR(80),
    state        VARCHAR(60),
    pincode      VARCHAR(10),
    tier         ENUM('STANDARD','SILVER','GOLD','PLATINUM') NOT NULL DEFAULT 'STANDARD',
    total_orders INT          NOT NULL DEFAULT 0,
    total_spent  DECIMAL(14,2) NOT NULL DEFAULT 0,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_customer_email (email),
    FULLTEXT INDEX ft_customer_search (first_name, last_name, email)
);

-- ─── ORDERS ──────────────────────────────────────────────────
CREATE TABLE orders (
    id              CHAR(36)       NOT NULL PRIMARY KEY DEFAULT (UUID()),
    order_number    VARCHAR(20)    NOT NULL UNIQUE,    -- ORD-2026-00001
    customer_id     CHAR(36)       NOT NULL,
    created_by      CHAR(36)       NOT NULL,
    status          ENUM('PENDING','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED')
                    NOT NULL DEFAULT 'PENDING',
    payment_status  ENUM('UNPAID','PARTIAL','PAID','REFUNDED') NOT NULL DEFAULT 'UNPAID',
    payment_method  ENUM('CASH','CARD','UPI','BANK_TRANSFER','COD') NOT NULL DEFAULT 'CASH',
    subtotal        DECIMAL(14,2)  NOT NULL DEFAULT 0,
    tax_amount      DECIMAL(12,2)  NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12,2)  NOT NULL DEFAULT 0,
    shipping_amount DECIMAL(10,2)  NOT NULL DEFAULT 0,
    total_amount    DECIMAL(14,2)  NOT NULL DEFAULT 0,
    shipping_address TEXT,
    notes           TEXT,
    shipped_at      TIMESTAMP      NULL,
    delivered_at    TIMESTAMP      NULL,
    created_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_customer   FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_order_created_by FOREIGN KEY (created_by)  REFERENCES users(id),
    INDEX idx_order_number  (order_number),
    INDEX idx_order_status  (status),
    INDEX idx_order_customer(customer_id),
    INDEX idx_order_created (created_at)
);

CREATE TABLE order_items (
    id           CHAR(36)      NOT NULL PRIMARY KEY DEFAULT (UUID()),
    order_id     CHAR(36)      NOT NULL,
    product_id   CHAR(36)      NOT NULL,
    quantity     INT           NOT NULL,
    unit_price   DECIMAL(12,2) NOT NULL,
    tax_rate     DECIMAL(5,2)  NOT NULL,
    discount_pct DECIMAL(5,2)  NOT NULL DEFAULT 0,
    line_total   DECIMAL(14,2) NOT NULL,
    CONSTRAINT fk_oi_order   FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
    CONSTRAINT fk_oi_product FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_oi_order   (order_id),
    INDEX idx_oi_product (product_id)
);

-- ─── VIEWS (optimized lookups) ───────────────────────────────
CREATE OR REPLACE VIEW v_products_with_inventory AS
SELECT
    p.id, p.sku, p.name, p.unit_price, p.cost_price, p.tax_rate, p.is_active,
    c.name AS category_name,
    s.name AS supplier_name,
    i.quantity_on_hand, i.quantity_reserved, i.quantity_available,
    i.reorder_point, i.warehouse_location,
    CASE WHEN i.quantity_available <= i.reorder_point THEN TRUE ELSE FALSE END AS is_low_stock
FROM products p
JOIN categories c    ON p.category_id = c.id
LEFT JOIN suppliers s ON p.supplier_id = s.id
LEFT JOIN inventory i ON p.id = i.product_id;

CREATE OR REPLACE VIEW v_order_summary AS
SELECT
    o.id, o.order_number, o.status, o.payment_status, o.total_amount, o.created_at,
    CONCAT(c.first_name, ' ', c.last_name) AS customer_name, c.email AS customer_email,
    CONCAT(u.first_name, ' ', u.last_name) AS created_by_name,
    COUNT(oi.id) AS item_count
FROM orders o
JOIN customers c    ON o.customer_id = c.id
JOIN users u        ON o.created_by  = u.id
LEFT JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id;

-- ─── STORED PROCEDURES ───────────────────────────────────────
DELIMITER $$

-- Auto-generate order number
CREATE PROCEDURE sp_next_order_number(OUT p_order_number VARCHAR(20))
BEGIN
    DECLARE v_count INT;
    SELECT COUNT(*) INTO v_count FROM orders WHERE YEAR(created_at) = YEAR(NOW());
    SET p_order_number = CONCAT('ORD-', YEAR(NOW()), '-', LPAD(v_count + 1, 5, '0'));
END$$

-- Place order and deduct inventory atomically
CREATE PROCEDURE sp_place_order(
    IN p_order_id   CHAR(36),
    IN p_product_id CHAR(36),
    IN p_qty        INT,
    OUT p_success   BOOLEAN,
    OUT p_message   VARCHAR(200)
)
BEGIN
    DECLARE v_available INT DEFAULT 0;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_success = FALSE;
        SET p_message = 'Transaction failed due to a database error.';
    END;

    START TRANSACTION;
        SELECT quantity_available INTO v_available
        FROM inventory WHERE product_id = p_product_id FOR UPDATE;

        IF v_available >= p_qty THEN
            UPDATE inventory
               SET quantity_reserved = quantity_reserved + p_qty
             WHERE product_id = p_product_id;
            SET p_success = TRUE;
            SET p_message = 'Stock reserved successfully.';
        ELSE
            SET p_success = FALSE;
            SET p_message = CONCAT('Insufficient stock. Available: ', v_available);
        END IF;
    COMMIT;
END$$

DELIMITER ;

-- ─── SEED DATA ───────────────────────────────────────────────
INSERT INTO roles (name, permissions) VALUES
('admin',   '{"all": true}'),
('manager', '{"products":"rw","orders":"rw","inventory":"rw","customers":"rw","users":"r"}'),
('staff',   '{"products":"r","orders":"rw","customers":"rw"}'),
('viewer',  '{"products":"r","orders":"r","inventory":"r","customers":"r"}');

INSERT INTO categories (name, slug, description) VALUES
('Electronics',      'electronics',      'Consumer electronics and gadgets'),
('Clothing',         'clothing',         'Apparel and fashion items'),
('Home & Kitchen',   'home-kitchen',     'Home decor and kitchen utilities'),
('Sports & Fitness', 'sports-fitness',   'Sporting goods and fitness equipment'),
('Books',            'books',            'Books and educational material');
