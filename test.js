const { chromium } = require('playwright');

async function runTest() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        await page.goto('http://localhost:3000');
        const title = await page.title();
        console.log(`✅ Test de carga: ${title}`);
        const hasCanvas = await page.$('canvas');
        console.log(hasCanvas ? '✅ Render 3D: OK' : '❌ Render 3D: Fallo');
    } catch (e) {
        console.log('❌ El servidor no está corriendo. Usa "npm start" primero.');
    }
    await browser.close();
}
runTest();
