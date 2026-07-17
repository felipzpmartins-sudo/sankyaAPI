#!/usr/bin/env node

/**
 * Script para converter SCHEMA_SYNC_SANKHYA.html para PDF
 * Uso: node html-to-pdf.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

async function convertHtmlToPdf() {
  const htmlFile = path.join(__dirname, 'SCHEMA_SYNC_SANKHYA.html');
  const pdfFile = path.join(__dirname, 'SCHEMA_SYNC_SANKHYA.pdf');
  
  if (!fs.existsSync(htmlFile)) {
    console.error('❌ Arquivo SCHEMA_SYNC_SANKHYA.html não encontrado!');
    process.exit(1);
  }
  
  console.log('📄 Convertendo HTML para PDF...');
  console.log(`   Entrada: ${htmlFile}`);
  console.log(`   Saída: ${pdfFile}`);
  
  // Opção 1: Usar Chrome DevTools Protocol via Puppeteer
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto(`file://${htmlFile}`, { waitUntil: 'networkidle0' });
    
    await page.pdf({
      path: pdfFile,
      format: 'A4',
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '15mm',
        right: '15mm'
      },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div style="font-size: 10px; width: 100%; padding: 5px; text-align: center; border-bottom: 1px solid #ccc;"><span style="font-weight: bold;">Schema de Sincronização Sankhya → SQLite</span></div>',
      footerTemplate: '<div style="font-size: 9px; width: 100%; padding: 5px; text-align: center; border-top: 1px solid #ccc;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
    });
    
    await browser.close();
    console.log('✅ PDF gerado com sucesso!');
    console.log(`📌 Arquivo: ${pdfFile}`);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' || error.message.includes('puppeteer')) {
      console.log('\n⚠️  Puppeteer não instalado. Tentando alternativa...\n');
      
      console.log('📋 ALTERNATIVA: Use seu navegador para salvar como PDF');
      console.log('   1. Abra: ' + htmlFile);
      console.log('   2. Pressione: Ctrl + P (Windows) ou Cmd + P (Mac)');
      console.log('   3. Em "Destino", selecione: "Salvar como PDF"');
      console.log('   4. Nome: SCHEMA_SYNC_SANKHYA.pdf');
      console.log('   5. Pasta: ' + __dirname);
      console.log('   6. Clique em "Salvar"\n');
      
      console.log('Ou instale Puppeteer com:');
      console.log('   npm install -D puppeteer');
    } else {
      console.error('❌ Erro:', error.message);
    }
    process.exit(1);
  }
}

convertHtmlToPdf().catch(console.error);
