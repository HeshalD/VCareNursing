const puppeteer = require('puppeteer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

exports.generateStatementPDF = async (data) => {
    console.log("🔧 Starting PDF generation with optimized Puppeteer...");
    
    try {
        // 1. Read the HTML template
        const templatePath = path.join(__dirname, '../templates/statementTemplate.html');
        const templateHtml = fs.readFileSync(templatePath, 'utf8');

        // 2. Compile the template with Handlebars
        const template = handlebars.compile(templateHtml);
        const finalHtml = template(data);

        // 3. Launch Puppeteer with optimized settings
        console.log("🚀 Launching Puppeteer...");
        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-default-apps',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--memory-pressure-off',
                '--max_old_space_size=4096'
            ]
        });
        
        console.log("📄 Creating new page...");
        const page = await browser.newPage();

        // 4. Optimize page settings
        await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
        await page.setDefaultNavigationTimeout(10000);

        // 5. Set the HTML content with optimized wait strategy
        console.log("📝 Setting page content...");
        await page.setContent(finalHtml, { 
            waitUntil: 'domcontentloaded',  // Faster than networkidle0
            timeout: 10000  // 10 second timeout
        });

        // 6. Wait a brief moment for rendering
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 7. Generate PDF buffer with optimized settings
        console.log("📦 Generating PDF...");
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
            preferCSSPageSize: true,
            timeout: 20000,  // 20 second timeout for PDF generation
            scale: 0.8  // Slightly smaller to reduce rendering time
        });

        console.log("🔒 Closing browser...");
        await browser.close();
        
        console.log("✅ PDF generation completed successfully");
        return pdfBuffer;

    } catch (error) {
        console.error("❌ Puppeteer PDF generation failed:", error);
        throw new Error(`PDF generation failed: ${error.message}`);
    }
};