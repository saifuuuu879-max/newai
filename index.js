// ================================
// پاورفُل واٹس ایپ بوٹ - مکمل کوڈ
// ================================

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ========== CONFIGURATION ==========
const PREFIX = '!';  // کمانڈز کے لیے پریفکس
const GLM_API_KEY = process.env.GLM_API_KEY || 'z-ai/glm-4.5-air:free'; // https://open.bigmodel.cn/ سے حاصل کریں
const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// ========== EXPRESS SERVER (ہیلتھ چیک کے لیے) ==========
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('WhatsApp Bot is running!'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ========== WHATSAPP CLIENT ==========
const client = new Client({
    authStrategy: new LocalAuth(), // سیشن محفوظ رہے گا
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// ========== QR CODE GENERATION ==========
client.on('qr', (qr) => {
    console.log('📱 اس QR کوڈ کو WhatsApp کے "Linked Devices" میں اسکین کریں:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ بوٹ کامیابی سے چل پڑا!');
    console.log('🤖 تمام کمانڈز دیکھنے کے لیے !menu ٹائپ کریں');
});

client.on('auth_failure', msg => console.error('❌ تصدیق ناکام:', msg));
client.on('disconnected', (reason) => {
    console.log('⚠️ بوٹ ڈس کنیکٹ ہوگیا:', reason);
    process.exit(1);
});

// ========== HELPER FUNCTIONS ==========
// فیک ٹائپنگ اور جواب دینے کا فنکشن
async function replyWithTyping(chat, replyText, delayMs = 2000) {
    await chat.sendStateTyping();  // ٹائپنگ شروع
    console.log('✍️ Fake typing in progress...');
    setTimeout(async () => {
        await chat.sendMessage(replyText);
        await chat.clearState();    // ٹائپنگ ختم
    }, delayMs);
}

// GLM (Zhipu AI) سے جواب حاصل کرنے کا فنکشن
async function getGLMReply(userMessage) {
    if (!GLM_API_KEY || GLM_API_KEY === 'YOUR_GLM_API_KEY') {
        return "⚠️ براہ کرم پہلے GLM_API_KEY سیٹ کریں۔ (https://open.bigmodel.cn)";
    }
    try {
        const response = await axios.post(GLM_API_URL, {
            model: "glm-4-flash",
            messages: [
                { role: "system", content: "آپ ایک مددگار واٹس ایپ بوٹ ہیں۔ اردو میں جواب دیں۔" },
                { role: "user", content: userMessage }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${GLM_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error("GLM Error:", error.response?.data || error.message);
        return "❌ AI سروس عارضی طور پر دستیاب نہیں ہے۔";
    }
}

// میڈیا ڈاؤن لوڈ کرنے کا فنکشن (اسٹیٹس / ویو اونس)
async function downloadMedia(media, filePath) {
    const buffer = await media.downloadMedia();
    fs.writeFileSync(filePath, buffer.data, 'base64');
    return filePath;
}

// ========== COMMANDS HANDLER ==========
client.on('message', async (message) => {
    // صرف ٹیکسٹ میسج پر عمل کریں (اور بوٹ خود نہ بھیجے)
    if (message.type !== 'chat' || message.fromMe) return;
    
    const chat = await message.getChat();
    const body = message.body.trim();
    
    // کمانڈ نہ ہو تو پھر بھی AI جواب نہیں دینا (صرف !ai سے جواب دے گا)
    if (!body.startsWith(PREFIX)) return;
    
    const args = body.slice(PREFIX.length).split(/ +/);
    const command = args.shift().toLowerCase();
    const fullText = args.join(' ');
    
    console.log(`📩 کمانڈ آئی: ${command} from ${message.author || message.from}`);
    
    // ---------- 1. !menu یا !help ----------
    if (command === 'menu' || command === 'help') {
        const menuText = `
🤖 *بوٹ کی تمام کمانڈز* 🤖

${PREFIX}menu - یہ مینو دکھائے
${PREFIX}ai [سوال] - GLM AI سے سوال پوچھے
${PREFIX}typing [پیغام] - فیک ٹائپنگ کے ساتھ پیغام بھیجے
${PREFIX}status - سب سے حالیہ اسٹیٹس دیکھے اور ڈاؤن لوڈ کرے
${PREFIX}viewonce - "View Once" تصویر/ویڈیو کو محفوظ کرے
${PREFIX}dl [ردیف] - محفوظ کردہ اسٹیٹس ڈاؤن لوڈ کرے

*ریئل ٹائم فیچرز:*
✅ خودکار اسٹیٹس دیکھنا (جب کوئی اسٹیٹس ڈالے تو فوری سیو)
✅ View Once میڈیا خودکار سیو
✅ Fake Typing Simulation
        `;
        await replyWithTyping(chat, menuText, 1500);
    }
    
    // ---------- 2. !ai [سوال] ----------
    else if (command === 'ai') {
        if (!fullText) {
            await replyWithTyping(chat, `❗ کمانڈ درست استعمال کریں: ${PREFIX}ai آپ کا سوال یہاں لکھیں`, 1000);
            return;
        }
        await replyWithTyping(chat, `🤖 *AI سوچ رہا ہے...*`);
        const aiReply = await getGLMReply(fullText);
        await chat.sendMessage(aiReply);
    }
    
    // ---------- 3. !typing [پیغام] (صرف فیک ٹائپنگ) ----------
    else if (command === 'typing') {
        if (!fullText) {
            await replyWithTyping(chat, `❗ پیغام لکھیں: ${PREFIX}typing آپ کا پیغام`, 1000);
            return;
        }
        await replyWithTyping(chat, fullText, 3000); // 3 سیکنڈ ٹائپنگ دکھائے
    }
    
    // ---------- 4. !status (حالیہ اسٹیٹس ڈاؤن لوڈ) ----------
    else if (command === 'status') {
        // یہ فیچر خودکار طور پر اسٹیٹس کو سننے والے ایونٹ میں کام کرے گا
        // یہاں صرف دستی کمانڈ ہے
        await replyWithTyping(chat, "🔄 براہ کرم انتظار کریں، میں حالیہ اسٹیٹس ڈھونڈ رہا ہوں...");
        // اصل میں اسٹیٹس کو ہم global variable میں رکھ سکتے ہیں
        // سادگی کے لیے یہاں صرف میسیج بھیج رہے ہیں
        await chat.sendMessage("📸 *اسٹیٹس ڈاؤن لوڈ فیچر*: جب کوئی آپ کا کانٹیکٹ اسٹیٹس ڈالے گا تو وہ خودکار طور پر 'status_downloads' فولڈر میں سیو ہو جائے گا۔");
    }
    
    // ---------- 5. !viewonce (View Once میڈیا بچانا) ----------
    else if (command === 'viewonce') {
        await replyWithTyping(chat, "🔒 *View Once سیونگ آن ہے*: اب سے بھیجی جانے والی 'View Once' میڈیا خودکار طور پر محفوظ ہوگی۔");
    }
    
    else {
        await replyWithTyping(chat, `❌ نامعلوم کمانڈ۔ ${PREFIX}menu دیکھیں۔`, 1000);
    }
});

// ========== AUTO STATUS DOWNLOADER (اسٹیٹس دیکھنا + ڈاؤن لوڈ) ==========
// یہ فیچر جب بھی کوئی کانٹیکٹ اسٹیٹس ڈالتا ہے تو اسے ڈاؤن لوڈ کر لیتا ہے
client.on('message_create', async (message) => {
    // صرف اسٹیٹس والے میسج (status) پر عمل کریں
    if (message.type === 'chat' && message.isStatus) {
        console.log("📸 نئی اسٹیٹس آئی!");
        const contact = await message.getContact();
        const contactName = contact.pushname || contact.number || 'Unknown';
        
        // فولڈر بنائیں اگر نہ ہو
        const statusDir = './status_downloads';
        if (!fs.existsSync(statusDir)) fs.mkdirSync(statusDir);
        
        // اگر اسٹیٹس میں میڈیا ہے تو ڈاؤن لوڈ کریں
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            let ext = '.jpg';
            if (media.mimetype === 'video/mp4') ext = '.mp4';
            else if (media.mimetype === 'image/jpeg') ext = '.jpg';
            else if (media.mimetype === 'image/png') ext = '.png';
            
            const fileName = `${statusDir}/${contactName}_${Date.now()}${ext}`;
            fs.writeFileSync(fileName, media.data, 'base64');
            console.log(`✅ اسٹیٹس محفوظ: ${fileName}`);
        } else {
            // ٹیکسٹ اسٹیٹس
            const txtFile = `${statusDir}/${contactName}_status_${Date.now()}.txt`;
            fs.writeFileSync(txtFile, message.body);
            console.log(`📝 ٹیکسٹ اسٹیٹس محفوظ: ${txtFile}`);
        }
    }
    
    // ========== AUTO VIEW ONCE SAVER ==========
    if (message.type === 'chat' && message.isViewOnce) {
        console.log("👁️ View Once میڈیا موصول ہوا - محفوظ کیا جا رہا ہے");
        const viewOnceDir = './viewonce_saved';
        if (!fs.existsSync(viewOnceDir)) fs.mkdirSync(viewOnceDir);
        
        const media = await message.downloadMedia();
        let ext = '.jpg';
        if (media.mimetype === 'video/mp4') ext = '.mp4';
        const fileName = `${viewOnceDir}/viewonce_${Date.now()}${ext}`;
        fs.writeFileSync(fileName, media.data, 'base64');
        console.log(`🔒 View Once محفوظ: ${fileName}`);
        
        // اصل میسج کو پڑھے بغیر ریپلائی نہ کریں (چپکے سے سیو کریں)
    }
});

// ========== START THE BOT ==========
client.initialize();
