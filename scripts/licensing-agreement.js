#!/usr/bin/env node
/*
 * Lucky Cat Mahjong — IP & Merchandise Licensing Agreement PDF generator.
 *
 * Renders the licensing agreement to a paginated A4 PDF with a running footer
 * (agreement title on the left, page number on the right).
 *
 * Usage:
 *   node scripts/licensing-agreement.js [output.pdf]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const FOOTER_TITLE =
  'Intellectual Property & Merchandise Licensing Agreement (Lucky Cat Mahjong)';

const ROOT = path.join(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'assets');

const OUTPUT = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ASSETS_DIR, 'Licensing_Agreement_Lucky_Cat_Mahjong.pdf');

/* ------------------------------------------------------------------ *
 * Document
 * ------------------------------------------------------------------ */

const CSS = `
    *, *::before, *::after {
        box-sizing: border-box;
    }
    body {
        margin: 0;
        padding: 0;
        font-family: 'Times New Roman', Times, serif;
        font-size: 11pt;
        line-height: 1.6;
        color: #111;
        background-color: #fff;
    }
    .header-container {
        border-bottom: 3px double #2c3e50;
        padding-bottom: 12px;
        margin-bottom: 30px;
        text-align: center;
    }
    h1 {
        font-size: 18pt;
        text-transform: uppercase;
        margin: 0 0 6px 0;
        letter-spacing: 1px;
        color: #1a252f;
    }
    .subtitle {
        font-size: 12pt;
        font-weight: bold;
        font-style: italic;
        margin: 0;
        color: #555;
    }
    p {
        margin: 0 0 14px 0;
        text-align: justify;
    }
    .preamble-table {
        display: table;
        width: 100%;
        margin-bottom: 20px;
    }
    .preamble-row {
        display: table-row;
    }
    .preamble-label {
        display: table-cell;
        font-weight: bold;
        width: 120px;
        padding: 4px 0;
        vertical-align: top;
    }
    .preamble-value {
        display: table-cell;
        padding: 4px 0;
        vertical-align: top;
    }
    h2 {
        font-size: 12pt;
        text-transform: uppercase;
        margin: 24px 0 10px 0;
        border-bottom: 1px solid #ccc;
        padding-bottom: 3px;
        color: #1a252f;
        page-break-after: avoid;
    }
    .section-number {
        font-weight: bold;
        margin-right: 5px;
    }
    ol, ul {
        margin: 0 0 14px 0;
        padding-left: 24px;
    }
    li {
        margin-bottom: 6px;
        text-align: justify;
    }
    .signatures-container {
        margin-top: 60px;
        page-break-inside: avoid;
    }
    .sig-table {
        display: table;
        width: 100%;
        margin-top: 40px;
    }
    .sig-row {
        display: table-row;
    }
    .sig-cell {
        display: table-cell;
        width: 45%;
        padding-bottom: 50px;
        vertical-align: top;
    }
    .sig-spacer {
        display: table-cell;
        width: 10%;
    }
    .sig-line {
        border-top: 1px solid #111;
        margin-top: 120px; /* Space for handwritten signature */
        padding-top: 10px;
    }
`;

