# Feature Specification: Order Tracking

## Requirements

**FR-001** The system MUST record an order status for every order.
The order status is one of: pending, paid, shipped, delivered, cancelled.

**FR-002** A customer MUST be able to see the current order status.

**FR-003** The system MUST emit an event on every order status transition.
