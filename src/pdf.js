const PDFDocument = require('pdfkit');
const fs = require('fs');
const { TZ } = require('../config');

function generateNewsPDF(articles, edition) {
  return new Promise((resolve, reject) => {
    const filename = `/tmp/nomo-news-${edition.toLowerCase().replace(' ', '-')}-${Date.now()}.pdf`;
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(filename);
    doc.pipe(stream);

    const now = new Date().toLocaleDateString('en-SG', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: TZ
    });

    doc.rect(0, 0, doc.page.width, 120).fill('#1a1a2e');
    doc.fillColor('#FFD700').fontSize(32).font('Helvetica-Bold')
      .text('NOMO NEWS', 50, 25, { align: 'center' });
    doc.fillColor('#ffffff').fontSize(14).font('Helvetica')
      .text(`${edition}  |  ${now}`, 50, 68, { align: 'center' });
    doc.moveTo(50, 130).lineTo(doc.page.width - 50, 130).strokeColor('#FFD700').lineWidth(2).stroke();

    let y = 150;

    articles.slice(0, 15).forEach((article, i) => {
      if (y > 720) {
        doc.addPage();
        y = 50;
      }
      doc.rect(50, y, 24, 24).fill('#FFD700');
      doc.fillColor('#1a1a2e').fontSize(12).font('Helvetica-Bold')
        .text(`${i + 1}`, 50, y + 6, { width: 24, align: 'center' });

      const title = article.title || 'No title available';
      doc.fillColor('#1a1a2e').fontSize(13).font('Helvetica-Bold')
        .text(title, 85, y, { width: doc.page.width - 135 });
      y += doc.heightOfString(title, { width: doc.page.width - 135, font: 'Helvetica-Bold', fontSize: 13 }) + 4;

      if (article.description) {
        const desc = article.description.length > 150 ? article.description.substring(0, 150) + '...' : article.description;
        doc.fillColor('#555555').fontSize(10).font('Helvetica')
          .text(desc, 85, y, { width: doc.page.width - 135 });
        y += doc.heightOfString(desc, { width: doc.page.width - 135, fontSize: 10 }) + 4;
      }

      doc.fillColor('#999999').fontSize(9).font('Helvetica-Oblique')
        .text(`Source: ${article.source && article.source.name ? article.source.name : 'Unknown'}`, 85, y);
      y += 16;

      doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
      y += 14;
    });

    doc.rect(0, doc.page.height - 50, doc.page.width, 50).fill('#1a1a2e');
    doc.fillColor('#FFD700').fontSize(10).font('Helvetica-Bold')
      .text('BUILT BY MIN', 50, doc.page.height - 32, { align: 'center' });

    doc.end();
    stream.on('finish', () => resolve(filename));
    stream.on('error', reject);
  });
}

module.exports = { generateNewsPDF };
