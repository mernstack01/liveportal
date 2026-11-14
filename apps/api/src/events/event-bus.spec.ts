import { describe, expect, it, vi } from 'vitest';
import type { Event, Prisma } from '../generated/prisma/client.js';
import { EventBus } from './event-bus.js';

const event = (type: string) => ({ id: 'e1', type, entityType: 'task', entityId: 't1' }) as Event;
const tx = {} as Prisma.TransactionClient;

describe('EventBus', () => {
  it('turi mos obunachilarni va * obunachilarni chaqiradi', async () => {
    const bus = new EventBus();
    const exact = vi.fn();
    const all = vi.fn();
    const other = vi.fn();
    bus.subscribe('task.created', 'exact', exact);
    bus.subscribe('*', 'all', all);
    bus.subscribe('task.assigned', 'other', other);

    await bus.dispatch(event('task.created'), tx);
    expect(exact).toHaveBeenCalledOnce();
    expect(all).toHaveBeenCalledOnce();
    expect(other).not.toHaveBeenCalled();
  });

  it('bitta obunachi xato bersa, qolganlari baribir ishlaydi', async () => {
    const bus = new EventBus();
    const after = vi.fn();
    bus.subscribe('*', 'buzuq', () => {
      throw new Error('kutilgan xato');
    });
    bus.subscribe('*', 'sog', after);

    await expect(bus.dispatch(event('task.created'), tx)).resolves.toBe(1);
    expect(after).toHaveBeenCalledOnce();
  });
});
