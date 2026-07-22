import { getUncachableSendGridClient } from './sendgridIntegration';
import { db } from './db';
import { sql } from 'drizzle-orm';

const fmt = (n: number) => `$${Number(n).toFixed(2)}`;
const pct = (n: number, total: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%';

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', credit: 'Credit / Card', charge_account: 'Charge Account', online: 'Online (Stripe)',
};

function periodLabel(type: 'monthly' | 'yearly', startDate: string, endDate: string) {
  if (type === 'monthly') {
    const d = new Date(startDate + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return startDate.slice(0, 4);
}

async function querySalesData(startDate: string, endDate: string) {
  const [totals, byChannel, byMethod, byCategory] = await Promise.all([
    db.execute(sql`
      WITH all_sales AS (
        SELECT subtotal::numeric, tax::numeric, total::numeric, payment_method, created_at, 'pos' AS channel
        FROM pos_orders
        WHERE created_at::date >= ${startDate}::date AND created_at::date <= ${endDate}::date
        UNION ALL
        SELECT COALESCE(subtotal::numeric,0), COALESCE(tax_amount::numeric,0),
               COALESCE(total_amount::numeric,0), 'online', order_date
        FROM orders
        WHERE payment_status = 'paid'
          AND order_date::date >= ${startDate}::date AND order_date::date <= ${endDate}::date
      )
      SELECT COUNT(*) AS order_count,
             COALESCE(SUM(subtotal),0) AS subtotal,
             COALESCE(SUM(tax),0) AS tax,
             COALESCE(SUM(total),0) AS total
      FROM all_sales
    `),
    db.execute(sql`
      WITH all_sales AS (
        SELECT total::numeric, 'pos' AS channel
        FROM pos_orders
        WHERE created_at::date >= ${startDate}::date AND created_at::date <= ${endDate}::date
        UNION ALL
        SELECT COALESCE(total_amount::numeric,0), 'online'
        FROM orders
        WHERE payment_status = 'paid'
          AND order_date::date >= ${startDate}::date AND order_date::date <= ${endDate}::date
      )
      SELECT channel, COUNT(*) AS order_count, COALESCE(SUM(total),0) AS total
      FROM all_sales GROUP BY channel ORDER BY channel
    `),
    db.execute(sql`
      WITH all_sales AS (
        SELECT total::numeric, payment_method
        FROM pos_orders
        WHERE created_at::date >= ${startDate}::date AND created_at::date <= ${endDate}::date
        UNION ALL
        SELECT COALESCE(total_amount::numeric,0), 'online'
        FROM orders
        WHERE payment_status = 'paid'
          AND order_date::date >= ${startDate}::date AND order_date::date <= ${endDate}::date
      )
      SELECT payment_method, COUNT(*) AS order_count, COALESCE(SUM(total),0) AS total
      FROM all_sales GROUP BY payment_method ORDER BY total DESC
    `),
    db.execute(sql`
      SELECT
        item->>'category' AS category,
        COUNT(*) AS item_count,
        SUM((item->>'price')::numeric * (item->>'quantity')::numeric)::numeric AS total
      FROM pos_orders o
      CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
      WHERE o.created_at::date >= ${startDate}::date AND o.created_at::date <= ${endDate}::date
      GROUP BY category ORDER BY total DESC LIMIT 15
    `),
  ]);
  return {
    totals: totals.rows[0] as any,
    byChannel: byChannel.rows as any[],
    byMethod: byMethod.rows as any[],
    byCategory: byCategory.rows as any[],
  };
}

function buildEmailHtml(
  type: 'Monthly' | 'Yearly',
  label: string,
  data: Awaited<ReturnType<typeof querySalesData>>,
) {
  const { totals, byChannel, byMethod, byCategory } = data;
  const totalRevenue = Number(totals.total ?? 0);
  const totalOrders  = Number(totals.order_count ?? 0);
  const avgTicket    = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const row = (label: string, value: string, muted = false) =>
    `<tr>
      <td style="padding:4px 12px 4px 0;color:${muted ? '#888' : '#222'};white-space:nowrap;">${label}</td>
      <td style="padding:4px 0;text-align:right;font-weight:600;color:#111;white-space:nowrap;">${value}</td>
    </tr>`;

  const section = (title: string, content: string) =>
    `<div style="margin:20px 0;padding:16px;background:#f9f9f9;border-left:4px solid #1a56db;border-radius:4px;">
      <div style="font-weight:700;font-size:13px;color:#1a56db;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">${title}</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${content}</table>
    </div>`;

  const channelRows = byChannel.map((c: any) =>
    row(`${c.channel === 'pos' ? '🏪 In-Store POS' : '🌐 Online'}`, `${fmt(c.total)} (${Number(c.order_count)} orders)`)
  ).join('');

  const methodRows = byMethod.map((m: any) =>
    row(PAYMENT_LABELS[m.payment_method] ?? m.payment_method, `${fmt(m.total)} · ${Number(m.order_count)} txns`)
  ).join('');

  const catRows = byCategory.slice(0, 10).map((c: any) =>
    row(c.category || 'Uncategorized', `${fmt(c.total)} (${pct(Number(c.total), totalRevenue)})`)
  ).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#eef2f7;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    <div style="background:#111827;padding:24px 28px;color:#fff;">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;">PilotHouse</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px;">${type} Sales Report</div>
      <div style="font-size:15px;color:#d1d5db;margin-top:2px;">${label}</div>
    </div>

    <div style="padding:24px 28px;">

      <div style="display:flex;gap:16px;margin-bottom:4px;">
        <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:14px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#15803d;">${fmt(totalRevenue)}</div>
          <div style="font-size:12px;color:#166534;margin-top:2px;">Total Revenue</div>
        </div>
        <div style="flex:1;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:14px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#1d4ed8;">${totalOrders}</div>
          <div style="font-size:12px;color:#1e40af;margin-top:2px;">Total Orders</div>
        </div>
        <div style="flex:1;background:#fefce8;border:1px solid #fde68a;border-radius:6px;padding:14px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#92400e;">${fmt(avgTicket)}</div>
          <div style="font-size:12px;color:#78350f;margin-top:2px;">Avg Ticket</div>
        </div>
      </div>

      ${section('Revenue Summary', `
        ${row('Subtotal', fmt(totals.subtotal ?? 0))}
        ${row('Tax Collected', fmt(totals.tax ?? 0))}
        ${row('Gross Revenue', fmt(totalRevenue), false)}
      `)}

      ${byChannel.length > 0 ? section('By Sales Channel', channelRows) : ''}
      ${byMethod.length > 0 ? section('By Payment Method', methodRows) : ''}
      ${byCategory.length > 0 ? section('Top Categories (In-Store POS)', catRows) : ''}

    </div>

    <div style="padding:14px 28px;background:#f3f4f6;text-align:center;font-size:11px;color:#6b7280;">
      Generated ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })} CST
      &nbsp;·&nbsp; PilotHouse
    </div>
  </div>
