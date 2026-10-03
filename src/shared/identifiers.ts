/** Branded identifier types shared by the pure domain and storage adapters. */
export type EntityId = string & { readonly __entityId: unique symbol };
export type Slug = string & { readonly __slug: unique symbol };
