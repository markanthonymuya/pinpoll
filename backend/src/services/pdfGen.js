const PDFDocument = require('pdfkit');

function generatePollPDF(pollData) {
  return new Promise((resolve, reject) => {
    const { poll, options, events } = pollData;
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc.fontSize(20).text('PinPoll — Results Report', { align: 'center' });
    doc.moveDown();

    // Poll info
    doc.fontSize(14).text(`Topic: ${poll.topic}`);
    doc.fontSize(11).text(`Code: ${poll.code}`);
    doc.text(`Created: ${new Date(poll.created_at).toISOString()}`);
    if (poll.closed_at) doc.text(`Closed: ${new Date(poll.closed_at).toISOString()}`);
    doc.moveDown();

    // Options
    doc.fontSize(14).text('Results', { underline: true });
    doc.moveDown(0.5);
    options.forEach((opt) => {
      doc.fontSize(11).text(`${opt.name}: ${opt.vote_count} votes (${opt.percentage.toFixed(1)}%)`);
    });
    doc.moveDown();

    // Event log
    doc.fontSize(14).text('Vote Event Log', { underline: true });
    doc.moveDown(0.5);
    if (events.length === 0) {
      doc.fontSize(10).text('No votes recorded.');
    } else {
      events.forEach((evt) => {
        const ts = new Date(evt.timestamp).toISOString();
        doc.fontSize(9).text(`[${ts}] ${evt.source} → ${evt.option_name}`);
      });
    }
    doc.moveDown();

    // Footer
    doc.fontSize(9).fillColor('gray')
      .text('Data exported from PinPoll for research and educational purposes.', { align: 'center' });

    doc.end();
  });
}

module.exports = { generatePollPDF };