const BODY = `
<div class="header-container">
    <h1>Intellectual Property & Merchandise Licensing Agreement</h1>
    <div class="subtitle">Comprehensive Commercial, Digital & Physical IP License</div>
</div>

<p>This Intellectual Property and Merchandise Licensing Agreement (the "Agreement") is entered into and made effective as of the date of the last signature below (the "Effective Date"), by and between the following participating parties:</p>

<div class="preamble-table">
    <div class="preamble-row">
        <div class="preamble-label">LICENSOR:</div>
        <div class="preamble-value"><strong>Lucky Cat Mahjong</strong>, with its principal place of business managed at luckycatmahjong.com ("Licensor").</div>
    </div>
    <div class="preamble-row">
        <div class="preamble-label">LICENSEE:</div>
        <div class="preamble-value">__________________________________________________, with its principal place of business located at __________________________________________________ ("Licensee").</div>
    </div>
</div>

<p><strong>WHEREAS</strong>, Licensor owns and retains all rights, title, and interest in and to the proprietary trademarks, logos, brand names, artwork, digital designs, software, media, and intellectual property associated with "Lucky Cat Mahjong" (collectively referred to as the "Licensed Property"); and</p>
<p><strong>WHEREAS</strong>, Licensee desires to obtain a comprehensive license to utilize the Licensed Property in connection with both physical merchandise and digital applications, electronic media, virtual goods, and online distributions;</p>
<p><strong>NOW, THEREFORE</strong>, in consideration of the mutual covenants, terms, conditions, and statements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the parties agree as follows:</p>

<h2><span class="section-number">1.</span> Grant of License</h2>
<p>Subject to the terms and conditions of this Agreement, Licensor hereby grants to Licensee a non-exclusive, non-transferable, revocable license during the Term (as defined herein) to utilize the Licensed Property in connection with the creation, production, distribution, marketing, and commercial exploitation of both physical and digital offerings (the "Licensed Products"), specifically including:</p>
<ul>
    <li><strong>Physical Merchandise:</strong> Apparel (t-shirts, sweatshirts, hoodies), headwear (hats, caps), novelty items (stickers, decals, patches), and specialized gaming equipment (mahjong tile sets and mahjong mats);</li>
    <li><strong>Digital Goods & Virtual Assets:</strong> Downloadable digital art, electronic wallpapers, printable files, virtual goods, digital collectibles, and assets utilized within software, video games, or metaverse environments;</li>
    <li><strong>Digital Media & Content:</strong> Inclusion within digital media productions, streaming content, online platforms, software applications, websites, and electronic marketing campaigns.</li>
</ul>

<h2><span class="section-number">2.</span> Territory and Channels</h2>
<p>The geographic territory for the license granted herein shall be worldwide (the "Territory"). Licensee is authorized to distribute and commercialize the Licensed Products through standard commercial channels, including authorized physical retail stores, e-commerce platforms, digital marketplaces, application stores, and official gaming tournament exhibitions, subject to the brand guidelines established by Licensor.</p>

<h2><span class="section-number">3.</span> Consideration, Fees, and Royalty Rates</h2>
<p>In consideration for the license granted herein, Licensee agrees to pay Licensor the standard commercial rates detailed below:</p>
<ol type="a">
    <li><strong>One-Time Licensing Fee:</strong> Licensee shall pay to Licensor a non-refundable, non-recoupable flat execution fee of <strong>$2,500.00 USD</strong> (Two Thousand Five Hundred Dollars), due and payable immediately upon the signing of this Agreement. No production or digital deployment using the Licensed Property shall commence prior to the receipt of this payment.</li>
    <li><strong>Royalty Percentage Rate:</strong> Licensee shall pay to Licensor an industry-standard royalty of <strong>10% (ten percent)</strong> of the Gross Revenue derived from all sales, subscriptions, licensing, or commercial monetization of the Licensed Products (whether physical or digital). "Gross Revenue" shall mean the total invoice or transaction price billed to customers less standard deductions restricted solely to actual returns, platform processing fees, third-party distribution fees, and applicable sales taxes. No deductions shall be made for manufacturing, digital hosting, server maintenance, advertising, selling commissions, or overhead expenses.</li>
</ol>

<h2><span class="section-number">4.</span> Accounting Statements and Payout Schedule</h2>
<ol type="a">
    <li><strong>Quarterly Statements:</strong> Within thirty (30) days following the conclusion of each calendar quarter (ending March 31, June 30, September 30, and December 31), Licensee shall deliver to Licensor a complete and accurate itemized statement detailing the quantity of physical and digital units distributed or sold, gross receipts, itemized permitted deductions, and the net royalty due.</li>
    <li><strong>Payment Remittance:</strong> All royalties due for each calendar quarter shall be remitted concurrently with the delivery of the corresponding statement. Payments shall be made in USD via wire transfer or electronic payment to the bank account designated by Licensor.</li>
</ol>

<h2><span class="section-number">5.</span> Quality Control and Brand Standards</h2>
<p>Licensee acknowledges the high reputation and goodwill associated with Lucky Cat Mahjong. To preserve this asset, the following strict quality control conditions apply:</p>
<ol type="a">
    <li><strong>Pre-Production & Pre-Release Approval:</strong> Before launching any physical manufacturing batch, digital application release, virtual asset drop, or media campaign, Licensee shall submit actual production samples, prototypes, UI mockups, digital files, and marketing layouts to Licensor for explicit written approval. Licensor shall have sole discretion to approve or reject items based on aesthetic quality, code integrity, and brand consistency.</li>
    <li><strong>Maintenance of Standards:</strong> Licensee warrants that all physical and digital offerings shall strictly conform to the approved samples, maintain high performance standards, and comply with all applicable regional consumer safety, data protection, and intellectual property laws.</li>
</ol>

<h2><span class="section-number">6.</span> Term and Termination for Cause</h2>
<ol type="a">
    <li><strong>Term:</strong> This Agreement shall commence on the Effective Date and shall remain in effect for a period of two (2) years, unless terminated earlier in accordance with the provisions herein.</li>
    <li><strong>Termination for Royalty Delinquency:</strong> Timely payment is a material condition of this Agreement. If Licensee fails to pay royalties or submit required accounting statements within fifteen (15) days past the scheduled due date, Licensor may issue a written notice of default. If Licensee fails to fully cure the delinquency within <strong>fifteen (15) calendar days</strong> from the receipt of such notice, Licensor shall have the right to terminate this Agreement immediately upon written notice.</li>
    <li><strong>Termination for Failure to Maintain Quality Standards:</strong> If any distributed physical or digital products fall below the approved samples, or if Licensee alters designs without written consent, Licensor may issue a written notice specifying the failure. Licensee shall have <strong>thirty (30) calendar days</strong> to fully remedy the defect or withdraw the substandard stock/digital content. Failure to remedy to the complete satisfaction of Licensor within this window shall constitute grounds for immediate termination of the license.</li>
</ol>

<h2><span class="section-number">7.</span> Intellectual Property Rights</h2>
<p>Licensee recognizes that all titles, copyrights, trademarks, goodwill, and ownership rights regarding the Lucky Cat Mahjong brand and its digital/physical assets belong exclusively to Licensor. Licensee shall not acquire, nor claim, any right, title, or interest in the Licensed Property other than the limited operational license granted under this Agreement.</p>

<h2><span class="section-number">8.</span> Governing Law and Disputes</h2>
<p>This Agreement shall be construed, interpreted, and governed in accordance with the laws of the State of New York, without giving effect to conflict of laws principles. Any legal action or proceeding arising out of or relating to this Agreement shall be brought exclusively in the courts located in New York, New York.</p>

<div class="signatures-container">
    <p><strong>IN WITNESS WHEREOF</strong>, the parties hereto have executed this Intellectual Property and Merchandise Licensing Agreement as of the dates written below.</p>

    <div class="sig-table">
        <div class="sig-row">
            <div class="sig-cell">
                <strong>LICENSOR:</strong><br>
                Lucky Cat Mahjong<br><br>
                <div class="sig-line">By: Jorge Yau Lee, Founder</div>
                <div style="margin-top: 10px;">Date: ________________________</div>
            </div>
            <div class="sig-spacer"></div>
            <div class="sig-cell">
                <strong>LICENSEE:</strong><br>
                ________________________________<br><br>
                <div class="sig-line">By: Authorized Representative</div>
                <div style="margin-top: 10px;">Date: ________________________</div>
            </div>
        </div>
    </div>
</div>
`;

function buildHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>${CSS}</style>
</head>
<body>
${BODY}
</body>
</html>`;
}

/*
 * Chromium does not support WeasyPrint's @page margin boxes, so the running
 * footer (agreement title + page number) is rendered via Puppeteer templates.
 */
const FOOTER_TEMPLATE = `
  <div style="width: 100%; font-family: 'Times New Roman', Times, serif; padding: 0 15mm;">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 9pt; color: #777;">${FOOTER_TITLE}</span>
      <span style="font-size: 10pt; color: #555;" class="pageNumber"></span>
    </div>
  </div>
`;

async function main() {
  const html = buildHtml();

  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    await page.pdf({
      path: OUTPUT,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: FOOTER_TEMPLATE,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    });
  } finally {
    await browser.close();
  }

  console.log('File generated successfully: ' + OUTPUT);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
