import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Printer, X } from 'lucide-react';
import type { Shop } from './ShopSettings';

type Size = 'a4' | 'a5' | 'ticket';
type Line = {
  product_name: string; brand: string; model: string; condition: string;
  quantity: number; imei: string; unit_price: string; total: string;
};
type Sale = {
  id: string; reference: string; created_at: string;
  customer_name: string; customer_phone: string; due_date: string | null;
  total: string; amount_paid: string; balance: string; method: string; lines: Line[];
};
type Payment = {
  id: string; reference: string; created_at: string; amount: string;
  method: string; balance_after: string;
};
type Document = { kind: 'invoice' | 'payment'; shop: Shop; sale: Sale; payment?: Payment };
type Props = { saleId?: string; paymentId?: string; onClose: () => void };
const amount = (value: string | number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(value)) + ' FCFA';
const dateLabel = (value: string) => new Date(value).toLocaleString('fr-FR');
const methods: Record<string, string> = {
  cash: 'Espèces', orange: 'Orange Money', moov: 'Moov Money', transfer: 'Virement',
};
function itemLabel(item: Line) {
  const parts = [item.product_name];
  if (item.brand && !item.product_name.toLocaleLowerCase('fr').includes(item.brand.toLocaleLowerCase('fr'))) {
    parts.push(item.brand);
  }
  if (item.model && !item.product_name.toLocaleLowerCase('fr').includes(item.model.toLocaleLowerCase('fr'))) {
    parts.push(item.model);
  }
  return parts.join(' · ');
}

export default function InvoiceModal({ saleId, paymentId, onClose }: Props) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [error, setError] = useState('');
  const [size, setSize] = useState<Size>('a4');
  useEffect(() => {
    const controller = new AbortController();
    const path = paymentId ? '/api/payments/' + paymentId + '/receipt/' :
      '/api/sales/' + saleId + '/invoice/';
    fetch(path, { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as Document & { detail?: string };
        if (!response.ok) throw new Error(data.detail || 'Document introuvable.');
        if (!controller.signal.aborted) setDoc(data);
      }).catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Document indisponible.');
      });
    return () => controller.abort();
  }, [paymentId, saleId]);

  function print() {
    if (!doc) return;
    window.print(); // Browser printer selection also offers "Save as PDF".
  }
  const title = doc?.kind === 'payment' ? 'Reçu de versement' : 'Facture de vente';

  return createPortal(
    <div className="invoice-overlay" role="presentation">
      <section className="invoice-dialog" role="dialog" aria-modal="true" aria-labelledby="invoice-modal-title">
        <div className="invoice-toolbar">
          <div><h2 id="invoice-modal-title"><FileText size={20}/> {title}</h2><p>Aperçu et impression</p></div>
          <div className="invoice-toolbar-actions">
            <div className="invoice-size-switch" role="group" aria-label="Format d’impression">
              {([['a4','A4'], ['a5','A5'], ['ticket','Ticket 80 mm']] as const).map(([key,label]) => (
                <button key={key} type="button" className={size === key ? 'selected' : ''}
                  onClick={() => setSize(key)}>{label}</button>
              ))}
            </div>
            <button className="invoice-print-btn" disabled={!doc} onClick={print}><Printer size={16}/> Imprimer / PDF</button>
            <button className="catalog-close" aria-label="Fermer" onClick={onClose}><X size={19}/></button>
          </div>
        </div>
        {error && <p role="alert" className="catalog-error">{error}</p>}
        {!doc && !error && <p className="catalog-empty">Chargement du document…</p>}
        {doc && (
          <article className={'invoice-paper invoice-paper--' + size}>
            <header className="invoice-heading">
              <div className="invoice-shop">
                {doc.shop.logo_data && <img src={doc.shop.logo_data} alt="Logo de la boutique" />}
                <div>
                  <h3>{doc.shop.name}</h3>
                  {doc.shop.address && <p>{doc.shop.address}</p>}
                  {doc.shop.phone && <p>Tél. {doc.shop.phone}</p>}
                  {doc.shop.email && <p>{doc.shop.email}</p>}
                  {doc.shop.tax_id && <p>{doc.shop.tax_id}</p>}
                </div>
              </div>
            </header>
            <div className="invoice-title">
              <strong>{title.toUpperCase()}</strong>
              <span>{doc.kind === 'payment' ? doc.payment?.reference : doc.sale.reference}</span>
              <small>{dateLabel(doc.kind === 'payment' ? doc.payment!.created_at : doc.sale.created_at)}</small>
            </div>
            <div className="invoice-customer">
              <strong>Client</strong>
              <p>{doc.sale.customer_name || 'Client comptant'}</p>
              {doc.sale.customer_phone && <p>{doc.sale.customer_phone}</p>}
            </div>
            {doc.kind === 'invoice' ? (
              <>
                <table className="invoice-table">
                  <thead><tr><th>Article</th><th>Qté</th><th>Prix U.</th><th>Total</th></tr></thead>
                  <tbody>{doc.sale.lines.map((line, index) => (
                    <tr key={index}>
                      <td>{itemLabel(line)}{line.imei && <small>IMEI : {line.imei}</small>}
                        {line.condition === 'used' && <small>Occasion</small>}</td>
                      <td>{line.quantity}</td>
                      <td>{amount(line.unit_price)}</td>
                      <td>{amount(line.total)}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <div className="invoice-totals">
                  <div><span>Total facture</span><strong>{amount(doc.sale.total)}</strong></div>
                  <div><span>Versé à ce jour</span><strong>{amount(doc.sale.amount_paid)}</strong></div>
                  <div className="invoice-balance"><span>Reste à payer</span><strong>{amount(doc.sale.balance)}</strong></div>
                  {Number(doc.sale.balance) > 0 && doc.sale.due_date &&
                    <small>Échéance : {new Date(doc.sale.due_date + 'T00:00:00').toLocaleDateString('fr-FR')}</small>}
                </div>
              </>
            ) : (
              <div className="invoice-receipt-details">
                <div><span>Vente</span><strong>{doc.sale.reference}</strong></div>
                <div><span>Montant reçu</span><strong>{amount(doc.payment!.amount)}</strong></div>
                <div><span>Mode de paiement</span><strong>{methods[doc.payment!.method] || doc.payment!.method}</strong></div>
                <div><span>Reste après versement</span><strong>{amount(doc.payment!.balance_after)}</strong></div>
              </div>
            )}
            <footer className="invoice-footer">{doc.shop.footer || 'Merci pour votre confiance.'}</footer>
          </article>
        )}
      </section>
    </div>,
    document.body,
  );
}
