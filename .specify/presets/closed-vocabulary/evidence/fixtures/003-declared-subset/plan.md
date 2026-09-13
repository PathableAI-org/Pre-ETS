# Implementation Plan: Shipment View

## Data model

The shipment view filters `Order.status`. It declares no enum of its own: the
subset relation is stated in the specification, so the difference is intended
rather than a divergence.
