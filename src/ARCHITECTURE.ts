/**
 * HEADROOM — Architecture Index
 * Phase 002: Directory structure documentation
 *
 * This file documents the intended layered architecture.
 * Each layer is implemented in its own directory.
 * Layers only depend downward — never upward.
 *
 * LAYER DEPENDENCY ORDER (top → bottom):
 *
 *   VS Code Integration  (extension.ts, core/)
 *          ↓
 *   Application Layer    (application/)
 *          ↓
 *   Domain Layer         (domain/)
 *          ↓
 *   Infrastructure       (infrastructure/)
 *          ↓
 *   Storage              (storage/)
 *
 * AGENT HIERARCHY (implemented in domain/ and application/):
 *
 *   CEO (human, interacts via VS Code UI)
 *          ↓
 *   AI Director          (domain/director/)
 *          ↓
 *   Office Head Manager  (domain/offices/)
 *          ↓
 *   Department Manager   (domain/departments/)
 *          ↓
 *   AI Employee          (domain/employees/)
 *
 * See individual directory README files for layer-specific guidance.
 */

export const ARCHITECTURE_VERSION = '0.1.0';
export const ARCHITECTURE_PHASE = 2;
