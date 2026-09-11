import type React from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders viewport-bound UI outside the application shell.  This prevents a
 * flex/transform/contain context in an individual workspace from turning a
 * fixed modal or drawer into a panel-relative overlay.
 */
export const ViewportOverlay = ({ children }: { children: React.ReactNode }) => createPortal(children, document.body);
