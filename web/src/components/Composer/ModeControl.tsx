import { Hand, Map, Pencil, ShieldOff, Sparkles } from 'lucide-react';
import { ComponentProps, ReactNode, useEffect } from 'react';
import type { Mode } from '../../../../shared/protocol';
import { isTerminalKey, send, useStore } from '../../store';
import Select from '../ui/Select';

type Toon = ComponentProps<typeof Select>['toon'];

const MODES: Record<string, { label: string; icon: ReactNode; tone: Toon }> = {
  default: { label: 'Vragen', icon: <Hand size={13} />, tone: 'neutraal' },
  acceptEdits: { label: 'Wijzigingen accepteren', icon: <Pencil size={13} />, tone: 'accent' },
  plan: { label: 'Plan', icon: <Map size={13} />, tone: 'positief' },
  auto: { label: 'Auto', icon: <Sparkles size={13} />, tone: 'waarschuwing' },
  bypassPermissions: { label: 'Alles toestaan', icon: <ShieldOff size={13} />, tone: 'negatief' },
  dontAsk: { label: 'Niet vragen', icon: <Hand size={13} />, tone: 'neutraal' },
};

// Zelfde volgorde als Shift+Tab in Claude Code; 'Alles toestaan' alleen via de lijst.
const CYCLE: Mode[] = ['default', 'acceptEdits', 'plan', 'auto'];

const ModeControl = () => {
  const mode = (useStore((s) => s.permissionMode) ?? 'default') as Mode;

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && !isTerminalKey(event)) {
        event.preventDefault();
        const next = CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length];
        send({ type: 'set_mode', mode: next });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode]);

  const current = MODES[mode] ?? MODES.default;

  return (
    <Select
      title="Permissiemodus (Shift+Tab om te wisselen)"
      toon={current.tone}
      label={
        <>
          {current.icon}
          {current.label}
        </>
      }
      value={mode}
      options={[...CYCLE, 'bypassPermissions' as Mode].map((m) => ({
        value: m,
        label: MODES[m].label,
        hint: m === 'bypassPermissions' ? 'geen vragen' : undefined,
      }))}
      onChange={(value) => send({ type: 'set_mode', mode: value as Mode })}
    />
  );
};

export default ModeControl;
