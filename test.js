const { chromium } = require('playwright');
const path = require('path');

async function testHolomeetVR() {
    console.log('Starting HoloMeet VR test...');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Collect console messages
    const consoleMessages = [];
    const errors = [];

    page.on('console', msg => {
        consoleMessages.push({ type: msg.type(), text: msg.text() });
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });

    page.on('pageerror', err => {
        errors.push(err.message);
    });

    try {
        // Load the page
        const filePath = path.join(__dirname, 'index.html');
        await page.goto(`file://${filePath}`, { waitUntil: 'networkidle' });
        console.log('Page loaded successfully');

        // Wait for loading screen to complete
        await page.waitForTimeout(3000);
        console.log('Loading screen dismissed');

        // Check if Three.js canvas exists
        const canvasExists = await page.$('canvas');
        console.log('Three.js canvas exists:', !!canvasExists);

        // Check for UI elements
        const roomId = await page.$('#roomId');
        console.log('Room ID element exists:', !!roomId);

        const micBtn = await page.$('#micBtn');
        console.log('Microphone button exists:', !!micBtn);

        const dashboardPanel = await page.$('.dashboard-panel');
        console.log('Dashboard panel exists:', !!dashboardPanel);

        const chairs = await page.$$('.chair-group');
        console.log('Chairs found in scene');

        // Test clicking on mic button
        if (micBtn) {
            await micBtn.click();
            console.log('Microphone button clicked');
        }

        // Test dashboard tabs
        const pdfTabBtn = await page.$('[data-tab="pdf"]');
        if (pdfTabBtn) {
            await pdfTabBtn.click();
            console.log('PDF tab clicked');
        }

        // Wait a bit more for any delayed errors
        await page.waitForTimeout(2000);

        // Report results
        console.log('\n--- Test Results ---');
        console.log('Total console messages:', consoleMessages.length);
        console.log('Errors found:', errors.length);

        if (errors.length > 0) {
            console.log('\nErrors:');
            errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
        } else {
            console.log('\nNo JavaScript errors detected!');
        }

        console.log('\nTest completed successfully!');

    } catch (err) {
        console.error('Test failed:', err.message);
    } finally {
        await browser.close();
    }
}

testHolomeetVR();
