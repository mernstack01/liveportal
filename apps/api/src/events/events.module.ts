import { Global, Module } from '@nestjs/common';
import { EventBus } from './event-bus.js';
import { OutboxDispatcher } from './outbox.dispatcher.js';

/** Global: har modul EventBus'ga obuna bo'la oladi. */
@Global()
@Module({
  providers: [EventBus, OutboxDispatcher],
  exports: [EventBus, OutboxDispatcher],
})
export class EventsModule {}
