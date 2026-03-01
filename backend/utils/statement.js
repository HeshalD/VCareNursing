const puppeteer = require('puppeteer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

exports.generateStatementPDF = async (data) => {
    // 1. Read the HTML template
    const templatePath = path.join(__dirname, '../templates/statementTemplate.html');
    const templateHtml = fs.readFileSync(templatePath, 'utf8');

    // 2. Compile the template with Handlebars
    const template = handlebars.compile(templateHtml);
    const finalHtml = template(data);

    // 3. Launch Puppeteer
    // Note: In production (like AWS/Heroku), you often need args: ['--no-sandbox']
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();

    // 4. Set the HTML content
    await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

    // 5. Generate PDF buffer
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    });

    await browser.close();
    
    return pdfBuffer; // Returns the raw PDF file data
};