import { Injectable, Logger } from '@nestjs/common';
import { BookingProvider } from '@prisma/client';
import { CryptoService } from '../common/crypto/crypto.service';
import { ConnectorRegistry } from '../connectors/connector-registry';
import { PrismaService } from '../prisma/prisma.service';

export interface LinkResult {
  provider: BookingProvider;
  status: 'LINKED' | 'ALREADY_LINKED' | 'NOT_FOUND' | 'TAKEN' | 'UNAVAILABLE';
}

/**
 * Liaison du compte GPR avec le compte du joueur chez Playtomic / Doinsport (par email ou téléphone).
 * Pas de rétroactivité : seules les parties terminées après la liaison rapportent des points GPR.
 */
@Injectable()
export class AccountLinkService {
  private readonly logger = new Logger(AccountLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ConnectorRegistry,
    private readonly crypto: CryptoService,
  ) {}

  links(userId: string) {
    return this.prisma.playerExternalLink.findMany({
      where: { userId },
      select: { provider: true, linkedAt: true },
      orderBy: { linkedAt: 'asc' },
    });
  }

  async link(userId: string): Promise<LinkResult[]> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // Tous les clubs actifs, regroupés par fournisseur : si la configuration d'un club est
    // en erreur, on essaie celle d'un autre club du même fournisseur.
    const configs = await this.prisma.clubConnectorConfig.findMany({
      where: { club: { isActive: true } },
    });
    const byProvider = new Map<BookingProvider, typeof configs>();
    for (const c of configs) byProvider.set(c.provider, [...(byProvider.get(c.provider) ?? []), c]);

    const results: LinkResult[] = [];
    for (const [provider, list] of byProvider) {
      results.push({ provider, status: await this.linkProvider(userId, provider, list, user) });
    }
    return results;
  }

  private async linkProvider(
    userId: string,
    provider: BookingProvider,
    configs: { externalClubId: string; credentialsEncrypted: string | null }[],
    user: { email: string; phone: string | null },
  ): Promise<LinkResult['status']> {
    if (await this.prisma.playerExternalLink.findFirst({ where: { userId, provider } }))
      return 'ALREADY_LINKED';

    for (const cfg of configs) {
      let ref;
      try {
        ref = await this.registry.get(provider).matchPlayer(
          {
            externalClubId: cfg.externalClubId,
            credentials: cfg.credentialsEncrypted
              ? this.crypto.decryptJson(cfg.credentialsEncrypted)
              : {},
          },
          { email: user.email, phone: user.phone ?? undefined },
        );
      } catch (e) {
        this.logger.warn(
          `Liaison ${provider} via ${cfg.externalClubId} impossible : ${(e as Error).message}`,
        );
        continue; // configuration suivante
      }
      if (!ref) return 'NOT_FOUND';

      const owner = await this.prisma.playerExternalLink.findUnique({
        where: {
          provider_externalPlayerId: {
            provider: ref.provider,
            externalPlayerId: ref.externalPlayerId,
          },
        },
      });
      // Déjà lié à un autre compte GPR : jamais de transfert automatique.
      if (owner) return owner.userId === userId ? 'ALREADY_LINKED' : 'TAKEN';
      await this.prisma.playerExternalLink.create({
        data: { userId, provider: ref.provider, externalPlayerId: ref.externalPlayerId },
      });
      return 'LINKED';
    }
    return 'UNAVAILABLE';
  }
}
