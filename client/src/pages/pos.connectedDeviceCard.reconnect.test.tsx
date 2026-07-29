// @vitest-environment jsdom
// ─── ConnectedDeviceCard — Reconnecting Banner Tests ──────────────────────────
//
// Confirms that:
//   - The 'Reconnecting…' banner (and Loader2 spinner) is visible when the
//     device status is 'connecting'
//   - The banner disappears and the green 'Connected' dot is shown when
//     status transitions to 'connected'
//   - The status dot colour class changes correctly across both transitions

import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// ── Toast mock (ConnectedDeviceCard calls useToast internally) ─────────────────

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Tooltip mock — avoids Radix UI / portal issues in jsdom ──────────────────

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip:         ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger:  ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent:  () => null,
}));

import { ConnectedDeviceCard } from './pos';
import type { DeviceState, DeviceType } from '@/hooks/useHardwareDevices';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDevice(status: DeviceState['status'], deviceName = 'Test Printer'): DeviceState {
  return { status, port: null, deviceName, baudRate: 9600 };
}

function renderCard(device: DeviceState, type: DeviceType = 'printer') {
  return render(
    <ConnectedDeviceCard
      type={type}
      device={device}
      onRemove={vi.fn()}
      onTestPrint={async () => {}}
      onOpenDrawer={async () => {}}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConnectedDeviceCard — Reconnecting… banner', () => {

  it('shows the Reconnecting… banner when status is "connecting"', () => {
    renderCard(makeDevice('connecting'));

    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
  });

  it('renders a spinner (animate-spin) inside the banner when connecting', () => {
    const { container } = renderCard(makeDevice('connecting'));

    // The Loader2 icon carries the animate-spin class
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
  });

  it('hides the Reconnecting… banner after status transitions to "connected"', () => {
    const { rerender } = renderCard(makeDevice('connecting'));

    // Banner must be visible first
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();

    // Simulate cable replugged → status flips to 'connected'
    rerender(
      <ConnectedDeviceCard
        type="printer"
        device={makeDevice('connected')}
        onRemove={vi.fn()}
        onTestPrint={async () => {}}
        onOpenDrawer={async () => {}}
      />,
    );

    expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();
  });

  it('no spinner remains after status transitions to "connected"', () => {
    const { rerender, container } = renderCard(makeDevice('connecting'));

    // Spinner present while connecting
    expect(container.querySelector('.animate-spin')).not.toBeNull();

    rerender(
      <ConnectedDeviceCard
        type="printer"
        device={makeDevice('connected')}
        onRemove={vi.fn()}
        onTestPrint={async () => {}}
        onOpenDrawer={async () => {}}
      />,
    );

    // No animate-spin class should remain anywhere in the card
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('status dot has yellow/pulse class when connecting', () => {
    const { container } = renderCard(makeDevice('connecting'));

    // The status dot is a small rounded-full span; it should carry the yellow
    // pulse classes when the device is reconnecting.
    const dot = container.querySelector('span.rounded-full');
    expect(dot).not.toBeNull();
    expect(dot!.className).toContain('bg-yellow-400');
    expect(dot!.className).toContain('animate-pulse');
  });

  it('status dot switches to green after status transitions to "connected"', () => {
    const { rerender, container } = renderCard(makeDevice('connecting'));

    rerender(
      <ConnectedDeviceCard
        type="printer"
        device={makeDevice('connected')}
        onRemove={vi.fn()}
        onTestPrint={async () => {}}
        onOpenDrawer={async () => {}}
      />,
    );

    const dot = container.querySelector('span.rounded-full');
    expect(dot).not.toBeNull();
    expect(dot!.className).toContain('bg-green-500');
    expect(dot!.className).not.toContain('bg-yellow-400');
    expect(dot!.className).not.toContain('animate-pulse');
  });

  it('banner reappears on second disconnect after first reconnect succeeded', () => {
    const { rerender, container } = renderCard(makeDevice('connecting'));

    // ── First connecting phase ──────────────────────────────────────────────
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).not.toBeNull();

    // ── First reconnect succeeds ────────────────────────────────────────────
    rerender(
      <ConnectedDeviceCard
        type="printer"
        device={makeDevice('connected')}
        onRemove={vi.fn()}
        onTestPrint={async () => {}}
        onOpenDrawer={async () => {}}
      />,
    );

    expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeNull();

    // ── Second disconnect — banner must reappear ────────────────────────────
    rerender(
      <ConnectedDeviceCard
        type="printer"
        device={makeDevice('connecting')}
        onRemove={vi.fn()}
        onTestPrint={async () => {}}
        onOpenDrawer={async () => {}}
      />,
    );

    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('spinner is present in both connecting phases of connect → reconnect cycle', () => {
    const { rerender, container } = renderCard(makeDevice('connecting'));

    // First connecting phase — spinner visible
    expect(container.querySelector('.animate-spin')).not.toBeNull();

    // Reconnected
    rerender(
      <ConnectedDeviceCard
        type="printer"
        device={makeDevice('connected')}
        onRemove={vi.fn()}
        onTestPrint={async () => {}}
        onOpenDrawer={async () => {}}
      />,
    );
    expect(container.querySelector('.animate-spin')).toBeNull();

    // Second connecting phase — spinner must be back
    rerender(
      <ConnectedDeviceCard
        type="printer"
        device={makeDevice('connecting')}
        onRemove={vi.fn()}
        onTestPrint={async () => {}}
        onOpenDrawer={async () => {}}
      />,
    );
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('works the same for terminal and labelPrinter device types', () => {
    for (const type of ['terminal', 'labelPrinter'] as const) {
      const { rerender, container, unmount } = render(
        <ConnectedDeviceCard
          type={type}
          device={makeDevice('connecting')}
          onRemove={vi.fn()}
        />,
      );

      expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      expect(container.querySelector('.animate-spin')).not.toBeNull();

      rerender(
        <ConnectedDeviceCard
          type={type}
          device={makeDevice('connected')}
          onRemove={vi.fn()}
        />,
      );

      expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();
      expect(container.querySelector('.animate-spin')).toBeNull();

      unmount();
    }
  });
});
