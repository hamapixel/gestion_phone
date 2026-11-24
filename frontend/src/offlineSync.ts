import type { OfflineSalePayload, PendingSale } from './offlineVault';

export type SaleReply = { sale?: { id: string; reference: string }; detail?: string; replayed?: boolean };
export type SyncSummary = { confirmed: SaleReply['sale'][]; conflicts: number; paused: string };

export async function syncPendingSales(
  entries: PendingSale[],
  send: (payload: OfflineSalePayload) => Promise<Response>,
  onConfirmed: (entry: PendingSale, reply: SaleReply) => Promise<void>,
  onConflict: (entry: PendingSale, detail: string) => Promise<void>,
): Promise<SyncSummary> {
  const result: SyncSummary = { confirmed: [], conflicts: 0, paused: '' };
  for (const entry of entries) {
    if (entry.status !== 'pending') continue;
    let response: Response;
    try {
      response = await send(entry.payload); // Stable client_ref, unchanged payload.
    } catch {
      result.paused = 'Connexion interrompue. Les ventes restantes sont conservées pour la prochaine tentative.';
      break;
    }
    let data: SaleReply;
    try {
      data = await response.json() as SaleReply;
    } catch {
      result.paused = 'Réponse serveur illisible. Réessaie sans modifier les ventes en attente.';
      break;
    }
    if (response.ok && data.sale?.id) {
      await onConfirmed(entry, data);
      result.confirmed.push(data.sale);
    } else if (response.status === 400 || response.status === 409) {
      await onConflict(entry, data.detail || 'Vente refusée : vérifie les stocks, prix et IMEI.');
      result.conflicts++;
    } else if (response.status === 401 || response.status === 403) {
      result.paused = 'Session expirée. Connecte-toi au propriétaire avant de synchroniser.';
      break;
    } else {
      result.paused = 'Serveur indisponible. Le brouillon est conservé pour une nouvelle tentative.';
      break;
    }
  }
  return result;
}
