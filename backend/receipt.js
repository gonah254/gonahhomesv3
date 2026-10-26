(function (root) {
        function openReceipt(id, booking) {
            const statusColors = { confirmed:'#2e7d32', pending:'#e65100', cancelled:'#c62828', completed:'#1565c0' };
            const sc = statusColors[booking.status] || '#555';
            const isInvoice = booking.status === 'pending';
            const docTitle = isInvoice ? 'Invoice' : 'Receipt';

            const paymentBlock = isInvoice ? `
              <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:0.8rem 1rem;margin-top:0.75rem;">
                <p style="margin:0 0 0.3rem;font-weight:700;color:#e65100;font-size:0.85rem;"><i class="fas fa-file-invoice"></i> Payment Due</p>
                <p style="margin:0;font-size:0.83rem;"><strong>Amount Due:</strong> KSh ${Number(booking.total||0).toLocaleString()}</p>
                <p style="margin:0;font-size:0.83rem;"><strong>Paybill Number:</strong> 247247</p>
                <p style="margin:0;font-size:0.83rem;"><strong>Account Number:</strong> 466999</p>
                <p style="margin:0;font-size:0.83rem;"><strong>Business Name:</strong> Gonah Nexus</p>
                <p style="margin:0.25rem 0 0;font-size:0.75rem;color:#e65100;">Please complete payment within 24 hours to confirm this booking.</p>
              </div>
              <div style="background:#f5f5f5;border-radius:8px;padding:0.75rem 1rem;margin-top:0.6rem;">
                <p style="margin:0 0 0.25rem;font-weight:700;font-size:0.82rem;color:#555;"><i class="fas fa-info-circle"></i> Payment Rules</p>
                <ul style="margin:0;padding-left:1.1rem;font-size:0.78rem;color:#666;line-height:1.6;">
                  <li>Payment must be made within 24 hours of booking.</li>
                  <li>Use your Booking ID as the payment reference.</li>
                  <li>Free cancellation up to 48 hours before check-in.</li>
                  <li>Late cancellations forfeit 50% of the total amount.</li>
                  <li>All payments are non-refundable after check-in.</li>
                </ul>
              </div>` :
              (booking.status === 'confirmed' && booking.paymentMethod) ? `
              <div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:0.8rem 1rem;margin-top:0.75rem;">
                <p style="margin:0 0 0.3rem;font-weight:700;color:#2e7d32;font-size:0.85rem;">✔ Payment Confirmed</p>
                <p style="margin:0;font-size:0.83rem;"><strong>Method:</strong> ${booking.paymentMethod}</p>
                <p style="margin:0;font-size:0.83rem;"><strong>Reference:</strong> ${booking.transactionRef || '—'}</p>
                <p style="margin:0;font-size:0.83rem;"><strong>Amount Paid:</strong> KSh ${Number(booking.amountPaid||0).toLocaleString()}</p>
                ${booking.paymentNotes ? `<p style="margin:0;font-size:0.83rem;"><strong>Notes:</strong> ${booking.paymentNotes}</p>` : ''}
              </div>` : '';

            const cancelBlock = (booking.status === 'cancelled' && booking.cancellationReason) ? `
              <div style="background:#fce4ec;border:1px solid #f48fb1;border-radius:8px;padding:0.8rem 1rem;margin-top:0.75rem;">
                <p style="margin:0 0 0.3rem;font-weight:700;color:#c62828;font-size:0.85rem;">✖ Booking Cancelled</p>
                <p style="margin:0;font-size:0.83rem;"><strong>Reason:</strong> ${booking.cancellationReason}</p>
              </div>` : '';

            const dateIssued = new Date().toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'});

            const html = `<!DOCTYPE html><html><head>
              <title>${docTitle} — ${id}</title><meta charset="utf-8">
              <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
              <style>*{box-sizing:border-box}body{margin:0;padding:28px;font-family:'Poppins',sans-serif;background:#fff;max-width:520px;}button{display:none!important}@media print{body{padding:0}}</style>
            </head><body>
              <div style="border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.13);">
                <div style="background:linear-gradient(135deg,#800000,#b30000);color:#fff;padding:1.4rem 1.5rem 1rem;text-align:center;">
                  <div style="width:100px;height:100px;border-radius:50%;background:#fff;margin:0 auto 0.7rem;display:flex;align-items:center;justify-content:center;overflow:hidden;border:3px solid #ffd600;">
                    <img src="https://gonahhomes.com/gonah-logo.png" alt="Gonah Homes Logo" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';">
                  </div>
                  <h2 style="margin:0;font-size:1.1rem;letter-spacing:2px;font-weight:700;">GONAH HOMES</h2>
                  <p style="margin:0.1rem 0 0;opacity:0.9;font-size:0.72rem;">A brand of Gonah Nexus · Kenya</p>
                  <p style="margin:0.45rem 0 0;color:#ffd600;font-size:0.8rem;font-weight:600;letter-spacing:0.5px;">Spaces made for living</p>
                </div>
                <div style="background:#fff8e1;border-bottom:2px dashed #ffd600;padding:0.85rem 1.5rem;text-align:center;">
                  <p style="margin:0;font-size:0.68rem;color:#999;text-transform:uppercase;letter-spacing:2px;">${docTitle}</p>
                  <p style="margin:0.15rem 0;font-size:1.8rem;font-family:monospace;font-weight:700;color:#800000;letter-spacing:4px;">${id}</p>
                  <span style="background:${sc};color:#fff;padding:3px 12px;border-radius:20px;font-size:0.73rem;font-weight:600;">${(booking.status||'pending').toUpperCase()}</span>
                </div>
                <div style="background:#fff;padding:1rem 1.5rem;">
                  <table style="width:100%;border-collapse:collapse;font-size:0.86rem;">
                    <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:0.45rem 0;color:#888;width:42%;">Guest</td><td style="font-weight:600;">${booking.name||'—'}</td></tr>
                    <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:0.45rem 0;color:#888;">Email</td><td style="font-weight:600;">${booking.email||'—'}</td></tr>
                    <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:0.45rem 0;color:#888;">Property</td><td style="font-weight:600;">${booking.house||'—'}</td></tr>
                    <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:0.45rem 0;color:#888;">Check-in</td><td style="font-weight:600;">${booking.checkin||'—'}</td></tr>
                    <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:0.45rem 0;color:#888;">Check-out</td><td style="font-weight:600;">${booking.checkout||'—'} (10:00 AM)</td></tr>
                    ${booking.total ? `<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:0.45rem 0;color:#888;">${isInvoice?'Amount Due':'Total'}</td><td style="font-weight:600;">KSh ${Number(booking.total).toLocaleString()}</td></tr>` : ''}
                    <tr><td style="padding:0.45rem 0;color:#888;">Date Issued</td><td style="font-weight:600;">${dateIssued}</td></tr>
                  </table>
                  ${paymentBlock}${cancelBlock}
                </div>
                <div style="background:#f9f9f9;border-top:1px solid #eee;padding:0.65rem 1.5rem;text-align:center;">
                  <p style="margin:0 0 0.45rem;font-size:0.82rem;font-weight:700;color:#800000;">Thank you for choosing Gonah Homes!</p>
                  <p style="margin:0;font-size:0.72rem;color:#555;">📧 <a href="mailto:support@gonahhomes.com" style="color:inherit;">support@gonahhomes.com</a> &nbsp;·&nbsp; 📞 +254 799 466 723</p>
                  <p style="margin:0.3rem 0 0;font-size:0.68rem;color:#777;">Gonah Nexus · Paybill 247247 · Account 466999</p>
                  <p style="margin:0.35rem 0 0;font-size:0.65rem;color:#800000;font-weight:600;">Spaces made for living</p>
                </div>
              </div>
              <script>setTimeout(()=>{window.print();},800);<\/script>
            </body></html>`;

            const win = window.open('','_blank','width=560,height=820');
            if (!win) { alert('Please allow pop-ups to download the receipt.'); return; }
            win.document.write(html);
            win.document.close();
        }
  root.GonahReceipt = { open: openReceipt };
})(typeof window !== "undefined" ? window : globalThis);