</body></html>`;
}

export async function sendMonthlySalesReport(
  recipientEmails: string[],
  specificMonth?: string, // YYYY-MM format
): Promise<void> {
  if (!recipientEmails.length) throw new Error('No recipient emails provided');

  const { client, fromEmail } = await getUncachableSendGridClient();

  const now = new Date();
  let year: number, month: number;
  if (specificMonth) {
    [year, month] = specificMonth.split('-').map(Number);
  } else {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    year  = prev.getFullYear();
    month = prev.getMonth() + 1;
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay   = new Date(year, month, 0).getDate();
  const endDate   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const data  = await querySalesData(startDate, endDate);
  const label = periodLabel('monthly', startDate, endDate);
  const html  = buildEmailHtml('Monthly', label, data);

  await client.request({
    url: '/v3/mail/send',
    method: 'POST',
    body: {
      personalizations: [{ to: recipientEmails.map(email => ({ email })) }],
      from: { email: fromEmail },
      subject: `Monthly Sales Report — ${label}`,
      content: [{ type: 'text/html', value: html }],
    },
  });
}

export async function sendYearlySalesReport(
  recipientEmails: string[],
  specificYear?: number,
): Promise<void> {
  if (!recipientEmails.length) throw new Error('No recipient emails provided');

  const { client, fromEmail } = await getUncachableSendGridClient();

  const year = specificYear ?? (new Date().getFullYear() - 1);
  const startDate = `${year}-01-01`;
  const endDate   = `${year}-12-31`;

  const data  = await querySalesData(startDate, endDate);
  const label = String(year);
  const html  = buildEmailHtml('Yearly', label, data);

  await client.request({
    url: '/v3/mail/send',
    method: 'POST',
    body: {
      personalizations: [{ to: recipientEmails.map(email => ({ email })) }],
      from: { email: fromEmail },
      subject: `Annual Sales Report — ${label}`,
      content: [{ type: 'text/html', value: html }],
    },
  });
}
