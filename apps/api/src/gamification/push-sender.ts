import { Injectable, Logger } from '@nestjs/common';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Envoi des notifications push. Implémentation choisie par PUSH_PROVIDER (log | expo). */
export abstract class PushSender {
  abstract send(messages: PushMessage[]): Promise<void>;
}

/** Développement / tests : journalise au lieu d'envoyer. */
@Injectable()
export class LogPushSender extends PushSender {
  private readonly logger = new Logger('Push');
  readonly sent: PushMessage[] = [];

  async send(messages: PushMessage[]): Promise<void> {
    this.sent.push(...messages);
    for (const m of messages) this.logger.log(`[simulé] ${m.title} — ${m.body}`);
  }
}

/**
 * Service push d'Expo (production). Nécessite un projet EAS configuré avec les
 * identifiants Apple (APNs) et Google (FCM) du GPR.
 * Format documenté par Expo : POST https://exp.host/--/api/v2/push/send, par lots de 100.
 */
@Injectable()
export class ExpoPushSender extends PushSender {
  private readonly logger = new Logger('Push');

  async send(messages: PushMessage[]): Promise<void> {
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100).map((m) => ({ ...m, sound: 'default' }));
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!res.ok) this.logger.error(`Envoi push en échec (${res.status})`);
    }
  }
}
