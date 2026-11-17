import { Injectable } from '@nestjs/common';
import type { BookingProvider } from '@prisma/client';
import {
  BookingConnector,
  DoinsportConnector,
  MockConnector,
  PlaytomicConnector,
} from '@gpr/connectors';

/** Fournit l'adaptateur correspondant au fournisseur configuré pour un club. */
@Injectable()
export class ConnectorRegistry {
  private readonly connectors: Record<BookingProvider, BookingConnector> = {
    MOCK: new MockConnector(),
    PLAYTOMIC: new PlaytomicConnector(),
    DOINSPORT: new DoinsportConnector(),
  };

  get(provider: BookingProvider): BookingConnector {
    return this.connectors[provider];
  }
}
